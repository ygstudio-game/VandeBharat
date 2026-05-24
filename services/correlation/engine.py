"""
Correlation Engine — Phase 3
For each coach:
  1. Sample frames assigned to that coach
  2. POST each frame to YOLO /api/yolo/predict → get detections
  3. Write component_detections rows for EVERY detection (raw label, no mapping)
  4. Write defects rows only for detections the YOLO server flagged as defects
  5. Calculate health_score, update coaches + inspection_sessions
"""
import os
import uuid
import logging
import requests
import psycopg2
import psycopg2.extras
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)

YOLO_URL = os.environ.get("YOLO_SERVICE_URL", "http://127.0.0.1:5002/api/yolo/predict")
SAMPLE_EVERY_N = int(os.environ.get("CORRELATION_SAMPLE_N", "3"))
YOLO_CONCURRENCY = int(os.environ.get("CORRELATION_CONCURRENCY", "4"))

SEVERITY_PENALTY = {
    "CRITICAL": 15,
    "HIGH": 8,
    "MEDIUM": 4,
    "LOW": 1,
}

# Authoritative defect class list — matches POC/backend/YOLO/server.py DEFECT_LABELS
# and Main/GPU/yolo/server.py SEVERITY_MAP. YOLO response already carries defect+severity
# fields; this map is kept as a local fallback for severity when the field is absent.
DEFECT_SEVERITY = {
    "crack":          "CRITICAL",
    "leakage":        "CRITICAL",
    "smoke_emission": "CRITICAL",
    "broken":         "HIGH",
    "rust":           "HIGH",
    "deformation":    "HIGH",
    "hole":           "HIGH",
    "missing_part":   "MEDIUM",
    "puncture":       "MEDIUM",
    "hanging":        "MEDIUM",
    "loose":          "LOW",
}


def _norm(label: str) -> str:
    return label.strip().lower().replace(" ", "_").replace("-", "_")


def _fetch_frame_bytes(url: str) -> bytes | None:
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        return resp.content
    except Exception as exc:
        logger.warning("Frame download failed (%s): %s", url, exc)
        return None


def _run_yolo(frame_bytes: bytes) -> list[dict]:
    try:
        resp = requests.post(
            YOLO_URL,
            files={"file": ("frame.jpg", frame_bytes, "image/jpeg")},
            timeout=30,
        )
        if resp.status_code == 200:
            return resp.json().get("detections", [])
    except Exception as exc:
        logger.warning("YOLO call failed: %s", exc)
    return []


def _process_frame(frame: dict) -> tuple[dict, list[dict]]:
    """Download one frame and run YOLO. Returns (frame, detections)."""
    frame_bytes = _fetch_frame_bytes(frame["cloudinary_url"])
    if not frame_bytes:
        return frame, []
    return frame, _run_yolo(frame_bytes)


def correlate_coach(conn, session_id: str, coach_id: str) -> dict:
    """
    Run defect + component correlation for one coach.
    Returns summary dict.
    """
    # ── Load coach + frames ───────────────────────────────────────────────────
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, coach_type FROM coaches WHERE id = %s",
            (coach_id,),
        )
        coach = cur.fetchone()
        if not coach:
            raise ValueError(f"Coach {coach_id} not found")

        # Only use component camera frames — exclude the OCR/placard camera
        cur.execute(
            """
            SELECT f.id, f.cloudinary_url, f.trigger_id
            FROM frames f
            JOIN session_cameras sc ON f.session_camera_id = sc.id
            WHERE f.session_id = %s AND f.coach_id = %s AND sc.camera_type != 'ocr'
            ORDER BY f.trigger_id ASC
            """,
            (session_id, coach_id),
        )
        all_frames = cur.fetchall()

    # Sample frames to avoid running YOLO on every one
    sampled = all_frames[::SAMPLE_EVERY_N] if SAMPLE_EVERY_N > 1 else all_frames
    logger.info(
        "Coach %s: %d total frames → %d sampled (every %d)",
        coach_id, len(all_frames), len(sampled), SAMPLE_EVERY_N,
    )

    defect_rows = []      # for bulk insert into defects
    component_rows = []   # for bulk insert into component_detections (ALL detections)

    # Download + YOLO all sampled frames in parallel
    with ThreadPoolExecutor(max_workers=YOLO_CONCURRENCY) as pool:
        futures = {pool.submit(_process_frame, f): f for f in sampled}
        frame_results = []
        for fut in as_completed(futures):
            try:
                frame_results.append(fut.result())
            except Exception as exc:
                logger.warning("Frame worker raised: %s", exc)

    for frame, detections in frame_results:
        for det in detections:
            raw_label = det.get("label", "")
            label = _norm(raw_label)
            conf = float(det.get("confidence", 0.0))
            bbox = det.get("bbox_xyxy", [0, 0, 0, 0])
            x1, y1, x2, y2 = bbox
            bw, bh = max(0, x2 - x1), max(0, y2 - y1)

            # Store every detection as a component (raw label, no mapping needed)
            component_rows.append((
                str(uuid.uuid4()), session_id, coach_id, frame["id"],
                label,      # component_code = normalised raw label
                raw_label,  # component_name = original label from model
                round(conf, 4),
                x1, y1, bw, bh,
            ))

            # Only create a defect row if YOLO flagged it as a defect
            is_defect = det.get("defect", label in DEFECT_SEVERITY)
            if is_defect:
                severity = det.get("severity") or DEFECT_SEVERITY.get(label, "LOW")
                defect_rows.append((
                    str(uuid.uuid4()), session_id, coach_id, frame["id"],
                    label, severity, round(conf, 4),
                    x1, y1, bw, bh,
                ))

    # ── Write to DB ───────────────────────────────────────────────────────────
    with conn.cursor() as cur:
        if defect_rows:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO defects
                  (id, session_id, coach_id, frame_id, defect_type, severity, confidence,
                   bbox_x, bbox_y, bbox_w, bbox_h)
                VALUES %s
                ON CONFLICT DO NOTHING
                """,
                defect_rows,
            )

        if component_rows:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO component_detections
                  (id, session_id, coach_id, frame_id, component_code, component_name,
                   confidence, bbox_x, bbox_y, bbox_w, bbox_h)
                VALUES %s
                ON CONFLICT DO NOTHING
                """,
                component_rows,
            )

        # Count defects by severity for health score
        sev_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for row in defect_rows:
            sev = row[5]
            sev_counts[sev] = sev_counts.get(sev, 0) + 1

        penalty = (
            sev_counts["CRITICAL"] * SEVERITY_PENALTY["CRITICAL"]
            + sev_counts["HIGH"] * SEVERITY_PENALTY["HIGH"]
            + sev_counts["MEDIUM"] * SEVERITY_PENALTY["MEDIUM"]
            + sev_counts["LOW"] * SEVERITY_PENALTY["LOW"]
        )
        health_score = max(0.0, round(100.0 - penalty, 2))

        cur.execute(
            """
            UPDATE coaches
            SET critical_defects = %s,
                missing_components = %s,
                health_score = %s
            WHERE id = %s
            """,
            (sev_counts["CRITICAL"], 0, health_score, coach_id),
        )

        conn.commit()

    summary = {
        "coach_id": coach_id,
        "frames_sampled": len(sampled),
        "components_detected": len(component_rows),
        "defects_found": len(defect_rows),
        "sev_counts": sev_counts,
        "health_score": health_score,
    }
    logger.info(
        "Correlation done coach=%s components=%d defects=%d health=%.1f",
        coach_id, len(component_rows), len(defect_rows), health_score,
    )
    return summary
