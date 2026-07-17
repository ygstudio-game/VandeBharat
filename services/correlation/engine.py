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
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

from correlate_v2 import correlate_candidate   # Phase C: tracking/voting/fusion/scoring

logger = logging.getLogger(__name__)

YOLO_URL = os.environ.get("YOLO_SERVICE_URL", "http://127.0.0.1:5002/api/yolo/predict")
SAMPLE_EVERY_N = int(os.environ.get("CORRELATION_SAMPLE_N", "3"))
YOLO_CONCURRENCY = int(os.environ.get("CORRELATION_CONCURRENCY", "4"))

# Phase C — write upgraded, deduplicated, multi-camera-scored events to defect_events.
# Augments the legacy per-frame defects table (dashboard unaffected). Toggle + tunables:
CORRELATION_V2 = os.environ.get("CORRELATION_V2", "1") == "1"
ALERT_THRESHOLD = float(os.environ.get("CORRELATION_ALERT_THRESHOLD", "0.92"))
DEFAULT_IMAGE_QUALITY = float(os.environ.get("CORRELATION_DEFAULT_Q", "0.8"))

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


def aggregate_candidates(frame_results, ocr_confidence: float = 0.9,
                         image_quality: float = DEFAULT_IMAGE_QUALITY):
    """Pure: turn per-frame YOLO results into per-(defect_class) multi-camera
    observations for the Phase-C pipeline.

    frame_results: list[(frame_dict, detections)]; frame_dict has 'session_camera_id'.
    Returns (candidates, camera_weights):
      candidates    : list of (defect_class, bogie_id, observations)
      camera_weights: equal weight per camera that saw the coach (vote normalizes)
    """
    cameras_seen: list = []
    seen: set = set()
    per_class = defaultdict(lambda: defaultdict(list))   # class -> camera -> [conf,...]
    for frame, dets in frame_results:
        cam = frame.get("session_camera_id")
        if cam is None:
            continue
        if cam not in seen:
            seen.add(cam)
            cameras_seen.append(cam)
        for det in dets:
            label = _norm(det.get("label", ""))
            if not det.get("defect", label in DEFECT_SEVERITY):
                continue                               # only defects enter event correlation
            per_class[label][cam].append(float(det.get("confidence", 0.0)))

    camera_weights = {cam: 1.0 for cam in cameras_seen}
    candidates = []
    for label, cam_map in per_class.items():
        obs = []
        for cam in cameras_seen:
            confs = cam_map.get(cam, [])
            obs.append({
                "camera_id": cam,
                "detected": len(confs) > 0,
                "confidence": max(confs) if confs else 0.0,
                "frame_count": len(confs),
                "image_quality": image_quality,
                "ocr_confidence": ocr_confidence,
            })
        candidates.append((label, 0, obs))
    return candidates, camera_weights


def store_correlated_events(conn, session_id, coach_id, frame_results,
                            ocr_confidence: float = 0.9) -> int:
    """Run the Phase-C pipeline over collected detections and persist one
    authoritative, deduplicated, scored row per defect to defect_events."""
    candidates, weights = aggregate_candidates(frame_results, ocr_confidence)
    rows = []
    for defect_class, bogie_id, obs in candidates:
        out = correlate_candidate(defect_class, bogie_id, obs, weights,
                                  baseline=None, threshold=ALERT_THRESHOLD)
        detecting = [o for o in obs if o["detected"]]
        best_cam = max(detecting, key=lambda o: o["confidence"])["camera_id"] if detecting else None
        state = "confirmed" if out.route == "confirm" else "correlated"
        rows.append((
            str(uuid.uuid4()), session_id, coach_id,
            str(best_cam) if best_cam else None, defect_class,
            round(out.fused_confidence, 4), round(out.agreement, 4),
            round(out.score, 4), out.route, state, out.route == "confirm",
        ))
    if rows:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO defect_events
                  (event_id, session_id, coach_id, camera_id, defect_class,
                   yolo_confidence, agreement, alert_score, route, state, validated)
                VALUES %s
                ON CONFLICT DO NOTHING
                """,
                rows,
            )
        conn.commit()
    return len(rows)


def correlate_coach(conn, session_id: str, coach_id: str) -> dict:
    """
    Run defect + component correlation for one coach.
    Returns summary dict.
    """
    # ── Load coach + frames ───────────────────────────────────────────────────
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, coach_type, ocr_confidence FROM coaches WHERE id = %s",
            (coach_id,),
        )
        coach = cur.fetchone()
        if not coach:
            raise ValueError(f"Coach {coach_id} not found")

        # Only use component camera frames — exclude the OCR/placard camera
        cur.execute(
            """
            SELECT f.id, f.cloudinary_url, f.trigger_id, f.session_camera_id
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

    # ── Phase C: upgraded multi-camera correlation → defect_events (guarded) ──────
    correlated_events = 0
    if CORRELATION_V2:
        try:
            ocr_conf = float(coach["ocr_confidence"]) if coach.get("ocr_confidence") is not None else 0.9
            correlated_events = store_correlated_events(
                conn, session_id, coach_id, frame_results, ocr_conf)
            logger.info("Coach %s: %d correlated event(s) written to defect_events",
                        coach_id, correlated_events)
        except Exception as exc:
            # Never let the upgraded path break the legacy result (e.g. migration not applied)
            logger.warning("v2 correlation skipped (legacy unaffected): %s", exc)

    summary = {
        "coach_id": coach_id,
        "frames_sampled": len(sampled),
        "components_detected": len(component_rows),
        "defects_found": len(defect_rows),
        "correlated_events": correlated_events,
        "sev_counts": sev_counts,
        "health_score": health_score,
    }
    logger.info(
        "Correlation done coach=%s components=%d defects=%d health=%.1f",
        coach_id, len(component_rows), len(defect_rows), health_score,
    )
    return summary
