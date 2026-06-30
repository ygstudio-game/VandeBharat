"""C2 — multi-camera voting tests (anchored to competitor's worked example)."""
from voting import Observation, vote

WEIGHTS = {"cam3": 0.50, "cam4": 0.30, "cam5": 0.20}


def test_competitor_worked_example_0_743():
    obs = [
        Observation("cam3", True, 0.91),
        Observation("cam4", True, 0.94),
        Observation("cam5", False, 0.97),   # "No Defect" with conf 0.97 -> contributes 0.20*0.03
    ]
    r = vote(obs, WEIGHTS)
    assert abs(r.weighted_confidence - 0.743) < 1e-3
    assert abs(r.agreement - 0.80) < 1e-9    # cam3+cam4 weight = 0.8 of 1.0
    assert r.n_cameras == 3


def test_unanimous_yes_high_confidence():
    obs = [Observation(c, True, 0.9) for c in WEIGHTS]
    r = vote(obs, WEIGHTS)
    assert r.agreement == 1.0
    assert r.weighted_confidence > 0.89


def test_unanimous_no_low_confidence():
    obs = [Observation(c, False, 0.95) for c in WEIGHTS]
    r = vote(obs, WEIGHTS)
    assert r.agreement == 0.0
    assert r.weighted_confidence < 0.1


def test_missing_camera_degrades_gracefully():
    # cam5 absent -> renormalize over cam3+cam4 only
    obs = [Observation("cam3", True, 0.91), Observation("cam4", True, 0.94)]
    r = vote(obs, WEIGHTS)
    assert r.n_cameras == 2
    assert r.agreement == 1.0
    expected = (0.50 * 0.91 + 0.30 * 0.94) / 0.80
    assert abs(r.weighted_confidence - expected) < 1e-9


def test_no_known_cameras_returns_zero():
    r = vote([Observation("camX", True, 0.9)], WEIGHTS)
    assert r.n_cameras == 0
    assert r.weighted_confidence == 0.0
