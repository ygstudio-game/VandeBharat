from latency import LatencyTracker


def test_percentiles_basic():
    lt = LatencyTracker(budget_ms=100)
    for v in range(1, 101):       # 1..100
        lt.record(float(v))
    assert lt.count == 100
    assert lt.p50 == 50.0
    assert lt.p95 == 95.0


def test_empty_is_zero():
    lt = LatencyTracker()
    assert lt.p50 == 0.0
    assert lt.p95 == 0.0
    assert lt.count == 0


def test_within_budget():
    lt = LatencyTracker(budget_ms=10_000)
    for v in [2000, 3000, 4000, 5000, 9000]:
        lt.record(v)
    assert lt.within_budget(95) is True
    lt.record(12_000)
    assert lt.within_budget(100) is False


def test_summary_shape():
    lt = LatencyTracker()
    lt.record(1234)
    s = lt.summary()
    assert {"count", "p50_ms", "p95_ms", "budget_ms", "breaches", "within_budget_p95"} <= set(s)
