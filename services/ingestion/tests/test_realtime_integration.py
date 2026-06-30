"""
B5 integration tier (Redis only) — proves the real RedisFrameSource -> RealtimeProcessor
path: frames published to the stream are consumed, the injected defect is flagged,
and ingest->flag latency is recorded. YOLO is stubbed (a fake inferer) so this needs
only Redis; the full-stack GPU latency benchmark is scripts/bench_realtime.py.

    docker compose -f docker-compose.test.yml up -d redis
    INGEST_REDIS_URL=redis://127.0.0.1:6379 pytest -m integration \
        services/ingestion/tests/test_realtime_integration.py
"""
import os
import time
import pytest

pytestmark = pytest.mark.integration

REDIS_URL = os.environ.get("INGEST_REDIS_URL", "redis://127.0.0.1:6379")


def test_stream_to_defect_with_latency():
    redis = pytest.importorskip("redis")
    r = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    try:
        r.ping()
    except Exception:
        pytest.skip("Redis not reachable")

    import sys
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from realtime_consumer import RedisFrameSource
    from realtime import RealtimeProcessor
    from latency import LatencyTracker

    stream = f"vande:stream:ingest:rttest:{os.getpid()}"
    group = f"g:{os.getpid()}"
    r.delete(stream)

    now = time.time() * 1000.0
    # publish 6 frames; frame 3 is the defect frame
    for n in range(6):
        r.xadd(stream, {"frame_ref": f"/tmp/cam0/{n}.jpg",
                        "ingest_epoch_ms": now, "frame_number": n, "timestamp_ms": n})

    src = RedisFrameSource(REDIS_URL, stream=stream, group=group)

    def fake_inferer(ref):
        return [{"class": "crack", "is_defect": True}] if ref.endswith("/3.jpg") else []

    sunk = []
    lt = LatencyTracker(budget_ms=10_000)
    proc = RealtimeProcessor(fake_inferer, sunk.append, lt, clock=lambda: time.time() * 1000.0)

    events = src.read(block_ms=1000)
    for ev in events:
        proc.process(ev)
        src.ack(ev["msg_id"])

    assert proc.frames_processed == 6
    assert proc.defects_flagged == 1
    assert sunk[0]["defect_class"] == "crack"
    assert lt.count == 1
    assert lt.within_budget(95)        # sub-second in this stubbed path
    r.delete(stream)
