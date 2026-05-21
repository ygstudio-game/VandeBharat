"""
Frame Extractor Service — port 5003
Receives video path → OpenCV extracts every Nth frame → uploads JPEGs to Cloudinary
→ bulk-inserts frame rows to PostgreSQL → updates pipeline_stages + inspection_sessions
"""
import os
import uuid
import json
import logging
import urllib.request
import cv2
import psycopg2
import psycopg2.extras
import cloudinary
import cloudinary.uploader
from cloudinary import CloudinaryImage
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from dotenv import load_dotenv

# Load backend .env first (shared credentials), then service .env as override
_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
load_dotenv(dotenv_path=os.path.join(_root, ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

cloudinary.config(
    cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
    api_key=os.environ["CLOUDINARY_API_KEY"],
    api_secret=os.environ["CLOUDINARY_API_SECRET"],
    secure=True,
)

DATABASE_URL = os.environ["DATABASE_URL"]
BACKEND_URL  = os.environ.get("BACKEND_URL", "http://localhost:8001")

app = FastAPI(title="VandeInspect Frame Extractor", version="1.0.0")


class ExtractRequest(BaseModel):
    session_id: str
    session_camera_id: str
    video_path: str
    frames_per_second: float = 1.0   # how many frames to extract per second of video


def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def _all_cameras_done(conn, session_id: str) -> bool:
    """True when every session_camera for this session has frame_count > 0."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS remaining FROM session_cameras WHERE session_id=%s AND frame_count=0",
            (session_id,),
        )
        return cur.fetchone()["remaining"] == 0


def _load_root_config():
    import json
    cfg_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "config.json"))
    try:
        with open(cfg_path) as f:
            return json.load(f)
    except Exception:
        return {}

_root_cfg = _load_root_config()
FLUSH_EVERY = _root_cfg.get("pipeline", {}).get("db_flush_every_n_frames", 10)


def _flush_rows(conn, rows: list, session_id: str, session_camera_id: str, total_uploaded: int, total_video_frames: int):
    """Insert a batch of frame rows and update the live counters in the DB."""
    psycopg2.extras.execute_values(
        conn.cursor(),
        """
        INSERT INTO frames
          (id, session_id, session_camera_id, sequence_number, trigger_id, captured_at_ms,
           cloudinary_url, cloudinary_public_id, thumbnail_url,
           width_px, height_px, file_size_bytes)
        VALUES %s
        """,
        rows,
    )
    with conn.cursor() as cur:
        # Live frame count — frontend polls this and shows it immediately
        cur.execute(
            "UPDATE inspection_sessions SET total_frames = COALESCE(total_frames, 0) + %s WHERE id = %s",
            (len(rows), session_id),
        )
        # Keep pipeline_stages.stats current so the extraction card has a denominator
        cur.execute(
            """
            UPDATE pipeline_stages
            SET detail_message = %s,
                stats = %s::jsonb
            WHERE session_id = %s AND stage = 'frame_extraction'
            """,
            (
                f"Uploading frames… {total_uploaded} uploaded so far",
                json.dumps({"frames_uploaded": total_uploaded, "total_video_frames": total_video_frames}),
                session_id,
            ),
        )
    conn.commit()


def run_extraction(req: ExtractRequest):
    conn = get_conn()
    try:
        # ── Mark extraction stage running ──────────────────────────────────────
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE pipeline_stages
                SET status='running', started_at=NOW(), detail_message='Opening video...'
                WHERE session_id=%s AND stage='frame_extraction' AND status!='running'
                """,
                (req.session_id,),
            )
            conn.commit()

        # ── Open video ────────────────────────────────────────────────────────
        cap = cv2.VideoCapture(req.video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video: {req.video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        # Derive frame_interval from requested fps: interval = video_fps / desired_fps
        # Clamp to [1, video_fps] so we never skip more frames than exist
        frame_interval = max(1, round(fps / req.frames_per_second))
        logger.info(
            "session=%s cam=%s frames=%d video_fps=%.1f desired_fps=%.2f → interval=%d",
            req.session_id, req.session_camera_id, total_video_frames, fps, req.frames_per_second, frame_interval,
        )

        # Write denominator immediately so the UI can show X / total_video_frames
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE pipeline_stages
                SET detail_message=%s, stats=%s::jsonb
                WHERE session_id=%s AND stage='frame_extraction'
                """,
                (
                    f"Starting extraction ({total_video_frames} raw video frames)...",
                    json.dumps({"frames_uploaded": 0, "total_video_frames": total_video_frames}),
                    req.session_id,
                ),
            )
            conn.commit()

        folder = f"vande/{req.session_id}/{req.session_camera_id}"
        frame_number  = 0
        sequence_num  = 0   # global sequence across this camera's extracted frames
        batch         = []  # pending rows not yet flushed
        total_uploaded = 0  # frames committed to DB so far

        # ── Extract + upload + flush every FLUSH_EVERY frames ────────────────
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_number % frame_interval == 0:
                trigger_id   = frame_number
                timestamp_ms = int((frame_number / fps) * 1000)

                ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                if not ok:
                    frame_number += 1
                    continue

                result = cloudinary.uploader.upload(
                    buf.tobytes(),
                    folder=folder,
                    public_id=f"frame_{frame_number:07d}",
                    resource_type="image",
                    format="jpg",
                )
                thumb_url = CloudinaryImage(result["public_id"]).build_url(
                    width=320, height=180, crop="fill", format="jpg"
                )

                batch.append((
                    str(uuid.uuid4()),
                    req.session_id,
                    req.session_camera_id,
                    sequence_num,
                    trigger_id,
                    timestamp_ms,
                    result["secure_url"],
                    result["public_id"],
                    thumb_url,
                    result.get("width"),
                    result.get("height"),
                    result.get("bytes"),
                ))
                sequence_num += 1

                if len(batch) >= FLUSH_EVERY:
                    total_uploaded += len(batch)
                    _flush_rows(conn, batch, req.session_id, req.session_camera_id, total_uploaded, total_video_frames)
                    logger.info("session=%s flushed %d frames (total %d)", req.session_id, len(batch), total_uploaded)
                    batch = []

            frame_number += 1

        cap.release()

        # ── Flush any remaining frames ────────────────────────────────────────
        if batch:
            total_uploaded += len(batch)
            _flush_rows(conn, batch, req.session_id, req.session_camera_id, total_uploaded, total_video_frames)
            batch = []

        uploaded = total_uploaded
        logger.info("session=%s cam=%s extraction done: %d frames", req.session_id, req.session_camera_id, uploaded)

        # ── Mark this camera done (used by _all_cameras_done) ─────────────────
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE session_cameras SET frame_count=%s WHERE id=%s",
                (uploaded, req.session_camera_id),
            )
            conn.commit()

        # ── Check if all cameras for this session are done ────────────────────
        if _all_cameras_done(conn, req.session_id):
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE pipeline_stages
                    SET status='completed', completed_at=NOW(),
                        detail_message=%s,
                        stats=%s::jsonb
                    WHERE session_id=%s AND stage='frame_extraction'
                    """,
                    (
                        f"All cameras extracted. {uploaded} frames uploaded.",
                        json.dumps({"frames_uploaded": uploaded, "total_video_frames": total_video_frames}),
                        req.session_id,
                    ),
                )
                conn.commit()
            logger.info("session=%s frame_extraction stage COMPLETE — triggering OCR pipeline", req.session_id)

            try:
                url = f"{BACKEND_URL}/api/sessions/{req.session_id}/process"
                req_obj = urllib.request.Request(url, data=b'{}', method="POST")
                req_obj.add_header("Content-Type", "application/json")
                with urllib.request.urlopen(req_obj, timeout=10) as resp:
                    logger.info("session=%s /process called, status=%d", req.session_id, resp.status)
            except Exception as trigger_err:
                logger.warning("session=%s could not auto-trigger /process: %s", req.session_id, trigger_err)

    except Exception as exc:
        logger.exception("Extraction failed for session %s", req.session_id)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE pipeline_stages
                    SET status='failed', error_message=%s
                    WHERE session_id=%s AND stage='frame_extraction'
                    """,
                    (str(exc), req.session_id),
                )
                cur.execute(
                    "UPDATE inspection_sessions SET status='failed', error_message=%s WHERE id=%s",
                    (str(exc), req.session_id),
                )
                conn.commit()
        except Exception:
            pass
    finally:
        conn.close()


@app.get("/health")
def health():
    return {"status": "ok", "service": "frame_extractor", "port": 5003}


@app.post("/extract")
def extract(req: ExtractRequest, background_tasks: BackgroundTasks):
    logger.info("Extract queued: session=%s cam=%s path=%s", req.session_id, req.session_camera_id, req.video_path)
    background_tasks.add_task(run_extraction, req)
    return {
        "status": "started",
        "session_id": req.session_id,
        "session_camera_id": req.session_camera_id,
    }
