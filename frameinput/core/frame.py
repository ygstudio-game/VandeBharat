"""
FramePacket — the single data structure exchanged between every DAQ service.

All fields are set at acquisition time (by the receiver/simulator).
Nothing downstream mutates this except is_dropped, which the ring buffer
sets when it evicts a frame due to back-pressure.
"""
import threading
from dataclasses import dataclass


@dataclass
class FramePacket:
    internal_frame_id: int      # global monotonic ID across all cameras (set by GlobalFrameNumberer)
    camera_id:         int      # 0–7
    camera_frame_id:   int      # per-camera GigE Vision Block ID (monotonic per camera)
    hw_timestamp_us:   int      # microseconds since Unix epoch at capture time
    width:             int      # pixel columns
    height:            int      # pixel rows
    pixel_format:      str      # "BayerRG8" | "Mono8" | "RGB8"
    payload:           bytes    # raw pixel bytes; length == width * height for BayerRG8
    is_dropped:        bool = False


class GlobalFrameNumberer:
    """
    Thread-safe monotonic counter shared by all 8 camera threads.

    Each call to next() returns a unique, strictly increasing integer.
    This is the primary key that ties a chunk byte-offset to a metadata row.
    """

    def __init__(self, start: int = 0):
        self._n = start
        self._lock = threading.Lock()

    def next(self) -> int:
        with self._lock:
            val = self._n
            self._n += 1
            return val

    @property
    def value(self) -> int:
        """Non-authoritative read — use for metrics/display only."""
        with self._lock:
            return self._n
