"""
Bounded frame buffer with DROP-OLDEST back-pressure (B1).

Core reliability rule (competitor design rule #1/#2): the capture path must NEVER
block waiting on a slow consumer. When the buffer is full, the oldest frame is
dropped so the producer keeps running. Drops are counted, not silently lost.
"""
import threading
from collections import deque
from typing import Optional

from frame import FramePacket


class BoundedFrameBuffer:
    def __init__(self, capacity: int):
        if capacity < 1:
            raise ValueError("capacity must be >= 1")
        self.capacity = capacity
        self._dq: deque[FramePacket] = deque()
        self._lock = threading.Lock()
        self.frames_in = 0       # total accepted from producer
        self.frames_dropped = 0  # total dropped due to back-pressure

    def push(self, pkt: FramePacket) -> int:
        """Add a frame. If full, drop oldest. Returns number dropped (0 or 1)."""
        with self._lock:
            self.frames_in += 1
            dropped = 0
            if len(self._dq) >= self.capacity:
                old = self._dq.popleft()
                old.is_dropped = True
                self.frames_dropped += 1
                dropped = 1
            self._dq.append(pkt)
            return dropped

    def pop(self) -> Optional[FramePacket]:
        """Remove and return the oldest buffered frame, or None if empty."""
        with self._lock:
            return self._dq.popleft() if self._dq else None

    def __len__(self) -> int:
        with self._lock:
            return len(self._dq)

    def snapshot(self) -> list[FramePacket]:
        with self._lock:
            return list(self._dq)
