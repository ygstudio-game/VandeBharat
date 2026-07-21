"""
Smoke tests for Phase 2 — camera simulator + ring buffer.

Run from frameinput/:
    pytest ingestion/test_simulator_smoke.py -v -s

All tests are self-contained: no postgres, no NATS, no Docker.
They verify that:
  - a single camera holds its target FPS within ±10 %
  - all 8 cameras together hit ≥ 800 MB/s combined throughput
  - the ring buffer does not deadlock under sustained 8-camera load
  - dropped frames are counted (not silently lost) when the buffer is small
  - frame payloads have the correct byte length (width × height for BayerRG8)
  - internal_frame_id values are strictly increasing across cameras
"""
import time
import threading
from typing import List

import pytest

from core.frame import GlobalFrameNumberer
from ingestion.ring_buffer import BoundedFrameBuffer
from ingestion.simulator import IdsSimulatorSource, CameraRig

DURATION_S  = 2.0
TOLERANCE   = 0.10   # ±10 % FPS tolerance


# ── helpers ────────────────────────────────────────────────────────────────────

def _make_rig(buffer_capacity: int = 8192) -> tuple[CameraRig, BoundedFrameBuffer]:
    numberer = GlobalFrameNumberer()
    buffer   = BoundedFrameBuffer(capacity=buffer_capacity)
    rig      = CameraRig(numberer, buffer)
    return rig, buffer


# ── tests ──────────────────────────────────────────────────────────────────────

def test_single_camera_holds_fps():
    """GV-5040CP camera (1456×1088, 80 FPS) holds target FPS for 2 s."""
    numberer = GlobalFrameNumberer()
    buffer   = BoundedFrameBuffer(capacity=4096)
    cam = IdsSimulatorSource(
        camera_id=0, width=1456, height=1088, fps=80.0,
        numberer=numberer, buffer=buffer,
    )
    cam.start_thread()
    time.sleep(DURATION_S)
    cam.stop()

    actual_fps = cam.frames_generated / DURATION_S
    assert abs(actual_fps - 80.0) / 80.0 < TOLERANCE, (
        f"cam0 expected ~80 FPS, got {actual_fps:.1f}"
    )


def test_second_camera_model_holds_fps():
    """GV-50C0CP camera (1936×1216, 54 FPS) holds target FPS for 2 s."""
    numberer = GlobalFrameNumberer()
    buffer   = BoundedFrameBuffer(capacity=4096)
    cam = IdsSimulatorSource(
        camera_id=4, width=1936, height=1216, fps=54.0,
        numberer=numberer, buffer=buffer,
    )
    cam.start_thread()
    time.sleep(DURATION_S)
    cam.stop()

    actual_fps = cam.frames_generated / DURATION_S
    assert abs(actual_fps - 54.0) / 54.0 < TOLERANCE, (
        f"cam4 expected ~54 FPS, got {actual_fps:.1f}"
    )


def test_all_8_cameras_combined_throughput():
    """
    All 8 cameras running simultaneously produce ≥ 800 MB/s combined.
    Each camera stays within ±10 % of its target FPS.
    """
    rig, buffer = _make_rig()
    rig.start()
    time.sleep(DURATION_S)
    rig.stop()

    total_bytes = 0
    for cam in rig.cameras:
        actual_fps = cam.frames_generated / DURATION_S
        assert abs(actual_fps - cam.fps) / cam.fps < TOLERANCE, (
            f"cam{cam.camera_id}: expected ~{cam.fps} FPS, got {actual_fps:.1f}"
        )
        total_bytes += cam.frames_generated * cam.width * cam.height

    throughput_mbs = total_bytes / DURATION_S / 1e6
    print(f"\n  Combined throughput: {throughput_mbs:.1f} MB/s")
    assert throughput_mbs > 800, (
        f"Expected > 800 MB/s, got {throughput_mbs:.1f} MB/s"
    )


def test_frame_payload_size_matches_dimensions():
    """Every frame's payload length == width × height (BayerRG8 = 1 byte/pixel)."""
    numberer = GlobalFrameNumberer()
    buffer   = BoundedFrameBuffer(capacity=512)
    cam = IdsSimulatorSource(
        camera_id=0, width=1456, height=1088, fps=80.0,
        numberer=numberer, buffer=buffer,
    )
    cam.start_thread()
    time.sleep(0.2)
    cam.stop()

    checked = 0
    while True:
        pkt = buffer.pop()
        if pkt is None:
            break
        assert len(pkt.payload) == pkt.width * pkt.height, (
            f"frame {pkt.internal_frame_id}: payload {len(pkt.payload)} != "
            f"{pkt.width}×{pkt.height}={pkt.width * pkt.height}"
        )
        assert pkt.pixel_format == "BayerRG8"
        checked += 1

    assert checked > 0, "No frames were generated"


def test_internal_frame_ids_are_strictly_increasing():
    """
    With 8 concurrent camera threads sharing one GlobalFrameNumberer,
    all collected internal_frame_ids must be unique and contiguous (0, 1, 2, …).
    """
    numberer = GlobalFrameNumberer()
    buffer   = BoundedFrameBuffer(capacity=16384)
    rig      = CameraRig(numberer, buffer)

    rig.start()
    time.sleep(0.5)
    rig.stop()

    ids: List[int] = []
    while True:
        pkt = buffer.pop()
        if pkt is None:
            break
        ids.append(pkt.internal_frame_id)

    assert len(ids) > 0
    ids.sort()
    # IDs must be unique
    assert len(ids) == len(set(ids)), "Duplicate internal_frame_ids detected"
    # IDs must form a contiguous range starting at 0
    assert ids[0] == 0, f"First ID should be 0, got {ids[0]}"
    assert ids == list(range(ids[0], ids[-1] + 1)), (
        "internal_frame_ids are not contiguous — gap detected"
    )


def test_ring_buffer_drop_oldest_under_overload():
    """
    With a tiny buffer (16 frames) and 8 cameras feeding it, drops must
    occur and be counted — frames must not be silently lost.
    """
    numberer = GlobalFrameNumberer()
    buffer   = BoundedFrameBuffer(capacity=16)   # intentionally tiny
    rig      = CameraRig(numberer, buffer)

    rig.start()
    time.sleep(0.5)   # let it fill and overflow
    rig.stop()

    assert buffer.frames_dropped > 0, (
        "Expected drops with a 16-frame buffer under 8-camera load"
    )
    assert buffer.frames_in > buffer.frames_dropped, (
        "More dropped than produced — something is wrong"
    )
    print(
        f"\n  frames_in={buffer.frames_in}  "
        f"dropped={buffer.frames_dropped}  "
        f"fill_ratio={buffer.fill_ratio:.2f}"
    )


def test_ring_buffer_no_deadlock_under_sustained_load():
    """
    Consumer thread pops while 8 producers push for 3 s.
    Must consume > 1 000 frames without deadlocking.
    """
    numberer = GlobalFrameNumberer()
    buffer   = BoundedFrameBuffer(capacity=512)
    rig      = CameraRig(numberer, buffer)

    consumed   = 0
    stop_event = threading.Event()

    def consumer():
        nonlocal consumed
        while not stop_event.is_set():
            pkt = buffer.pop()
            if pkt is not None:
                consumed += 1

    rig.start()
    t = threading.Thread(target=consumer, daemon=True)
    t.start()

    time.sleep(3.0)

    rig.stop()
    stop_event.set()
    t.join(timeout=2.0)

    assert consumed > 1000, f"Expected > 1 000 frames consumed, got {consumed}"
    print(f"\n  Consumed {consumed:,} frames in 3 s (dropped {buffer.frames_dropped})")


def test_fill_ratio_stays_between_0_and_1():
    """fill_ratio must always be in [0.0, 1.0] under concurrent access."""
    numberer = GlobalFrameNumberer()
    buffer   = BoundedFrameBuffer(capacity=256)
    rig      = CameraRig(numberer, buffer)

    ratios: List[float] = []
    stop_event = threading.Event()

    def sampler():
        while not stop_event.is_set():
            ratios.append(buffer.fill_ratio)
            time.sleep(0.005)

    rig.start()
    s = threading.Thread(target=sampler, daemon=True)
    s.start()

    time.sleep(1.0)

    rig.stop()
    stop_event.set()
    s.join(timeout=2.0)

    assert all(0.0 <= r <= 1.0 for r in ratios), (
        f"fill_ratio out of [0,1]: min={min(ratios):.3f} max={max(ratios):.3f}"
    )
