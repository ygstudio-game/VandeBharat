"""
Sync Engine — gap-boundary synchronisation.

Algorithm:
  1. Load gap_detections for the session (YOLO "gap" class hits), ordered by trigger_id
  2. Cluster consecutive detections that belong to the same physical gap
     (multiple frames may see the same gap as it rolls past the camera)
  3. Each cluster → one boundary trigger_id (highest-confidence hit in the cluster)
  4. Boundaries divide the trigger timeline into bogie segments
     [session_start … boundary_0), [boundary_0 … boundary_1), …, [boundary_N … session_end]
  5. Within each segment, query ocr_results for the best coach_number
  6. Create coaches rows; assign ALL frames (all cameras) by trigger_id range
  7. Create timeline_events for boundaries and OCR anchors

Fallback: if no gap detections exist (model not seeing gaps yet), fall back to the
old OCR-voting algorithm so existing sessions keep working.
"""
import os
import json
import uuid
import logging
import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

def _load_config():
    cfg_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "config.json"))
    try:
        with open(cfg_path) as f:
            return json.load(f)
    except Exception:
        return {}

_cfg = _load_config()
# Gap clustering: consecutive gap detections within this many trigger_ids → same physical gap
GAP_CLUSTER_RADIUS  = _cfg.get("pipeline", {}).get("sync_gap_cluster_radius",  30)
# Fallback OCR voting params (used when no gap detections exist)
MIN_VOTES           = _cfg.get("pipeline", {}).get("sync_min_votes",            1)
MAX_TRIGGER_GAP     = _cfg.get("pipeline", {}).get("sync_max_trigger_gap",      150)
# Minimum gap confidence to accept a detection as a real boundary
GAP_MIN_CONFIDENCE  = _cfg.get("pipeline", {}).get("sync_gap_min_confidence",   0.4)


# ─── Gap-based path ───────────────────────────────────────────────────────────

def load_gap_detections(conn, session_id: str) -> list[dict]:
    """Raw gap_detections rows for the session, ordered by trigger_id ASC."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT trigger_id, confidence, bbox_x, bbox_y, bbox_w, bbox_h
            FROM gap_detections
            WHERE session_id = %s
              AND confidence >= %s
            ORDER BY trigger_id ASC
            """,
            (session_id, GAP_MIN_CONFIDENCE),
        )
        return cur.fetchall()


def cluster_gaps(gap_rows: list[dict]) -> list[int]:
    """
    Group consecutive gap detections that are within GAP_CLUSTER_RADIUS trigger_ids
    of each other — they are the same physical gap seen across multiple frames.
    Returns one canonical trigger_id per cluster (the highest-confidence hit).
    """
    if not gap_rows:
        return []

    clusters = []
    current = [gap_rows[0]]

    for row in gap_rows[1:]:
        if row["trigger_id"] - current[-1]["trigger_id"] <= GAP_CLUSTER_RADIUS:
            current.append(row)
        else:
            clusters.append(current)
            current = [row]
    clusters.append(current)

    boundaries = []
    for cluster in clusters:
        best = max(cluster, key=lambda r: r["confidence"])
        boundaries.append(int(best["trigger_id"]))

    logger.info(
        "Gap clustering: %d raw detections → %d boundaries (cluster_radius=%d, min_conf=%.2f)",
        len(gap_rows), len(boundaries), GAP_CLUSTER_RADIUS, GAP_MIN_CONFIDENCE,
    )
    for i, b in enumerate(boundaries):
        logger.info("  Boundary %d: trigger_id=%d", i + 1, b)

    return sorted(boundaries)


def get_session_trigger_range(conn, session_id: str) -> tuple[int, int]:
    """Min and max trigger_id across all frames in the session."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT MIN(trigger_id), MAX(trigger_id) FROM frames WHERE session_id = %s",
            (session_id,),
        )
        row = cur.fetchone()
        values = list(row.values()) if isinstance(row, dict) else row
        return int(values[0]), int(values[1])


def build_bogie_ranges(boundaries: list[int], min_trigger: int, max_trigger: int) -> list[tuple[int, int]]:
    """
    Turn gap boundaries into (start_trigger, end_trigger) inclusive ranges.
    One range per bogie; boundaries mark where the PREVIOUS bogie ends.
    """
    # Points: session_start, each boundary, session_end+1
    points = [min_trigger] + boundaries + [max_trigger + 1]
    ranges = []
    for i in range(len(points) - 1):
        start = points[i]
        end   = points[i + 1] - 1
        if end >= start:
            ranges.append((start, end))
    return ranges


def find_coach_label(conn, session_id: str, start_t: int, end_t: int) -> tuple[str | None, float]:
    """
    Best coach_number (highest confidence) from ocr_results within [start_t, end_t].
    Prefers is_valid=TRUE rows; falls back to any row with a coach_number.
    Returns (coach_number, confidence) or (None, 0.0).
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT o.coach_number, o.confidence
            FROM ocr_results o
            JOIN frames f ON o.frame_id = f.id
            WHERE o.session_id = %s
              AND f.trigger_id BETWEEN %s AND %s
              AND o.coach_number IS NOT NULL
            ORDER BY o.is_valid DESC, o.confidence DESC
            LIMIT 1
            """,
            (session_id, start_t, end_t),
        )
        row = cur.fetchone()
    if row:
        vals = list(row.values()) if isinstance(row, dict) else row
        return str(vals[0]), float(vals[1])
    return None, 0.0


# ─── Create coaches rows ──────────────────────────────────────────────────────

def create_coaches_from_ranges(conn, session_id: str, bogie_ranges: list[tuple[int, int]]) -> list[dict]:
    """
    One coach row per bogie range.
    Returns enriched list with coach_id, coach_number, start/end trigger_id.
    """
    segments = []
    with conn.cursor() as cur:
        for i, (start_t, end_t) in enumerate(bogie_ranges):
            coach_number, ocr_conf = find_coach_label(conn, session_id, start_t, end_t)
            label = coach_number or f"UNKNOWN-{i + 1}"
            coach_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO coaches
                  (id, session_id, coach_number, coach_index,
                   ocr_confidence, start_trigger_id, end_trigger_id, total_frames)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 0)
                """,
                (coach_id, session_id, label, i + 1,
                 round(ocr_conf, 4) if ocr_conf else None,
                 start_t, end_t),
            )
            segments.append({
                "coach_id":        coach_id,
                "coach_number":    label,
                "coach_index":     i + 1,
                "start_trigger_id": start_t,
                "end_trigger_id":   end_t,
                "ocr_confidence":  round(ocr_conf, 4),
            })
        conn.commit()
    return segments


# ─── Assign frames ────────────────────────────────────────────────────────────

def assign_frames_to_coaches(conn, session_id: str, segments: list[dict]) -> tuple[int, int]:
    """
    Every frame in the session (all cameras) is assigned to the coach whose
    trigger range contains that frame's trigger_id.
    Assignment method: GAP_BOUNDARY (direct range match) for all — no interpolation
    needed because gap boundaries are physically exact.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, trigger_id FROM frames WHERE session_id = %s ORDER BY trigger_id ASC",
            (session_id,),
        )
        frames = cur.fetchall()

    frame_updates = []
    map_rows = []
    assigned = 0
    unassigned = 0

    # Build a sorted list of (start, end, coach_id) for binary-search-style lookup
    ranges = [(s["start_trigger_id"], s["end_trigger_id"], s["coach_id"]) for s in segments]

    for frame in frames:
        tid = int(frame["trigger_id"]) if isinstance(frame, dict) else int(frame[1])
        fid = frame["id"] if isinstance(frame, dict) else frame[0]

        coach_id = None
        for start, end, cid in ranges:
            if start <= tid <= end:
                coach_id = cid
                break

        if coach_id is None:
            unassigned += 1
            continue

        frame_updates.append((str(coach_id), str(fid)))
        map_rows.append((
            str(uuid.uuid4()), session_id, str(fid), str(coach_id),
            "GAP_BOUNDARY", 1.0,
        ))
        assigned += 1

    with conn.cursor() as cur:
        if frame_updates:
            psycopg2.extras.execute_values(
                cur,
                "UPDATE frames SET coach_id = data.coach_id::uuid "
                "FROM (VALUES %s) AS data(coach_id, id) "
                "WHERE frames.id = data.id::uuid",
                frame_updates,
            )
        if map_rows:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO coach_frame_map
                  (id, session_id, frame_id, coach_id, assignment_method, confidence)
                VALUES %s
                ON CONFLICT (frame_id) DO NOTHING
                """,
                map_rows,
            )
        # Update total_frames and ocr_frame_count on each coach
        cur.execute(
            """
            UPDATE coaches c
            SET total_frames = sub.cnt
            FROM (
              SELECT coach_id, COUNT(*) AS cnt
              FROM frames
              WHERE session_id = %s AND coach_id IS NOT NULL
              GROUP BY coach_id
            ) sub
            WHERE c.id = sub.coach_id
            """,
            (session_id,),
        )
        cur.execute(
            """
            UPDATE coaches c
            SET ocr_frame_count = sub.cnt
            FROM (
              SELECT f.coach_id, COUNT(DISTINCT o.frame_id) AS cnt
              FROM ocr_results o
              JOIN frames f ON o.frame_id = f.id
              WHERE o.session_id = %s
                AND f.coach_id IS NOT NULL
                AND o.is_valid = TRUE
              GROUP BY f.coach_id
            ) sub
            WHERE c.id = sub.coach_id
            """,
            (session_id,),
        )
        conn.commit()

    logger.info(
        "Frame assignment: %d assigned (GAP_BOUNDARY), %d unassigned (outside all ranges)",
        assigned, unassigned,
    )
    return assigned, unassigned


# ─── Timeline events ──────────────────────────────────────────────────────────

def create_timeline_events_gap(conn, session_id: str, segments: list[dict], boundaries: list[int]):
    with conn.cursor() as cur:
        # One OCR_ANCHOR per coach where a real number was found
        for seg in segments:
            if not seg["coach_number"].startswith("UNKNOWN"):
                cur.execute(
                    """
                    INSERT INTO timeline_events
                      (id, session_id, coach_id, event_type, description, timestamp_ms)
                    VALUES (%s, %s, %s, 'OCR_ANCHOR', %s, %s)
                    """,
                    (
                        str(uuid.uuid4()), session_id, seg["coach_id"],
                        f"Coach {seg['coach_number']} identified (conf {seg['ocr_confidence']:.2f})",
                        seg["start_trigger_id"],
                    ),
                )

        # One GAP_BOUNDARY event per detected gap boundary
        for trigger_id in boundaries:
            cur.execute(
                """
                INSERT INTO timeline_events
                  (id, session_id, event_type, description, timestamp_ms)
                VALUES (%s, %s, 'GAP_BOUNDARY', %s, %s)
                """,
                (
                    str(uuid.uuid4()), session_id,
                    f"Bogie gap detected at trigger {trigger_id}",
                    trigger_id,
                ),
            )
        conn.commit()


# ─── OCR-voting fallback (used when no gap detections exist) ──────────────────

def _ocr_voting_fallback(conn, session_id: str) -> dict:
    """Original OCR-number-voting algorithm kept as fallback."""
    logger.warning(
        "No gap detections for session %s — running OCR-voting fallback (sync_min_votes=%d)",
        session_id, MIN_VOTES,
    )

    # Load valid OCR results
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.trigger_id, o.coach_number, o.confidence
            FROM ocr_results o
            JOIN frames f ON o.frame_id = f.id
            WHERE o.session_id = %s
              AND o.is_valid = TRUE
              AND o.coach_number IS NOT NULL
            ORDER BY f.trigger_id ASC, o.confidence DESC
            """,
            (session_id,),
        )
        rows = cur.fetchall()

    if not rows:
        logger.warning("OCR fallback: no valid OCR results either — 0 coaches created")
        return {"coaches_created": 0, "frames_assigned_direct": 0,
                "frames_assigned_interpolated": 0, "method": "ocr_voting"}

    # Deduplicate per trigger_id
    seen = {}
    for row in rows:
        tid  = int(row["trigger_id"])
        if tid not in seen or float(row["confidence"]) > float(seen[tid]["confidence"]):
            seen[tid] = {"trigger_id": tid, "coach_number": row["coach_number"],
                         "confidence": float(row["confidence"])}
    ocr_by_trigger = sorted(seen.values(), key=lambda r: r["trigger_id"])

    # Linear scan to build segments
    segments = []
    cur_seg  = None

    def _new(num, tid, conf):
        return {"coach_number": num, "start_trigger_id": tid, "end_trigger_id": tid,
                "votes": 1, "conf_sum": conf}

    def _close(seg):
        if seg and seg["votes"] >= MIN_VOTES:
            seg["avg_confidence"] = seg["conf_sum"] / seg["votes"]
            segments.append(seg)

    for r in ocr_by_trigger:
        tid, num, conf = r["trigger_id"], r["coach_number"], r["confidence"]
        if cur_seg is None:
            cur_seg = _new(num, tid, conf)
        elif num == cur_seg["coach_number"] and (tid - cur_seg["end_trigger_id"]) <= MAX_TRIGGER_GAP:
            cur_seg["end_trigger_id"] = tid
            cur_seg["votes"] += 1
            cur_seg["conf_sum"] += conf
        else:
            _close(cur_seg)
            cur_seg = _new(num, tid, conf)
    _close(cur_seg)

    if not segments:
        return {"coaches_created": 0, "frames_assigned_direct": 0,
                "frames_assigned_interpolated": 0, "method": "ocr_voting"}

    # Create coaches
    enriched = []
    with conn.cursor() as cur:
        for i, seg in enumerate(segments):
            cid = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO coaches
                  (id, session_id, coach_number, coach_index,
                   ocr_confidence, start_trigger_id, end_trigger_id, total_frames)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 0)
                """,
                (cid, session_id, seg["coach_number"], i + 1,
                 round(seg["avg_confidence"], 4),
                 seg["start_trigger_id"], seg["end_trigger_id"]),
            )
            seg["coach_id"] = cid
            enriched.append(seg)
        conn.commit()

    # Assign frames (OCR_DIRECT / GAP_INTERPOLATION)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, trigger_id FROM frames WHERE session_id = %s ORDER BY trigger_id ASC",
            (session_id,),
        )
        frames = cur.fetchall()

    direct = interpolated = 0
    updates = []
    map_rows = []
    for frame in frames:
        tid = int(frame["trigger_id"])
        fid = frame["id"]
        coach_id = method = None
        for seg in enriched:
            if seg["start_trigger_id"] <= tid <= seg["end_trigger_id"]:
                coach_id, method = seg["coach_id"], "OCR_DIRECT"
                break
        if coach_id is None:
            best_dist, best_cid = float("inf"), None
            for seg in enriched:
                d = min(abs(tid - seg["start_trigger_id"]), abs(tid - seg["end_trigger_id"]))
                if d < best_dist:
                    best_dist, best_cid = d, seg["coach_id"]
            if best_cid and best_dist <= MAX_TRIGGER_GAP * 3:
                coach_id, method = best_cid, "GAP_INTERPOLATION"
        if coach_id is None:
            continue
        updates.append((str(coach_id), str(fid)))
        map_rows.append((str(uuid.uuid4()), session_id, str(fid), str(coach_id), method,
                         1.0 if method == "OCR_DIRECT" else 0.6))
        if method == "OCR_DIRECT":
            direct += 1
        else:
            interpolated += 1

    with conn.cursor() as cur:
        if updates:
            psycopg2.extras.execute_values(
                cur,
                "UPDATE frames SET coach_id = data.coach_id::uuid "
                "FROM (VALUES %s) AS data(coach_id, id) WHERE frames.id = data.id::uuid",
                updates,
            )
        if map_rows:
            psycopg2.extras.execute_values(
                cur,
                "INSERT INTO coach_frame_map "
                "  (id, session_id, frame_id, coach_id, assignment_method, confidence) "
                "VALUES %s ON CONFLICT (frame_id) DO NOTHING",
                map_rows,
            )
        cur.execute(
            """
            UPDATE coaches c SET total_frames = sub.cnt
            FROM (SELECT coach_id, COUNT(*) AS cnt FROM frames
                  WHERE session_id = %s AND coach_id IS NOT NULL GROUP BY coach_id) sub
            WHERE c.id = sub.coach_id
            """,
            (session_id,),
        )
        cur.execute(
            """
            UPDATE coaches c
            SET ocr_frame_count = sub.cnt
            FROM (
              SELECT f.coach_id, COUNT(DISTINCT o.frame_id) AS cnt
              FROM ocr_results o
              JOIN frames f ON o.frame_id = f.id
              WHERE o.session_id = %s
                AND f.coach_id IS NOT NULL
                AND o.is_valid = TRUE
              GROUP BY f.coach_id
            ) sub
            WHERE c.id = sub.coach_id
            """,
            (session_id,),
        )
        conn.commit()

    return {
        "coaches_created": len(enriched),
        "frames_assigned_direct": direct,
        "frames_assigned_interpolated": interpolated,
        "method": "ocr_voting",
        "coaches": [{"coach_id": s["coach_id"], "coach_number": s["coach_number"],
                     "coach_index": i + 1, "start_trigger_id": s["start_trigger_id"],
                     "end_trigger_id": s["end_trigger_id"]}
                    for i, s in enumerate(enriched)],
    }


# ─── Public entry point ───────────────────────────────────────────────────────

def run_sync(conn, session_id: str) -> dict:
    logger.info("Sync engine starting for session %s", session_id)

    # ── Primary path: gap-boundary synchronisation ────────────────────────────
    gap_rows = load_gap_detections(conn, session_id)
    logger.info("Loaded %d gap detections (conf >= %.2f)", len(gap_rows), GAP_MIN_CONFIDENCE)

    if not gap_rows:
        return _ocr_voting_fallback(conn, session_id)

    boundaries = cluster_gaps(gap_rows)

    if not boundaries:
        logger.warning("All gap detections filtered out — falling back to OCR voting")
        return _ocr_voting_fallback(conn, session_id)

    min_t, max_t = get_session_trigger_range(conn, session_id)
    logger.info("Session trigger range: %d → %d", min_t, max_t)

    bogie_ranges = build_bogie_ranges(boundaries, min_t, max_t)
    logger.info("Built %d bogie ranges from %d boundaries", len(bogie_ranges), len(boundaries))
    for i, (s, e) in enumerate(bogie_ranges):
        logger.info("  Bogie %d: triggers [%d, %d]  span=%d", i + 1, s, e, e - s)

    segments = create_coaches_from_ranges(conn, session_id, bogie_ranges)
    for seg in segments:
        logger.info(
            "  Coach %d: %s  triggers=[%d, %d]  ocr_conf=%.3f",
            seg["coach_index"], seg["coach_number"],
            seg["start_trigger_id"], seg["end_trigger_id"],
            seg["ocr_confidence"],
        )

    assigned, unassigned = assign_frames_to_coaches(conn, session_id, segments)
    create_timeline_events_gap(conn, session_id, segments, boundaries)

    result = {
        "coaches_created": len(segments),
        "frames_assigned_direct": assigned,
        "frames_assigned_interpolated": 0,
        "frames_unassigned": unassigned,
        "gap_boundaries_used": len(boundaries),
        "method": "gap_boundary",
        "coaches": [
            {
                "coach_id":         s["coach_id"],
                "coach_number":     s["coach_number"],
                "coach_index":      s["coach_index"],
                "start_trigger_id": s["start_trigger_id"],
                "end_trigger_id":   s["end_trigger_id"],
                "ocr_confidence":   s["ocr_confidence"],
            }
            for s in segments
        ],
    }
    logger.info(
        "Sync complete (gap_boundary): %d coaches, %d boundaries, %d frames assigned, %d unassigned",
        len(segments), len(boundaries), assigned, unassigned,
    )
    return result
