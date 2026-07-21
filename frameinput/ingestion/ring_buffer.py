"""
BoundedFrameBuffer — circular in-process ring buffer with drop-oldest policy.

The producer (camera threads) must NEVER block waiting on the consumer.
When the buffer is full, the oldest frame is evicted and its is_dropped flag
is set so the drop is counted, not silently lost.

Capacity: 2 048 frames by default.
At average frame size ~1.9 MB this holds ~3.9 GB of burst headroom,
well within the DGX Spark's 128 GB unified RAM.
"""
import threading
from collections import deque
from typing import Optional

from core.frame import FramePacket
from ingestion import metrics as _m


class BoundedFrameBuffer:

    def __init__(self, capacity: int = 2048):
        if capacity < 1:
            raise ValueError("capacity must be >= 1")
        self.capacity    = capacity
        self._dq: deque[FramePacket] = deque()
        self._lock       = threading.Lock()
        self.frames_in   = 0   # total frames pushed by producers
        self.frames_dropped = 0   # total frames evicted due to back-pressure

    def push(self, pkt: FramePacket) -> int:
        """
        Add a frame. If full, drop the oldest.
        Returns the number of frames dropped this call (0 or 1).
        """
        with self._lock:
            self.frames_in += 1
            dropped = 0
            if len(self._dq) >= self.capacity:
                evicted = self._dq.popleft()
                evicted.is_dropped = True
                self.frames_dropped += 1
                _m.frames_dropped.inc()
                dropped = 1
            self._dq.append(pkt)
            _m.buffer_fill_ratio.set(len(self._dq) / self.capacity)
            return dropped

    def pop(self) -> Optional[FramePacket]:
        """Remove and return the oldest buffered frame, or None if empty."""
        with self._lock:
            return self._dq.popleft() if self._dq else None

    @property
    def fill_ratio(self) -> float:
        """Current fill level as a fraction 0.0–1.0. Safe to read from any thread."""
        with self._lock:
            return len(self._dq) / self.capacity

    def __len__(self) -> int:
        with self._lock:
            return len(self._dq)
