"""C3 — Bayesian confidence fusion tests (anchored to competitor example)."""
from fusion import bayesian_fusion, bayesian_update


def test_competitor_worked_example_0_999():
    fused = bayesian_fusion([0.91, 0.88, 0.94], prior=0.5)
    assert abs(fused - 0.999) < 1e-3


def test_single_step_matches_manual():
    # cam3 first step in the worked example -> 0.91
    assert abs(bayesian_update(0.5, 0.91) - 0.91) < 1e-9


def test_order_independent():
    a = bayesian_fusion([0.91, 0.88, 0.94])
    b = bayesian_fusion([0.94, 0.88, 0.91])
    c = bayesian_fusion([0.88, 0.94, 0.91])
    assert abs(a - b) < 1e-12 and abs(a - c) < 1e-12


def test_disagreement_lowers_confidence():
    # a strong "no" (low confidence) pulls the posterior down
    high = bayesian_fusion([0.9, 0.9])
    mixed = bayesian_fusion([0.9, 0.9, 0.1])
    assert mixed < high


def test_extremes():
    assert bayesian_update(0.5, 1.0) == 1.0
    assert bayesian_update(0.5, 0.0) == 0.0


def test_stronger_than_naive_average():
    fused = bayesian_fusion([0.91, 0.88, 0.94])
    naive = sum([0.91, 0.88, 0.94]) / 3
    assert fused > naive   # 0.999 >> 0.91
