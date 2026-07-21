"""
Unit tests for ChunkWriter (Phase 3, Task 3.2).

All tests use tiny synthetic frames (32×32 = 1 024 bytes payload) and a
small chunk_max_bytes so rotation is fast and files stay small.
No postgres, no NATS, no Docker required.

Run from frameinput/:
    pytest ingestion/test_chunk_writer.py -v
"""
import os
import struct
import tempfile
import threading
import time
import zlib

import pytest

from core.chunk_format import (
    CHUNK_HEADER_SIZE,
    CHUNK_MAGIC,
    FRAME_HEADER_SIZE,
    FRAME_MAGIC,
    unpack_chunk_header,
    unpack_frame_header,
    compute_crc32,
)
from core.frame import FramePacket, GlobalFrameNumberer
from ingestion.chunk_writer import ChunkWriter
from ingestion.ring_buffer import BoundedFrameBuffer
from ingestion.simulator import IdsSimulatorSource


# ── helpers ────────────────────────────────────────────────────────────────────

_W, _H = 32, 32
_PAYLOAD_SIZE = _W * _H   # 1 024 bytes, BayerRG8

# A single frame record is 64 (header) + 1 024 (payload) = 1 088 bytes.
# chunk_max_bytes=4_000 → rotation after 3 frames (32 + 3×1088 = 3 296 < 4 000;
# 4th write would reach 4 384 ≥ 4 000).
_SMALL_CHUNK = 4_000


def _make_packet(internal_id: int, cam_id: int = 0, frame_number: int = 0) -> FramePacket:
    payload = bytes((internal_id + i) % 256 for i in range(_PAYLOAD_SIZE))
    return FramePacket(
        internal_frame_id = internal_id,
        camera_id         = cam_id,
        camera_frame_id   = frame_number,
        hw_timestamp_us   = 1_700_000_000_000_000 + internal_id,
        width             = _W,
        height            = _H,
        pixel_format      = "BayerRG8",
        payload           = payload,
    )


def _push_and_write(
    n_frames:   int,
    chunk_dir:  str,
    chunk_max:  int = _SMALL_CHUNK,
    on_frame   = None,
    on_chunk   = None,
) -> tuple[ChunkWriter, list[tuple[int, int]]]:
    """
    Push n_frames through buffer → ChunkWriter.
    Returns (writer, [(chunk_id, byte_offset), ...]) in frame order.
    """
    offsets: list[tuple[int, int]] = []
    lock = threading.Lock()

    def record(pkt, chunk_id, byte_offset):
        with lock:
            offsets.append((chunk_id, byte_offset))
        if on_frame:
            on_frame(pkt, chunk_id, byte_offset)

    buf = BoundedFrameBuffer(capacity=n_frames + 64)
    writer = ChunkWriter(
        chunk_dir        = chunk_dir,
        buffer           = buf,
        chunk_max_bytes  = chunk_max,
        on_frame_written = record,
        on_chunk_closed  = on_chunk,
    )
    writer.start()

    for i in range(n_frames):
        buf.push(_make_packet(internal_id=i))

    # wait until all frames are consumed
    deadline = time.perf_counter() + 10.0
    while writer.total_frames_written < n_frames:
        if time.perf_counter() > deadline:
            raise TimeoutError(f"writer stalled at {writer.total_frames_written}/{n_frames}")
        time.sleep(0.01)

    writer.stop()
    return writer, offsets


def _read_frame_at(path: str, byte_offset: int) -> tuple[dict, bytes]:
    """Open chunk, seek to byte_offset, read header + payload."""
    with open(path, "rb") as f:
        f.seek(byte_offset)
        raw_hdr = f.read(FRAME_HEADER_SIZE)
        hdr     = unpack_frame_header(raw_hdr)
        payload = f.read(hdr["payload_size"])
    return hdr, payload


# ── Phase 3 tests ──────────────────────────────────────────────────────────────

class TestChunkHeaderOnDisk:

    def test_chunk_header_written_at_start(self, tmp_path):
        writer, _ = _push_and_write(1, str(tmp_path))
        path = os.path.join(str(tmp_path), "chunk_000000.bin")
        with open(path, "rb") as f:
            data = f.read(CHUNK_HEADER_SIZE)
        hdr = unpack_chunk_header(data)
        assert hdr["magic"]    == CHUNK_MAGIC
        assert hdr["chunk_id"] == 0
        assert hdr["created_at_us"] > 0

    def test_chunk_file_created_in_correct_directory(self, tmp_path):
        _push_and_write(1, str(tmp_path))
        files = os.listdir(str(tmp_path))
        assert "chunk_000000.bin" in files


class TestFrameOffsets:

    def test_first_frame_offset_is_chunk_header_size(self, tmp_path):
        _, offsets = _push_and_write(1, str(tmp_path))
        _, byte_offset = offsets[0]
        assert byte_offset == CHUNK_HEADER_SIZE

    def test_offsets_are_strictly_increasing(self, tmp_path):
        n = 10
        _, offsets = _push_and_write(n, str(tmp_path), chunk_max=10 * 1024 * 1024)
        same_chunk = [(cid, off) for cid, off in offsets if cid == offsets[0][0]]
        byte_offsets = [off for _, off in same_chunk]
        assert byte_offsets == sorted(byte_offsets)
        assert len(set(byte_offsets)) == len(byte_offsets), "duplicate offsets"

    def test_consecutive_offset_gap_equals_record_size(self, tmp_path):
        n = 5
        _, offsets = _push_and_write(n, str(tmp_path), chunk_max=10 * 1024 * 1024)
        same_chunk = [off for cid, off in offsets if cid == 0]
        record_size = FRAME_HEADER_SIZE + _PAYLOAD_SIZE
        for i in range(1, len(same_chunk)):
            gap = same_chunk[i] - same_chunk[i - 1]
            assert gap == record_size, f"gap at {i}: {gap} != {record_size}"


class TestCRC32:

    def test_crc_in_header_matches_payload(self, tmp_path):
        n = 5
        _, offsets = _push_and_write(n, str(tmp_path), chunk_max=10 * 1024 * 1024)
        path = os.path.join(str(tmp_path), "chunk_000000.bin")
        for _, byte_offset in offsets:
            hdr, payload = _read_frame_at(path, byte_offset)
            actual_crc = compute_crc32(payload)
            assert actual_crc == hdr["crc32"], (
                f"CRC mismatch at offset {byte_offset}: "
                f"stored={hdr['crc32']:#010x} actual={actual_crc:#010x}"
            )

    def test_corrupted_payload_changes_crc(self, tmp_path):
        _, offsets = _push_and_write(1, str(tmp_path))
        path = os.path.join(str(tmp_path), "chunk_000000.bin")
        hdr, payload = _read_frame_at(path, offsets[0][1])
        corrupted = bytearray(payload)
        corrupted[0] ^= 0xFF
        actual_crc = compute_crc32(bytes(corrupted))
        assert actual_crc != hdr["crc32"]


class TestFrameHeaderFields:

    def test_internal_frame_id_stored_correctly(self, tmp_path):
        n = 20
        _, offsets = _push_and_write(n, str(tmp_path), chunk_max=10 * 1024 * 1024)
        path = os.path.join(str(tmp_path), "chunk_000000.bin")
        for idx, (_, byte_offset) in enumerate(offsets):
            hdr, _ = _read_frame_at(path, byte_offset)
            assert hdr["internal_frame_id"] == idx

    def test_pixel_format_stored_correctly(self, tmp_path):
        _, offsets = _push_and_write(1, str(tmp_path))
        path = os.path.join(str(tmp_path), "chunk_000000.bin")
        hdr, _ = _read_frame_at(path, offsets[0][1])
        assert hdr["pixel_format"] == "BayerRG8"

    def test_dimensions_stored_correctly(self, tmp_path):
        _, offsets = _push_and_write(1, str(tmp_path))
        path = os.path.join(str(tmp_path), "chunk_000000.bin")
        hdr, _ = _read_frame_at(path, offsets[0][1])
        assert hdr["width"]  == _W
        assert hdr["height"] == _H

    def test_payload_size_matches_actual_payload(self, tmp_path):
        _, offsets = _push_and_write(1, str(tmp_path))
        path = os.path.join(str(tmp_path), "chunk_000000.bin")
        hdr, payload = _read_frame_at(path, offsets[0][1])
        assert hdr["payload_size"] == len(payload) == _PAYLOAD_SIZE


class TestChunkRotation:

    def test_rotation_creates_second_chunk_file(self, tmp_path):
        # chunk_max=_SMALL_CHUNK → rotates every ~3 frames
        _push_and_write(10, str(tmp_path), chunk_max=_SMALL_CHUNK)
        files = sorted(os.listdir(str(tmp_path)))
        assert len(files) >= 2, f"expected ≥2 chunks, got {files}"

    def test_second_chunk_has_correct_header(self, tmp_path):
        _push_and_write(10, str(tmp_path), chunk_max=_SMALL_CHUNK)
        path = os.path.join(str(tmp_path), "chunk_000001.bin")
        assert os.path.exists(path), "chunk_000001.bin not created"
        with open(path, "rb") as f:
            data = f.read(CHUNK_HEADER_SIZE)
        hdr = unpack_chunk_header(data)
        assert hdr["chunk_id"] == 1

    def test_on_chunk_closed_fires_for_each_rotation(self, tmp_path):
        closed: list[int] = []
        def on_close(chunk_id, path, frame_count):
            closed.append(chunk_id)

        _push_and_write(30, str(tmp_path), chunk_max=_SMALL_CHUNK, on_chunk=on_close)
        # with 30 frames × 1088 bytes and chunk_max=4000 bytes (≈3 frames/chunk):
        # at least 8 rotations expected
        assert len(closed) >= 8, f"expected ≥8 chunk-close events, got {len(closed)}: {closed}"

    def test_all_offsets_are_seekable_across_rotations(self, tmp_path):
        n = 20
        _, offsets = _push_and_write(n, str(tmp_path), chunk_max=_SMALL_CHUNK)
        assert len(offsets) == n
        for i, (chunk_id, byte_offset) in enumerate(offsets):
            path = os.path.join(str(tmp_path), f"chunk_{chunk_id:06d}.bin")
            hdr, payload = _read_frame_at(path, byte_offset)
            assert hdr["internal_frame_id"] == i
            assert compute_crc32(payload) == hdr["crc32"]


class TestStats:

    def test_total_frames_written_matches_input(self, tmp_path):
        n = 15
        writer, offsets = _push_and_write(n, str(tmp_path))
        assert writer.total_frames_written == n
        assert len(offsets) == n

    def test_total_bytes_written_is_correct(self, tmp_path):
        n = 5
        writer, _ = _push_and_write(n, str(tmp_path), chunk_max=10 * 1024 * 1024)
        expected = n * (FRAME_HEADER_SIZE + _PAYLOAD_SIZE)
        assert writer.total_bytes_written == expected

    def test_chunks_written_counter_increments(self, tmp_path):
        writer, _ = _push_and_write(30, str(tmp_path), chunk_max=_SMALL_CHUNK)
        assert writer.chunks_written >= 8


class TestWithRealSimulatorFrames:
    """
    End-to-end: real IdsSimulatorSource → ring buffer → ChunkWriter.
    Uses GV-5040CP spec (1456×1088) but runs for only 1 second to keep
    the test fast.
    """

    def test_simulator_frames_write_and_read_correctly(self, tmp_path):
        CHUNK_MAX = 100 * 1024 * 1024   # 100 MB
        numberer = GlobalFrameNumberer()
        buf      = BoundedFrameBuffer(capacity=4096)

        collected: list[tuple[int, int, int]] = []  # (internal_id, chunk_id, offset)
        lock = threading.Lock()

        def on_frame(pkt, chunk_id, byte_offset):
            with lock:
                collected.append((pkt.internal_frame_id, chunk_id, byte_offset))

        writer = ChunkWriter(
            chunk_dir        = str(tmp_path),
            buffer           = buf,
            chunk_max_bytes  = CHUNK_MAX,
            on_frame_written = on_frame,
        )
        cam = IdsSimulatorSource(
            camera_id=0, width=1456, height=1088, fps=80.0,
            numberer=numberer, buffer=buf,
        )

        writer.start()
        cam.start_thread()
        time.sleep(1.0)
        cam.stop()

        deadline = time.perf_counter() + 5.0
        while writer.total_frames_written < cam.frames_generated:
            if time.perf_counter() > deadline:
                break
            time.sleep(0.05)
        writer.stop()

        assert writer.total_frames_written >= 70, (
            f"expected ≥70 frames in 1 s at 80 FPS, got {writer.total_frames_written}"
        )

        # spot-check 10 evenly-spaced frames
        step = max(1, len(collected) // 10)
        for internal_id, chunk_id, byte_offset in collected[::step]:
            path = os.path.join(str(tmp_path), f"chunk_{chunk_id:06d}.bin")
            hdr, payload = _read_frame_at(path, byte_offset)
            assert hdr["internal_frame_id"] == internal_id
            assert hdr["width"]  == 1456
            assert hdr["height"] == 1088
            assert compute_crc32(payload) == hdr["crc32"]
