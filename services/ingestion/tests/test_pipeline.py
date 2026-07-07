"""
End-to-end pipeline proof (B1) — real IngestionPipeline driven by a synthetic
source + in-memory publisher. No cv2, no Redis: verifies the actual production
logic, not a mock of it.
"""
from frame import FrameNumberer
from buffer import BoundedFrameBuffer
from source import SyntheticSource
from store import NullStore
from publisher import InMemoryPublisher
from pipeline import IngestionPipeline


def _make(source, capacity=200):
    return IngestionPipeline(
        source,
        BoundedFrameBuffer(capacity),
        NullStore(),
        InMemoryPublisher(),
        numberer=FrameNumberer(),
        sleeper=lambda _s: None,          # no real sleep in tests
        clock=_make_clock(),
    )


def _make_clock():
    t = {"v": 0.0}
    def clock():
        t["v"] += 1.0
        return t["v"]
    return clock


def test_published_frame_numbers_strictly_increasing():
    p = _make(SyntheticSource(camera_id=0))
    p.run(50)
    pub = p.publisher.published
    nums = [pkt.frame_number for pkt, _ref in pub]
    assert nums == list(range(50))                      # strictly increasing, no gaps
    assert p.frames_published == 50
    assert p.frames_dropped == 0


def test_timestamps_monotonic():
    p = _make(SyntheticSource(camera_id=2))
    p.run(20)
    ts = [pkt.timestamp_ms for pkt, _ in p.publisher.published]
    assert all(b > a for a, b in zip(ts, ts[1:]))


def test_frame_ref_published_not_raw_bytes():
    p = _make(SyntheticSource(camera_id=1))
    p.run(3)
    _pkt, ref = p.publisher.published[0]
    assert ref == "mem://1/0"                           # reference, not image bytes


def test_backpressure_drops_oldest_without_blocking():
    # produce many WITHOUT draining -> buffer overflows, oldest dropped, no stall
    src = SyntheticSource(camera_id=0)
    p = _make(src, capacity=5)
    for _ in range(12):
        p.produce_one()                                 # never blocks
    assert p.frames_produced == 12
    assert p.frames_dropped == 7                         # 12 - capacity 5
    survivors = [pkt.frame_number for pkt in p.buffer.snapshot()]
    assert survivors == [7, 8, 9, 10, 11]               # newest kept, in order


def test_reconnect_then_continue_no_crash():
    # source fails on reads 3 and 4, then recovers; pipeline must reconnect & continue
    src = SyntheticSource(camera_id=0, fail_at=(3, 4))
    p = _make(src)
    p.run(8)
    nums = [pkt.frame_number for pkt, _ in p.publisher.published]
    assert nums == list(range(8))                       # 8 frames still delivered, monotonic
    assert p.reconnects == 2                             # two transient failures recovered
    assert src.reconnects == 2
