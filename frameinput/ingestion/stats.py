"""
StatsThread — prints a live terminal line every second showing per-camera FPS,
combined throughput, ring buffer fill, and total drop count.

Phase 2, Task 2.4.

Example output line:
  [DAQ 00:00:05]  cam0: 80.1  cam1: 79.9  cam2: 80.0  cam3: 80.2 |
                  cam4: 54.0  cam5: 53.9  cam6: 54.1  cam7: 54.0 |
                  buf: 12/2048 (0.6%)  |  total: 43,200 frames  |
                  963.2 MB/s  |  dropped: 0
"""
import threading
import time
from typing import List, TYPE_CHECKING

if TYPE_CHECKING:
    from ingestion.simulator import IdsSimulatorSource
    from ingestion.ring_buffer import BoundedFrameBuffer


class StatsThread:
    def __init__(
        self,
        cameras: "List[IdsSimulatorSource]",
        buffer:  "BoundedFrameBuffer",
        interval_s: float = 1.0,
    ):
        self._cameras    = cameras
        self._buffer     = buffer
        self._interval   = interval_s
        self._running    = threading.Event()
        self._thread: threading.Thread | None = None
        self._start_time = 0.0
        # per-camera frame count at last tick — for per-second delta FPS
        self._last_counts: List[int] = [0] * len(cameras)

    def start(self) -> None:
        self._start_time = time.perf_counter()
        self._running.set()
        self._thread = threading.Thread(
            target=self._run, name="stats", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._running.clear()
        if self._thread:
            self._thread.join(timeout=2.0)

    def _run(self) -> None:
        while self._running.is_set():
            time.sleep(self._interval)
            self._print_line()

    def _print_line(self) -> None:
        elapsed   = time.perf_counter() - self._start_time
        h, rem    = divmod(int(elapsed), 3600)
        m, s      = divmod(rem, 60)
        timestamp = f"{h:02d}:{m:02d}:{s:02d}"

        cam_parts: List[str] = []
        total_bytes_this_sec = 0
        for i, cam in enumerate(self._cameras):
            cur     = cam.frames_generated
            delta   = cur - self._last_counts[i]
            self._last_counts[i] = cur
            cam_parts.append(f"cam{cam.camera_id}: {delta:5.1f}")
            total_bytes_this_sec += delta * cam.width * cam.height

        throughput_mbs = total_bytes_this_sec / 1e6

        cams_5040 = "  ".join(cam_parts[:4])
        cams_50c0 = "  ".join(cam_parts[4:])
        buf_len   = len(self._buffer)
        buf_fill  = self._buffer.fill_ratio * 100
        total_f   = sum(c.frames_generated for c in self._cameras)
        dropped   = self._buffer.frames_dropped

        line = (
            f"\r[DAQ {timestamp}]  "
            f"{cams_5040}  |  {cams_50c0}  |  "
            f"buf: {buf_len}/{self._buffer.capacity} ({buf_fill:.1f}%)  |  "
            f"total: {total_f:,} frames  |  "
            f"{throughput_mbs:.1f} MB/s  |  "
            f"dropped: {dropped}"
        )
        print(line, end="", flush=True)
