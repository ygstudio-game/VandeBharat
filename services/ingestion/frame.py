"""
FramePacket + monotonic frame numbering for the streaming ingestion service (B1).

Pure logic — no cv2, no Redis — so the core pipeline is unit-testable. The image
payload is treated as opaque bytes (encoded JPEG in production, anything in tests).
Mirrors the competitor's FramePacket concept (camera_id, monotonic frame_number,
hardware-ish timestamp, drop flag) adapted to our cloud/microservice stack.
"""
import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class FramePacket:
    camera_id: int
    frame_number: int          # monotonic per camera
    timestamp_ms: float        # monotonic clock, milliseconds
    payload: bytes             # opaque encoded frame (JPEG) — never raw through Redis
    trigger_id: Optional[str] = None   # cross-camera alignment key (set by upstream trigger)
    is_dropped: bool = False
    meta: dict = field(default_factory=dict)


def default_clock_ms() -> float:
    """Monotonic milliseconds. Injectable so tests are deterministic."""
    return time.monotonic() * 1000.0


class FrameNumberer:
    """Assigns strictly increasing per-camera frame numbers."""

    def __init__(self):
        self._counters: dict[int, int] = {}

    def next(self, camera_id: int) -> int:
        n = self._counters.get(camera_id, 0)
        self._counters[camera_id] = n + 1
        return n

    def current(self, camera_id: int) -> int:
        return self._counters.get(camera_id, 0)
