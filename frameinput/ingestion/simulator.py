"""
IdsSimulatorSource — synthetic BayerRG8 camera, one instance per camera thread.

Implements the same interface that IdsPeakSource will expose when the physical
IDS GigE Vision cameras arrive. Swapping simulator for real cameras requires
changing one line in pipeline.py; everything downstream is unchanged.

Frame generation strategy
─────────────────────────
16 frames per camera are pre-baked at startup using numpy. The hot path
cycles through them so the GIL-held Python loop only does list indexing and
FramePacket construction — no numpy in the hot path.

Each pre-baked frame is a gradient + camera-ID watermark stripe so frames
from different cameras are visually distinguishable after demosaic.

FPS pacing
──────────
Uses an absolute deadline ticker (next_tick += interval) so that scheduling
jitter does not accumulate over time. If the thread falls more than one
interval behind it resets the ticker to avoid a frame-burst catch-up spiral.
"""
import itertools
import threading
import time
from typing import List

import numpy as np

from core.frame import FramePacket, GlobalFrameNumberer
from ingestion.ring_buffer import BoundedFrameBuffer

_PRECOMPUTED_COUNT = 16   # number of distinct frames to pre-bake per camera


def _precompute_bayer_frames(width: int, height: int, camera_id: int) -> List[bytes]:
    """
    Return _PRECOMPUTED_COUNT distinct BayerRG8 byte strings for one camera.

    Pattern: diagonal gradient (row+col) shifted per frame index so consecutive
    frames differ. A horizontal stripe at 10% height is set to a camera-specific
    value so frames from different cameras can be told apart visually.
    """
    frames = []
    stripe_row = max(0, min(height - 1, height // 10))
    stripe_val = (camera_id * 32) % 256

    for i in range(_PRECOMPUTED_COUNT):
        # use int16 for arithmetic so additions never overflow before the modulo
        row = np.arange(width, dtype=np.int16)
        col = (np.arange(height, dtype=np.int16) + camera_id * 17 + i * 13).reshape(-1, 1)
        mat = ((row + col) % 256).astype(np.uint8)
        mat[stripe_row, :] = stripe_val
        frames.append(mat.tobytes())

    return frames


class IdsSimulatorSource:
    """
    Simulates one IDS GigE Vision camera.

    Each instance runs in its own daemon thread (start_thread()).
    It pushes FramePackets into the shared BoundedFrameBuffer at the
    configured FPS until stop() is called.
    """

    def __init__(
        self,
        camera_id:  int,
        width:      int,
        height:     int,
        fps:        float,
        numberer:   GlobalFrameNumberer,
        buffer:     BoundedFrameBuffer,
    ):
        self.camera_id  = camera_id
        self.width      = width
        self.height     = height
        self.fps        = fps
        self._numberer  = numberer
        self._buffer    = buffer

        self._precomputed: List[bytes] = _precompute_bayer_frames(width, height, camera_id)
        self._local_counter            = itertools.count()   # camera_frame_id sequence
        self._running                  = threading.Event()
        self._thread: threading.Thread | None = None

        # ── stats (read from StatsThread, written from camera thread) ──────────
        self.frames_generated = 0
        self.frames_late      = 0   # times the thread couldn't meet its deadline

    # ── internal loop ──────────────────────────────────────────────────────────

    def _run(self) -> None:
        interval  = 1.0 / self.fps
        next_tick = time.perf_counter() + interval

        while self._running.is_set():
            now = time.perf_counter()
            sleep_s = next_tick - now
            if sleep_s > 0:
                time.sleep(sleep_s)

            local_id = next(self._local_counter)
            pkt = FramePacket(
                internal_frame_id = self._numberer.next(),
                camera_id         = self.camera_id,
                camera_frame_id   = local_id,
                hw_timestamp_us   = time.time_ns() // 1000,
                width             = self.width,
                height            = self.height,
                pixel_format      = "BayerRG8",
                payload           = self._precomputed[local_id % _PRECOMPUTED_COUNT],
            )
            self._buffer.push(pkt)
            self.frames_generated += 1

            next_tick += interval
            # if we are already more than one full interval behind, reset the
            # ticker to avoid an unbounded catch-up burst
            if time.perf_counter() > next_tick + interval:
                self.frames_late += 1
                next_tick = time.perf_counter() + interval

    # ── public API ─────────────────────────────────────────────────────────────

    def start_thread(self) -> threading.Thread:
        self._running.set()
        self._thread = threading.Thread(
            target=self._run,
            name=f"sim-cam{self.camera_id}",
            daemon=True,
        )
        self._thread.start()
        return self._thread

    def stop(self, timeout: float = 2.0) -> None:
        self._running.clear()
        if self._thread is not None:
            self._thread.join(timeout=timeout)


# ── convenience rig ───────────────────────────────────────────────────────────

class CameraRig:
    """
    Creates and manages all 8 simulated cameras.

    Camera IDs 0–3 : GV-5040CP  (1 456 × 1 088, 80 FPS, BayerRG8)
    Camera IDs 4–7 : GV-50C0CP  (1 936 × 1 216, 54 FPS, BayerRG8)
    """

    _SPECS = {
        "GV-5040CP": {"width": 1456, "height": 1088, "fps": 80.0, "count": 4},
        "GV-50C0CP": {"width": 1936, "height": 1216, "fps": 54.0, "count": 4},
    }

    def __init__(self, numberer: GlobalFrameNumberer, buffer: BoundedFrameBuffer):
        self.cameras: List[IdsSimulatorSource] = []
        cam_id = 0
        for model, spec in self._SPECS.items():
            for _ in range(spec["count"]):
                self.cameras.append(IdsSimulatorSource(
                    camera_id = cam_id,
                    width     = spec["width"],
                    height    = spec["height"],
                    fps       = spec["fps"],
                    numberer  = numberer,
                    buffer    = buffer,
                ))
                cam_id += 1

    def start(self) -> None:
        for cam in self.cameras:
            cam.start_thread()

    def stop(self) -> None:
        for cam in self.cameras:
            cam.stop()

    @property
    def total_frames(self) -> int:
        return sum(c.frames_generated for c in self.cameras)

    @property
    def total_bytes_per_second(self) -> float:
        """Theoretical peak throughput in bytes/sec at configured FPS."""
        return sum(c.fps * c.width * c.height for c in self.cameras)

    def per_camera_stats(self, elapsed_s: float) -> List[dict]:
        return [
            {
                "camera_id":    c.camera_id,
                "fps_target":   c.fps,
                "fps_actual":   round(c.frames_generated / max(elapsed_s, 0.001), 1),
                "frames":       c.frames_generated,
                "late_ticks":   c.frames_late,
            }
            for c in self.cameras
        ]
