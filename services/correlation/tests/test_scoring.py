"""C4 — composite alert score routing tests (anchored to competitor example)."""
from scoring import composite_score, route_event, DEFAULT_THRESHOLD


def test_competitor_worked_example_0_886_routes_to_review():
    s = composite_score(Y=0.94, T=0.85, M=0.80, Q=0.90, Ocr=0.92)
    assert abs(s - 0.886) < 1e-3
    r = route_event(0.94, 0.85, 0.80, 0.90, 0.92)
    assert r.route == "review"               # 0.886 < 0.92 -> human review, not auto-alert


def test_high_evidence_confirms():
    r = route_event(0.98, 0.95, 0.95, 0.95, 0.95)
    assert r.score >= DEFAULT_THRESHOLD
    assert r.route == "confirm"


def test_threshold_is_configurable():
    r = route_event(0.94, 0.85, 0.80, 0.90, 0.92, threshold=0.85)
    assert r.route == "confirm"              # same event confirms under a looser threshold


def test_weights_sum_to_one():
    from scoring import WEIGHTS
    assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9
