"""
Integration tier (B1) — proves frames land on the real Redis stream
`vande:stream:ingest` with strictly increasing frame_number.

Uses SyntheticSource (no cv2 needed) + the real RedisPublisher, so it only
requires Redis. Run in compose:

    docker compose -f docker-compose.test.yml up -d redis
    INGEST_REDIS_URL=redis://127.0.0.1:6379 pytest -m integration \
        services/ingestion/tests/test_redis_integration.py
"""
import os
import pytest

pytestmark = pytest.mark.integration

REDIS_URL = os.environ.get("INGEST_REDIS_URL", "redis://127.0.0.1:6379")


@pytest.fixture
def redis_client():
    redis = pytest.importorskip("redis")
    r = redis.Redis.from_url(REDIS_URL)
    try:
        r.ping()
    except Exception:
        pytest.skip("Redis not reachable")
    # isolate: use a throwaway stream name via monkeypatched publisher
    return r


def test_frames_published_to_stream_monotonic(redis_client):
    import sys
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from frame import FrameNumberer
    from buffer import BoundedFrameBuffer
    from source import SyntheticSource
    from store import NullStore
    from publisher import RedisPublisher
    from pipeline import IngestionPipeline

    pub = RedisPublisher(REDIS_URL)
    pub.STREAM = f"vande:stream:ingest:test:{os.getpid()}"
    redis_client.delete(pub.STREAM)

    p = IngestionPipeline(SyntheticSource(camera_id=0), BoundedFrameBuffer(200),
                          NullStore(), pub, numberer=FrameNumberer())
    p.run(30)

    entries = redis_client.xrange(pub.STREAM)
    nums = [int(fields[b"frame_number"]) for _id, fields in entries]
    assert nums == list(range(30))                      # strictly increasing, no gaps
    # only references travel through Redis — never raw image bytes
    assert all(b"frame_ref" in fields for _id, fields in entries)
    redis_client.delete(pub.STREAM)
