import pytest
from frame import FramePacket
from buffer import BoundedFrameBuffer


def _pkt(n):
    return FramePacket(camera_id=0, frame_number=n, timestamp_ms=float(n), payload=b"x")


def test_capacity_must_be_positive():
    with pytest.raises(ValueError):
        BoundedFrameBuffer(0)


def test_drop_oldest_under_backlog():
    buf = BoundedFrameBuffer(3)
    drops = sum(buf.push(_pkt(i)) for i in range(5))   # push 5 into cap-3
    assert drops == 2
    assert buf.frames_dropped == 2
    assert buf.frames_in == 5
    # only the newest 3 survive, still in order
    surviving = [p.frame_number for p in buf.snapshot()]
    assert surviving == [2, 3, 4]


def test_no_drop_when_within_capacity():
    buf = BoundedFrameBuffer(10)
    for i in range(10):
        assert buf.push(_pkt(i)) == 0
    assert buf.frames_dropped == 0


def test_pop_returns_oldest_first():
    buf = BoundedFrameBuffer(5)
    for i in range(3):
        buf.push(_pkt(i))
    assert buf.pop().frame_number == 0
    assert buf.pop().frame_number == 1
    assert len(buf) == 1
