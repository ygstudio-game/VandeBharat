"""
Phase C integration — chained C1..C5 pipeline over a synthetic multi-camera train
pass with ground truth. Asserts the acceptance bar: precision >= 0.95, recall >= 0.92,
false-positive alert rate < 2%. Routing is driven entirely by the algorithm modules
(no hardcoded verdicts).
"""
from correlate_v2 import correlate_candidate
from baseline import BaselineLearner

WEIGHTS = {"cam1": 0.5, "cam2": 0.3, "cam3": 0.2}


def _obs(cam, detected, conf, fc=8, iq=0.9, ocr=0.9):
    return {"camera_id": cam, "detected": detected, "confidence": conf,
            "frame_count": fc, "image_quality": iq, "ocr_confidence": ocr}


def _true_defect(cls):
    # a genuine, alert-worthy defect: seen strongly across the camera array, many frames
    return cls, 0, [_obs("cam1", True, 0.93, fc=10), _obs("cam2", True, 0.91, fc=10),
                    _obs("cam3", True, 0.88, fc=9)]


def _phantom(cls):
    # learned per-camera false positive on cam2, weak single-camera support
    return cls, 0, [_obs("cam1", False, 0.9, fc=0), _obs("cam2", True, 0.70, fc=3, iq=0.5, ocr=0.8),
                    _obs("cam3", False, 0.9, fc=0)]


def _weak_single(cls):
    # genuine-looking but weak: one camera, low conf, few frames -> should go to review
    return cls, 0, [_obs("cam1", True, 0.60, fc=2, iq=0.5, ocr=0.7),
                    _obs("cam2", False, 0.9, fc=0), _obs("cam3", False, 0.9, fc=0)]


def build_dataset():
    """Returns list of (defect_class, bogie, observations, is_true_defect)."""
    data = []
    for i in range(25):
        cls, bog, obs = _true_defect("crack")
        data.append((cls, bog, obs, True))
    for i in range(15):
        cls, bog, obs = _phantom("shadow_fp")
        data.append((cls, bog, obs, False))
    for i in range(10):
        cls, bog, obs = _weak_single("rust")
        data.append((cls, bog, obs, False))
    return data


def test_phase_c_precision_recall_acceptance():
    # baseline has learned the cam2 shadow phantom over 20 clean trains
    bl = BaselineLearner(window=20)
    for _ in range(20):
        bl.observe_clean_train("cam2", {"shadow_fp"})

    data = build_dataset()
    tp = fp = fn = tn = 0
    for cls, bog, obs, is_true in data:
        out = correlate_candidate(cls, bog, obs, WEIGHTS, baseline=bl, threshold=0.92)
        alerted = out.route == "confirm"
        if is_true and alerted:
            tp += 1
        elif is_true and not alerted:
            fn += 1
        elif not is_true and alerted:
            fp += 1
        else:
            tn += 1

    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    fp_rate = fp / len(data)

    assert precision >= 0.95, f"precision {precision:.3f}"
    assert recall >= 0.92, f"recall {recall:.3f}"
    assert fp_rate < 0.02, f"fp_rate {fp_rate:.3f}"


def test_phantom_suppressed_only_with_baseline():
    cls, bog, obs = _phantom("shadow_fp")
    # without baseline the phantom scores higher than with it
    no_bl = correlate_candidate(cls, bog, obs, WEIGHTS, baseline=None)
    bl = BaselineLearner(window=20)
    for _ in range(20):
        bl.observe_clean_train("cam2", {"shadow_fp"})
    with_bl = correlate_candidate(cls, bog, obs, WEIGHTS, baseline=bl)
    assert with_bl.fused_confidence < no_bl.fused_confidence
    assert with_bl.route == "review"
