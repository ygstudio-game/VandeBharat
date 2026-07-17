"""C5 — per-camera false-positive baseline (inter-train learning) tests."""
from baseline import BaselineLearner


def test_recurring_phantom_suppressed_after_N_trains():
    bl = BaselineLearner(window=20)
    # a phantom "spring_missing" fires on cam3 on every clean train
    for _ in range(20):
        bl.observe_clean_train("cam3", {"spring_missing"})
    assert bl.fp_rate("cam3", "spring_missing") == 1.0
    # a future 0.7-confidence detection is wiped out
    assert bl.adjust("cam3", "spring_missing", 0.7) < 0
    assert bl.is_false_positive("cam3", "spring_missing", 0.7) is True


def test_genuine_defect_unaffected():
    bl = BaselineLearner(window=20)
    for _ in range(20):
        bl.observe_clean_train("cam3", {"spring_missing"})   # only the phantom learned
    # a class never seen on clean trains keeps its full confidence
    assert bl.fp_rate("cam3", "oil_leak") == 0.0
    assert bl.adjust("cam3", "oil_leak", 0.9) == 0.9
    assert bl.is_false_positive("cam3", "oil_leak", 0.9) is False


def test_partial_rate_partially_penalizes():
    bl = BaselineLearner(window=10)
    for i in range(10):
        bl.observe_clean_train("cam5", {"rust"} if i < 3 else set())  # 3/10 trains
    assert abs(bl.fp_rate("cam5", "rust") - 0.3) < 1e-9
    assert abs(bl.adjust("cam5", "rust", 0.8) - 0.5) < 1e-9


def test_window_caps_history():
    bl = BaselineLearner(window=5)
    for _ in range(100):
        bl.observe_clean_train("cam1", {"x"})
    assert len(bl._history["cam1"]) == 5
    assert bl.fp_rate("cam1", "x") == 1.0


def test_reset_clears_baseline():
    bl = BaselineLearner(window=5)
    for _ in range(5):
        bl.observe_clean_train("cam1", {"x"})
    bl.reset("cam1")
    assert bl.fp_rate("cam1", "x") == 0.0


def test_per_camera_isolation():
    bl = BaselineLearner(window=5)
    for _ in range(5):
        bl.observe_clean_train("cam1", {"x"})
    assert bl.fp_rate("cam2", "x") == 0.0     # cam2 unaffected by cam1's baseline
