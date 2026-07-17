"""
B5 real-time wiring + latency tests. Real RealtimeProcessor + LatencyTracker driven
by fakes (fake clock / fake inferer) so the wiring and latency math are proven
without the full stack (Redis/DB/GPU). The <10s P95 measurement on the real stack
is the integration tier (see test_realtime_integration.py).
"""
from latency import LatencyTracker
from realtime import RealtimeProcessor


def _frame(n, ingest_ms):
    return {"frame_ref": f"mem://0/{n}", "ingest_timestamp_ms": ingest_ms}


def test_injected_defect_detected_and_latency_recorded():
    # frame 3 carries a defect; inferer flags only that frame_ref
    def inferer(ref):
        if ref == "mem://0/3":
            return [{"class": "crack", "confidence": 0.91, "is_defect": True}]
        return [{"class": "spring", "confidence": 0.8, "is_defect": False}]

    sunk = []
    clock = {"now": 0.0}
    proc = RealtimeProcessor(inferer, sunk.append, LatencyTracker(budget_ms=10_000),
                             clock=lambda: clock["now"])

    for n in range(10):
        ingest = n * 1000.0          # each frame ingested 1s apart
        clock["now"] = ingest + 2000.0   # 2s to flag
        proc.process(_frame(n, ingest))

    assert proc.defects_flagged == 1
    assert len(sunk) == 1 and sunk[0]["defect_class"] == "crack"
    assert proc.latency.count == 1
    assert proc.latency.p95 == 2000.0
    assert proc.latency.within_budget(95) is True


def test_no_defect_no_latency():
    proc = RealtimeProcessor(lambda ref: [{"class": "ok", "is_defect": False}],
                             lambda e: None, LatencyTracker(), clock=lambda: 0.0)
    for n in range(5):
        proc.process(_frame(n, 0.0))
    assert proc.defects_flagged == 0
    assert proc.latency.count == 0


def test_p95_under_budget_across_many():
    lt = LatencyTracker(budget_ms=10_000)
    clock = {"now": 0.0}
    proc = RealtimeProcessor(lambda ref: [{"class": "crack", "is_defect": True}],
                             lambda e: None, lt, clock=lambda: clock["now"])
    # 100 defects, latency 1.5s..4.5s — all well under 10s
    import random
    random.seed(0)
    for n in range(100):
        ingest = n * 100.0
        clock["now"] = ingest + random.uniform(1500, 4500)
        proc.process(_frame(n, ingest))
    assert proc.latency.count == 100
    assert proc.latency.within_budget(95)
    assert proc.latency.p95 <= 4500


def test_ten_runs_no_miss():
    # competitor-style acceptance: known injected defect detected on every run
    for run in range(10):
        hits = []
        proc = RealtimeProcessor(
            lambda ref: [{"class": "crack", "is_defect": True}] if ref.endswith("/5") else [],
            hits.append, LatencyTracker(), clock=lambda: 100.0)
        for n in range(10):
            proc.process(_frame(n, 0.0))
        assert len(hits) == 1, f"run {run} missed the defect"


def test_budget_breach_counted():
    lt = LatencyTracker(budget_ms=5_000)
    lt.record(3000)
    lt.record(8000)   # over budget
    assert lt.breaches == 1
    assert lt.within_budget(95) is False
