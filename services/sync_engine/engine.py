"""
Sync Engine — gap detection on trigger_id axis.

Algorithm:
  1. Read ocr_results (valid only) joined with frames.trigger_id, ordered by trigger_id ASC
  2. Build (trigger_id → best_coach_number) map — one coach_number per trigger_id
  3. Gap detection: consecutive trigger_ids with the same coach_number → one segment
     A segment ends when the number changes OR there's a gap > MAX_TRIGGER_GAP trigger IDs
     A segment is accepted as a real coach only if it has >= MIN_VOTES detections
  4. Create coaches rows for each accepted segment
  5. Assign frames.coach_id:
       - trigger_id inside a segment → OCR_DIRECT
       - trigger_id in a gap between segments → GAP_INTERPOLATION (assign to nearest)
  6. Create coach_frame_map rows + timeline_events
"""
import uuid
import logging
import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

MIN_VOTES = 5        # A coach_number must appear at least this many times to be accepted
MAX_TRIGGER_GAP = 150  # If no OCR for this many trigger_ids, it's a coach boundary


# ─── Step 1+2: Load and reduce OCR results ────────────────────────────────────

def load_ocr_by_trigger(conn, session_id: str) -> list[dict]:
    """
    Returns list of { trigger_id, coach_number, confidence } sorted by trigger_id ASC.
    One entry per trigger_id — if multiple OCR results at same trigger_id, picks highest confidence.
    Only includes is_valid=TRUE results.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT f.trigger_id,
                   o.coach_number,
                   o.confidence
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

    # Deduplicate: keep highest-confidence result per trigger_id
    seen = {}
    for row in rows:
        tid = row["trigger_id"]
        if tid not in seen or row["confidence"] > seen[tid]["confidence"]:
            seen[tid] = {"trigger_id": tid, "coach_number": row["coach_number"], "confidence": row["confidence"]}

    return sorted(seen.values(), key=lambda r: r["trigger_id"])


# ─── Step 3: Gap detection → coach segments ───────────────────────────────────

def detect_segments(ocr_by_trigger: list[dict], min_votes=MIN_VOTES, max_gap=MAX_TRIGGER_GAP) -> list[dict]:
    """
    Returns list of accepted coach segments:
      { coach_number, start_trigger_id, end_trigger_id, votes, avg_confidence }
    """
    if not ocr_by_trigger:
        return []

    segments = []
    cur = None  # current open segment

    for r in ocr_by_trigger:
        tid = r["trigger_id"]
        num = r["coach_number"]
        conf = r["confidence"]

        if cur is None:
            cur = _new_seg(num, tid, conf)

        elif num == cur["coach_number"] and (tid - cur["end_trigger_id"]) <= max_gap:
            # Same coach, within gap tolerance — extend segment
            cur["end_trigger_id"] = tid
            cur["votes"] += 1
            cur["conf_sum"] += conf

        else:
            # Coach changed OR gap too large — close current segment
            _close(segments, cur, min_votes)
            cur = _new_seg(num, tid, conf)

    _close(segments, cur, min_votes)

    logger.info("Gap detection: %d raw triggers → %d accepted coach segments", len(ocr_by_trigger), len(segments))
    for i, s in enumerate(segments):
        logger.info(
            "  Segment %d: coach=%s  triggers=[%d, %d]  votes=%d  avg_conf=%.3f",
            i + 1, s["coach_number"], s["start_trigger_id"], s["end_trigger_id"],
            s["votes"], s["avg_confidence"],
        )

    return segments


def _new_seg(coach_number, trigger_id, confidence):
    return {
        "coach_number": coach_number,
        "start_trigger_id": trigger_id,
        "end_trigger_id": trigger_id,
        "votes": 1,
        "conf_sum": confidence,
    }


def _close(segments, seg, min_votes):
    if seg and seg["votes"] >= min_votes:
        seg["avg_confidence"] = seg["conf_sum"] / seg["votes"]
        segments.append(seg)


# ─── Step 4: Create coaches rows ──────────────────────────────────────────────

def create_coaches(conn, session_id: str, segments: list[dict]) -> list[dict]:
    """
    Inserts one coaches row per segment.
    Returns segments enriched with coach_id.
    """
    with conn.cursor() as cur:
        for i, seg in enumerate(segments):
            coach_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO coaches
                  (id, session_id, coach_number, coach_index,
                   ocr_confidence, start_trigger_id, end_trigger_id, total_frames)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 0)
                """,
                (
                    coach_id, session_id, seg["coach_number"], i + 1,
                    round(seg["avg_confidence"], 4),
                    seg["start_trigger_id"], seg["end_trigger_id"],
                ),
            )
            seg["coach_id"] = coach_id
        conn.commit()

    return segments


# ─── Step 5: Assign frames to coaches ─────────────────────────────────────────

def assign_frames(conn, session_id: str, segments: list[dict]) -> tuple[int, int]:
    """
    For every frame in the session, assigns coach_id based on trigger_id position.
    Inside a segment → OCR_DIRECT.
    In the gap between two segments → GAP_INTERPOLATION (nearest segment).
    Updates frames.coach_id + inserts coach_frame_map rows.
    Returns (direct_count, interpolated_count).
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, trigger_id FROM frames WHERE session_id = %s ORDER BY trigger_id ASC",
            (session_id,),
        )
        frames = cur.fetchall()

    direct = 0
    interpolated = 0
    map_rows = []
    frame_coach_updates = []  # (coach_id, frame_id)

    for frame in frames:
        tid = frame["trigger_id"]
        coach_id, method = _find_coach(tid, segments)
        if coach_id is None:
            continue

        frame_coach_updates.append((coach_id, frame["id"]))
        map_rows.append((
            str(uuid.uuid4()), session_id, frame["id"], coach_id, method, 1.0 if method == "OCR_DIRECT" else 0.6,
        ))
        if method == "OCR_DIRECT":
            direct += 1
        else:
            interpolated += 1

    with conn.cursor() as cur:
        # Update frames.coach_id
        psycopg2.extras.execute_values(
            cur,
            "UPDATE frames SET coach_id = data.coach_id FROM (VALUES %s) AS data(coach_id, id) WHERE frames.id = data.id::uuid",
            [(str(coach_id), str(fid)) for coach_id, fid in frame_coach_updates],
        )
        # Insert coach_frame_map
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO coach_frame_map (id, session_id, frame_id, coach_id, assignment_method, confidence)
            VALUES %s
            ON CONFLICT (frame_id) DO NOTHING
            """,
            map_rows,
        )
        # Update coaches.total_frames counts
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
        conn.commit()

    return direct, interpolated


def _find_coach(trigger_id, segments):
    """Find which coach segment a trigger_id belongs to."""
    for seg in segments:
        if seg["start_trigger_id"] <= trigger_id <= seg["end_trigger_id"]:
            return seg["coach_id"], "OCR_DIRECT"

    # Not inside any segment — find nearest by endpoint distance
    best_coach = None
    best_dist = float("inf")
    for seg in segments:
        dist = min(
            abs(trigger_id - seg["start_trigger_id"]),
            abs(trigger_id - seg["end_trigger_id"]),
        )
        if dist < best_dist:
            best_dist = dist
            best_coach = seg["coach_id"]

    # Only interpolate if reasonably close (within 3× max gap)
    if best_coach and best_dist <= MAX_TRIGGER_GAP * 3:
        return best_coach, "GAP_INTERPOLATION"
    return None, None


# ─── Step 6: Timeline events ──────────────────────────────────────────────────

def create_timeline_events(conn, session_id: str, segments: list[dict]):
    """OCR_ANCHOR events at segment start, COACH_GAP events at boundaries."""
    with conn.cursor() as cur:
        for i, seg in enumerate(segments):
            # OCR_ANCHOR — where coach was first identified
            cur.execute(
                """
                INSERT INTO timeline_events (id, session_id, coach_id, event_type, description, timestamp_ms)
                VALUES (%s, %s, %s, 'OCR_ANCHOR', %s, %s)
                """,
                (
                    str(uuid.uuid4()), session_id, seg["coach_id"],
                    f"Coach {seg['coach_number']} identified (confidence {seg['avg_confidence']:.2f})",
                    seg["start_trigger_id"],  # trigger_id used as proxy timestamp
                ),
            )
            # COACH_GAP — boundary between coaches
            if i < len(segments) - 1:
                next_seg = segments[i + 1]
                gap_trigger = (seg["end_trigger_id"] + next_seg["start_trigger_id"]) // 2
                cur.execute(
                    """
                    INSERT INTO timeline_events (id, session_id, event_type, description, timestamp_ms)
                    VALUES (%s, %s, 'COACH_GAP', %s, %s)
                    """,
                    (
                        str(uuid.uuid4()), session_id,
                        f"Gap between Coach {seg['coach_number']} and Coach {next_seg['coach_number']}",
                        gap_trigger,
                    ),
                )
        conn.commit()


# ─── Public entry point ───────────────────────────────────────────────────────

def run_sync(conn, session_id: str) -> dict:
    logger.info("Sync engine starting for session %s", session_id)

    ocr_data = load_ocr_by_trigger(conn, session_id)
    logger.info("Loaded %d valid OCR results across trigger_ids", len(ocr_data))

    segments = detect_segments(ocr_data)
    if not segments:
        logger.warning("No coach segments detected for session %s — check OCR results", session_id)
        return {"coaches_created": 0, "frames_assigned_direct": 0, "frames_assigned_interpolated": 0}

    segments = create_coaches(conn, session_id, segments)
    direct, interpolated = assign_frames(conn, session_id, segments)
    create_timeline_events(conn, session_id, segments)

    result = {
        "coaches_created": len(segments),
        "frames_assigned_direct": direct,
        "frames_assigned_interpolated": interpolated,
        "coaches": [
            {
                "coach_id": s["coach_id"],
                "coach_number": s["coach_number"],
                "coach_index": i + 1,
                "start_trigger_id": s["start_trigger_id"],
                "end_trigger_id": s["end_trigger_id"],
                "votes": s["votes"],
                "avg_confidence": round(s["avg_confidence"], 4),
            }
            for i, s in enumerate(segments)
        ],
    }
    logger.info("Sync complete: %d coaches, %d direct + %d interpolated frames",
                len(segments), direct, interpolated)
    return result
