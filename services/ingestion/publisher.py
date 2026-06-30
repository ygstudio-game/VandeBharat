"""
Frame publishers (B1).

Publisher is the stable interface. B1 ships:
  - InMemoryPublisher : collects packets in a list — used by unit tests to prove
                        the end-to-end pipeline produces monotonic frames.
  - RedisPublisher    : XADD frame *references* onto vande:stream:ingest. Image
                        bytes go to a frame store (path/URL); only the reference
                        travels through Redis (never raw image bytes).
"""
from abc import ABC, abstractmethod

from frame import FramePacket


class Publisher(ABC):
    @abstractmethod
    def publish(self, pkt: FramePacket, frame_ref: str) -> None:
        ...


class InMemoryPublisher(Publisher):
    def __init__(self):
        self.published: list[tuple[FramePacket, str]] = []

    def publish(self, pkt: FramePacket, frame_ref: str) -> None:
        self.published.append((pkt, frame_ref))


class RedisPublisher(Publisher):
    """Integration tier — needs redis. Stores only metadata + frame_ref."""

    STREAM = "vande:stream:ingest"

    def __init__(self, redis_url: str, maxlen: int = 10000):
        import redis  # lazy
        self._r = redis.Redis.from_url(redis_url)
        self.maxlen = maxlen

    def publish(self, pkt: FramePacket, frame_ref: str) -> None:
        import time
        self._r.xadd(
            self.STREAM,
            {
                "camera_id": pkt.camera_id,
                "frame_number": pkt.frame_number,
                "timestamp_ms": pkt.timestamp_ms,        # monotonic (intra-process ordering)
                "ingest_epoch_ms": time.time() * 1000.0,  # wall clock (cross-process latency, B5)
                "trigger_id": pkt.trigger_id or "",
                "frame_ref": frame_ref,
            },
            maxlen=self.maxlen,
            approximate=True,
        )
