"""
B2 quality pre-screen tests — accuracy on labeled fixtures + perf + reasons.
Pure numpy fixtures (no cv2): deterministic, CI-safe.
"""
import time
import numpy as np

from quality_gate import QualityGate, laplacian_variance, brightness


GATE = QualityGate(blur_threshold=100.0, brightness_min=20.0, brightness_max=240.0)


# ---- synthetic fixture generators (label -> array) ----
def make_sharp(seed):
    rng = np.random.default_rng(seed)
    return rng.integers(0, 256, size=(128, 128), dtype=np.uint8)  # high variance, mid brightness


def make_blurry(seed):
    rng = np.random.default_rng(seed)
    base = np.full((128, 128), 128, dtype=np.float64)
    base += rng.normal(0, 1.0, size=base.shape)   # tiny noise -> low Laplacian variance
    return np.clip(base, 0, 255).astype(np.uint8)


def make_dark(seed):
    rng = np.random.default_rng(seed)
    return (rng.integers(0, 256, size=(128, 128)) // 40).astype(np.uint8)  # mean < 20


def make_bright(seed):
    rng = np.random.default_rng(seed)
    return np.clip(rng.integers(245, 256, size=(128, 128)), 0, 255).astype(np.uint8)  # mean > 240


def test_reason_classification():
    assert GATE.assess(make_sharp(1)).reason == "ok"
    assert GATE.assess(make_blurry(1)).reason == "blurry"
    assert GATE.assess(make_dark(1)).reason == "too_dark"
    assert GATE.assess(make_bright(1)).reason == "too_bright"


def test_accuracy_on_labeled_set_ge_95pct():
    samples = []
    for s in range(25):
        samples.append((make_sharp(s), True))
        samples.append((make_blurry(s), False))
        samples.append((make_dark(s), False))
        samples.append((make_bright(s), False))
    correct = sum(1 for arr, expected in samples if GATE.assess(arr).accepted == expected)
    acc = correct / len(samples)
    assert acc >= 0.95, f"accuracy {acc:.3f} < 0.95"


def test_perf_under_1ms_on_roi():
    # competitor screens an ROI crop (~256x256), not the full frame
    img = np.random.default_rng(0).integers(0, 256, size=(256, 256), dtype=np.uint8)
    N = 200
    t0 = time.perf_counter()
    for _ in range(N):
        GATE.assess(img)
    per_ms = (time.perf_counter() - t0) / N * 1000
    assert per_ms < 1.0, f"{per_ms:.3f} ms/frame >= 1.0 ms"


def test_sharp_has_higher_variance_than_blurry():
    assert laplacian_variance(make_sharp(2).astype(np.float64)) > \
           laplacian_variance(make_blurry(2).astype(np.float64))


def test_brightness_bounds():
    assert brightness(make_dark(3)) < 20
    assert brightness(make_bright(3)) > 240


def test_from_config_reads_thresholds():
    g = QualityGate.from_config({"quality": {"blur_threshold": 50, "brightness_min": 5, "brightness_max": 250}})
    assert g.blur_threshold == 50
    assert g.brightness_min == 5
    assert g.brightness_max == 250
