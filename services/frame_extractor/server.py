"""
Frame Extractor Service — port 5003
Receives video path → OpenCV extracts every Nth frame → uploads JPEGs to Cloudinary
→ bulk-inserts frame rows to PostgreSQL → updates pipeline_stages + inspection_sessions
"""
import os
import uuid
import json
import logging
import cv2
import psycopg2
import psycopg2.extras
import cloudinary
import cloudinary.uploader
import cloudinary.CloudinaryImage
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

cloudinary.config(
    cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
    api_key=os.environ["CLOUDINARY_API_KEY"],
    api_secret=os.environ["CLOUDINARY_API_SECRET"],
    secure=True,
)

DATABASE_URL = os.environ["DATABASE_URL"]

app = FastAPI(title="VandeInspect Frame Extractor", version="1.0.0")


class ExtractRequest(BaseModel):
    session_id: str
    session_camera_id: str
    video_path: str
    frame_interval: int = 5


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
        logger.info(
            "session=%s cam=%s frames=%d fps=%.1f interval=%d",
            req.session_id, req.session_camera_id, total_video_frames, fps, req.frame_interval,
        )

        folder = f"vande/{req.session_id}/{req.session_camera_id}"
        frame_number = 0
        rows = []

        # ── Extract + upload ──────────────────────────────────────────────────
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_number % req.frame_interval == 0:
                # trigger_id = raw video frame position (same across all cameras for the same run)
                trigger_id = frame_number
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
                thumb_url = cloudinary.CloudinaryImage(result["public_id"]).build_url(
                    width=320, height=180, crop="fill", format="jpg"
                )

                rows.append((
                    str(uuid.uuid4()),
                    req.session_id,
                    req.session_camera_id,
                    len(rows),                  # sequence_number (0-based extracted index)
                    trigger_id,                 # raw frame position — sync key across cameras
                    timestamp_ms,
                    result["secure_url"],
                    result["public_id"],
                    thumb_url,
                    result.get("width"),
                    result.get("height"),
                    result.get("bytes"),
                ))

                if len(rows) % 10 == 0:
                    logger.info("session=%s uploaded %d frames so far", req.session_id, len(rows))

            frame_number += 1

        cap.release()
        uploaded = len(rows)
        logger.info("session=%s cam=%s extraction done: %d frames", req.session_id, req.session_camera_id, uploaded)

        # ── Bulk insert frames ────────────────────────────────────────────────
        if rows:
            with conn.cursor() as cur:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO frames
                      (id, session_id, session_camera_id, sequence_number, trigger_id, captured_at_ms,
                       cloudinary_url, cloudinary_public_id, thumbnail_url,
                       width_px, height_px, file_size_bytes)
                    VALUES %s
                    """,
                    rows,
                )
                cur.execute(
                    "UPDATE session_cameras SET frame_count=%s WHERE id=%s",
                    (uploaded, req.session_camera_id),
                )
                cur.execute(
                    """
                    UPDATE inspection_sessions
                    SET total_frames = COALESCE(total_frames, 0) + %s
                    WHERE id = %s
                    """,
                    (uploaded, req.session_id),
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
                cur.execute(
                    "UPDATE inspection_sessions SET status='ocr_running' WHERE id=%s",
                    (req.session_id,),
                )
                conn.commit()
            logger.info("session=%s frame_extraction stage COMPLETE", req.session_id)

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
