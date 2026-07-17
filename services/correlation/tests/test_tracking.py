"""C1 — tracking-based duplicate suppression tests."""
from tracking import Tracker, iou


def test_iou_basic():
    assert iou((0, 0, 10, 10), (0, 0, 10, 10)) == 1.0
    assert iou((0, 0, 10, 10), (100, 100, 110, 110)) == 0.0
    assert 0.0 < iou((0, 0, 10, 10), (5, 5, 15, 15)) < 1.0


def test_same_defect_on_consecutive_frames_is_one_event():
    tr = Tracker(iou_threshold=0.3, max_age=5)
    box = [100, 100, 140, 160]
    for f, conf in [(210, 0.87), (211, 0.91), (212, 0.93)]:
        tr.update([{"class": "spring_missing", "bbox": box, "confidence": conf}], f)
    events = tr.merged_events()
    assert len(events) == 1
    assert events[0].frame_count == 3
    assert events[0].confidence == 0.93          # max, not sum/avg


def test_two_distinct_springs_stay_separate():
    tr = Tracker(iou_threshold=0.3, max_age=5)
    tr.update([{"class": "spring_missing", "bbox": [100, 100, 140, 160], "confidence": 0.9}], 1)
    tr.update([{"class": "spring_missing", "bbox": [400, 100, 440, 160], "confidence": 0.8}], 1)
    assert len(tr.merged_events()) == 2


def test_never_merge_across_bogies():
    tr = Tracker(iou_threshold=0.1, max_age=5)
    # identical box + class but different bogie_id -> must NOT merge
    tr.update([{"class": "spring_missing", "bbox": [100, 100, 140, 160],
                "confidence": 0.9, "bogie_id": 0}], 1)
    tr.update([{"class": "spring_missing", "bbox": [100, 100, 140, 160],
                "confidence": 0.9, "bogie_id": 1}], 1)
    assert len(tr.merged_events()) == 2


def test_different_class_same_box_not_merged():
    tr = Tracker(iou_threshold=0.1, max_age=5)
    tr.update([{"class": "spring_missing", "bbox": [100, 100, 140, 160], "confidence": 0.9}], 1)
    tr.update([{"class": "brake_worn", "bbox": [100, 100, 140, 160], "confidence": 0.9}], 1)
    assert len(tr.merged_events()) == 2


def test_15_frames_collapse_to_one():
    tr = Tracker(iou_threshold=0.3, max_age=5)
    box = [50, 50, 90, 110]
    for f in range(15):
        tr.update([{"class": "oil_leak", "bbox": box, "confidence": 0.7 + f * 0.01}], f)
    events = tr.merged_events()
    assert len(events) == 1
    assert events[0].frame_count == 15
