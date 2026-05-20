"""
Correlation Engine — Phase 3
For each coach:
  1. Sample frames assigned to that coach
  2. POST each frame to YOLO /api/yolo/predict → get defect detections
  3. Write component_detections + defects rows
  4. Compare against component manifest → write missing_components rows
  5. Calculate health_score, update coaches + inspection_sessions
"""
import os
import json
import uuid
import logging
import requests
import psycopg2
import psycopg2.extras
from pathlib import Path

logger = logging.getLogger(__name__)

YOLO_URL = os.environ.get("YOLO_SERVICE_URL", "http://localhost:5002/api/yolo/predict")
SAMPLE_EVERY_N = int(os.environ.get("CORRELATION_SAMPLE_N", "3"))  # check every Nth frame

SEVERITY_PENALTY = {
    "CRITICAL": 15,
    "HIGH": 8,
    "MEDIUM": 4,
    "LOW": 1,
}

MANIFEST_DIR = Path(__file__).parent / "manifests"

# Default label → component_code map (extend when real model classes are known)
LABEL_TO_COMPONENT = {
    "wheel":       "WHEEL_ASSY",
    "wheel_assy":  "WHEEL_ASSY",
    "axle_box":    "AXLE_BOX",
    "brake_pad":   "BRAKE_PAD",
    "suspension":  "SUSP_PIN",
    "susp_pin":    "SUSP_PIN",
    "coupler":     "COUPLER",
    "bogie_frame": "BOGIE_FRAME",
    "water_tank":  "WATER_TANK",
}

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


def load_manifest(coach_type: str = "VANDE_BHARAT") -> list[dict]:
    name = coach_type.lower().replace(" ", "_")
    path = MANIFEST_DIR / f"{name}.json"
    if not path.exists():
        path = MANIFEST_DIR / "vande_bharat.json"
    data = json.loads(path.read_text())
    return data["components"]


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

        cur.execute(
            """
            SELECT id, cloudinary_url, trigger_id
            FROM frames
            WHERE session_id = %s AND coach_id = %s
            ORDER BY trigger_id ASC
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

    manifest = load_manifest(coach.get("coach_type") or "VANDE_BHARAT")
    manifest_codes = {c["code"]: c for c in manifest}

    # Accumulate across frames
    defect_rows = []           # for bulk insert into defects
    component_rows = []        # for bulk insert into component_detections
    component_detected = {}    # code → max_confidence seen

    for frame in sampled:
        frame_bytes = _fetch_frame_bytes(frame["cloudinary_url"])
        if not frame_bytes:
            continue

        detections = _run_yolo(frame_bytes)

        for det in detections:
            label = det.get("label", "")
            conf = float(det.get("confidence", 0.0))
            bbox = det.get("bbox_xyxy", [0, 0, 0, 0])
            x1, y1, x2, y2 = bbox
            bw, bh = max(0, x2 - x1), max(0, y2 - y1)

            if label in DEFECT_SEVERITY:
                severity = DEFECT_SEVERITY[label]
                defect_rows.append((
                    str(uuid.uuid4()), session_id, coach_id, frame["id"],
                    label, severity, round(conf, 4),
                    x1, y1, bw, bh,
                ))

            comp_code = LABEL_TO_COMPONENT.get(label)
            if comp_code:
                component_rows.append((
                    str(uuid.uuid4()), session_id, coach_id, frame["id"],
                    comp_code,
                    next((c["name"] for c in manifest if c["code"] == comp_code), comp_code),
                    round(conf, 4),
                    x1, y1, bw, bh,
                ))
                if comp_code not in component_detected or conf > component_detected[comp_code]:
                    component_detected[comp_code] = conf

    # ── Find missing components ───────────────────────────────────────────────
    missing_rows = []
    for code, spec in manifest_codes.items():
        if code not in component_detected:
            sev = "HIGH" if spec["is_critical"] else "MEDIUM"
            missing_rows.append((
                str(uuid.uuid4()), session_id, coach_id,
                code, spec["name"], spec["quantity"], 0, sev,
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

        if missing_rows:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO missing_components
                  (id, session_id, coach_id, component_code, component_name,
                   expected_count, detected_count, severity)
                VALUES %s
                ON CONFLICT DO NOTHING
                """,
                missing_rows,
            )

        # Count by severity for health score
        sev_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for row in defect_rows:
            sev_counts[row[5]] = sev_counts.get(row[5], 0) + 1

        missing_critical = sum(1 for r in missing_rows if r[7] == "HIGH")
        missing_other = len(missing_rows) - missing_critical

        penalty = (
            sev_counts["CRITICAL"] * SEVERITY_PENALTY["CRITICAL"]
            + sev_counts["HIGH"] * SEVERITY_PENALTY["HIGH"]
            + sev_counts["MEDIUM"] * SEVERITY_PENALTY["MEDIUM"]
            + sev_counts["LOW"] * SEVERITY_PENALTY["LOW"]
            + missing_critical * 20
            + missing_other * 5
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
            (sev_counts["CRITICAL"], len(missing_rows), health_score, coach_id),
        )

        conn.commit()

    summary = {
        "coach_id": coach_id,
        "frames_sampled": len(sampled),
        "defects_found": len(defect_rows),
        "sev_counts": sev_counts,
        "missing_components": len(missing_rows),
        "health_score": health_score,
    }
    logger.info(
        "Correlation done coach=%s defects=%d missing=%d health=%.1f",
        coach_id, len(defect_rows), len(missing_rows), health_score,
    )
    return summary
