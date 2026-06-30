"""
B2 integration with the pipeline — a screen hook drops rejected frames before
they are buffered/published, counts reasons, and accepted frames stay monotonic.
"""
from frame import FrameNumberer
from buffer import BoundedFrameBuffer
from source import SyntheticSource
from store import NullStore
from publisher import InMemoryPublisher
from pipeline import IngestionPipeline


def _pipeline(screen):
    return IngestionPipeline(
        SyntheticSource(camera_id=0),
        BoundedFrameBuffer(200),
        NullStore(),
        InMemoryPublisher(),
        numberer=FrameNumberer(),
        sleeper=lambda _s: None,
        screen=screen,
    )


def test_rejected_frames_not_published():
    # reject every 3rd synthetic frame ("frame-0-2", "frame-0-5", ...)
    def screen(payload: bytes):
        n = int(payload.decode().rsplit("-", 1)[1])
        return (n % 3 != 2, "blurry" if n % 3 == 2 else "ok")

    p = _pipeline(screen)
    p.run(9)   # produce reads 0..8
    assert p.frames_rejected == 3            # frames 2,5,8 rejected
    assert p.frames_published == 6
    assert p.reject_reasons == {"blurry": 3}
    # published frame numbers are contiguous & monotonic (only accepted counted)
    nums = [pkt.frame_number for pkt, _ in p.publisher.published]
    assert nums == list(range(6))


def test_no_screen_publishes_all():
    p = _pipeline(None)
    p.run(5)
    assert p.frames_rejected == 0
    assert p.frames_published == 5


def test_select_skips_without_rejecting():
    # B3: scheduler-style select() skips frames -> counted as skipped, not rejected
    def select(payload: bytes):
        n = int(payload.decode().rsplit("-", 1)[1])
        return (n % 2 == 0, None, "active_stride")   # keep even, skip odd

    p = IngestionPipeline(
        SyntheticSource(camera_id=0), BoundedFrameBuffer(200), NullStore(),
        InMemoryPublisher(), numberer=FrameNumberer(), sleeper=lambda _s: None,
        select=select,
    )
    p.run(10)
    assert p.frames_skipped == 5
    assert p.frames_rejected == 0
    assert p.frames_published == 5
    nums = [pkt.frame_number for pkt, _ in p.publisher.published]
    assert nums == list(range(5))                    # accepted stay monotonic
