"""
Wiring test — aggregate_candidates turns per-frame YOLO results into the
per-(defect_class) multi-camera observations the Phase-C pipeline consumes, and
the chained pipeline produces a route. No DB / no network.
"""
from engine import aggregate_candidates
from correlate_v2 import correlate_candidate


def _fr(cam, label, conf, defect=True):
    return ({"session_camera_id": cam},
            [{"label": label, "confidence": conf, "defect": defect}])


def test_groups_by_class_and_camera_with_max_conf_and_frame_count():
    frame_results = [
        _fr("camA", "crack", 0.90),
        _fr("camA", "crack", 0.80),          # same cam, 2nd frame -> frame_count 2, max 0.90
        _fr("camB", "crack", 0.85),
        _fr("camB", "spring", 0.70, defect=False),  # non-defect -> ignored
    ]
    cands, weights = aggregate_candidates(frame_results)
    assert weights == {"camA": 1.0, "camB": 1.0}
    assert len(cands) == 1
    cls, bogie, obs = cands[0]
    assert cls == "crack" and bogie == 0
    by_cam = {o["camera_id"]: o for o in obs}
    assert by_cam["camA"]["confidence"] == 0.90 and by_cam["camA"]["frame_count"] == 2
    assert by_cam["camB"]["confidence"] == 0.85 and by_cam["camB"]["frame_count"] == 1
    assert all(o["detected"] for o in obs)


def test_camera_that_saw_coach_but_missed_defect_is_non_detecting():
    frame_results = [
        _fr("camA", "crack", 0.9),
        _fr("camB", "spring", 0.6, defect=False),   # camB present, no defect of this class
    ]
    cands, _ = aggregate_candidates(frame_results)
    cls, _b, obs = cands[0]
    by_cam = {o["camera_id"]: o for o in obs}
    assert by_cam["camB"]["detected"] is False
    assert by_cam["camB"]["frame_count"] == 0


def test_no_defect_frames_yield_no_candidates():
    cands, _ = aggregate_candidates([_fr("camA", "spring", 0.6, defect=False)])
    assert cands == []


def test_pipeline_routes_aggregated_candidate():
    # strong multi-camera crack -> pipeline should CONFIRM
    frame_results = [_fr("camA", "crack", 0.93), _fr("camA", "crack", 0.9),
                     _fr("camB", "crack", 0.91), _fr("camC", "crack", 0.88)]
    cands, weights = aggregate_candidates(frame_results, ocr_confidence=0.95)
    cls, bogie, obs = cands[0]
    # boost frame_count so tracking-stability T is high (single-cam frames here are few)
    for o in obs:
        if o["detected"]:
            o["frame_count"] = 10
    out = correlate_candidate(cls, bogie, obs, weights, threshold=0.92)
    assert out.route in ("confirm", "review")
    assert 0.0 <= out.score <= 1.0
