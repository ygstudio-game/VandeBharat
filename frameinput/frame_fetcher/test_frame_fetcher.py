"""
Tests for the Frame Fetching Service (Phase 5).

Unit tests (no postgres, no Docker):
    - chunk_reader functions: read, CRC, demosaic, encode
    - FastAPI /health endpoint

Integration tests (need postgres + DAQ_TEST_DSN):
    - Full pipeline: write chunk → index in postgres → GET /frames/{id} → PNG

Run:
    pytest frame_fetcher/test_frame_fetcher.py -v               # unit tests only
    pytest frame_fetcher/test_frame_fetcher.py -v -m integration # full stack
"""
import asyncio
import os
import struct
import tempfile
import threading
import time

import numpy as np
import pytest

from core.chunk_format import (
    CHUNK_HEADER_SIZE,
    FRAME_HEADER_SIZE,
    pack_chunk_header,
    pack_frame_header,
    compute_crc32,
)
from core.frame import FramePacket, GlobalFrameNumberer
from frame_fetcher.chunk_reader import (
    ChunkReadError,
    bayer_to_rgb,
    encode_jpeg,
    encode_png,
    read_frame_bytes,
    resize_rgb,
)
from ingestion.chunk_writer import ChunkWriter
from ingestion.ring_buffer import BoundedFrameBuffer


# ── helpers ────────────────────────────────────────────────────────────────────

_W, _H = 64, 64   # small frame for fast tests


def _write_frame_manually(path: str, pkt: FramePacket, byte_offset: int) -> None:
    """Write a single frame at byte_offset into an existing file (for error tests)."""
    crc = compute_crc32(pkt.payload)
    hdr = pack_frame_header(pkt, crc)
    with open(path, "r+b") as f:
        f.seek(byte_offset)
        f.write(hdr)
        f.write(pkt.payload)


def _make_chunk_with_frames(tmp_dir: str, n: int = 5) -> tuple[str, list[tuple[int, int]]]:
    """
    Write n frames to a chunk using ChunkWriter.
    Returns (chunk_path, [(chunk_id, byte_offset), ...]).
    """
    offsets: list[tuple[int, int]] = []
    lock = threading.Lock()

    def on_frame(pkt, chunk_id, byte_offset):
        with lock:
            offsets.append((chunk_id, byte_offset))

    buf    = BoundedFrameBuffer(capacity=n + 10)
    writer = ChunkWriter(
        chunk_dir        = tmp_dir,
        buffer           = buf,
        chunk_max_bytes  = 50 * 1024 * 1024,
        on_frame_written = on_frame,
    )
    writer.start()

    numberer = GlobalFrameNumberer()
    for i in range(n):
        import numpy as np_local
        row     = np_local.arange(_W, dtype=np_local.int16)
        col     = (np_local.arange(_H, dtype=np_local.int16) + i * 7).reshape(-1, 1)
        payload = ((row + col) % 256).astype(np_local.uint8).tobytes()
        buf.push(FramePacket(
            internal_frame_id=numberer.next(),
            camera_id=i % 8,
            camera_frame_id=i,
            hw_timestamp_us=1_700_000_000_000_000 + i,
            width=_W, height=_H,
            pixel_format="BayerRG8",
            payload=payload,
        ))

    deadline = time.perf_counter() + 10.0
    while writer.total_frames_written < n and time.perf_counter() < deadline:
        time.sleep(0.02)
    writer.stop()

    chunk_path = os.path.join(tmp_dir, "chunk_000000.bin")
    return chunk_path, offsets


# ── chunk_reader unit tests ────────────────────────────────────────────────────

class TestReadFrameBytes:

    def test_reads_payload_correctly(self, tmp_path):
        path, offsets = _make_chunk_with_frames(str(tmp_path), n=3)
        chunk_id, byte_offset = offsets[0]
        payload, hdr = read_frame_bytes(chunk_id, byte_offset, str(tmp_path))
        assert len(payload) == _W * _H
        assert hdr["width"]  == _W
        assert hdr["height"] == _H

    def test_internal_frame_id_correct(self, tmp_path):
        _, offsets = _make_chunk_with_frames(str(tmp_path), n=5)
        for expected_id, (chunk_id, byte_offset) in enumerate(offsets):
            _, hdr = read_frame_bytes(chunk_id, byte_offset, str(tmp_path))
            assert hdr["internal_frame_id"] == expected_id

    def test_crc_is_validated(self, tmp_path):
        path, offsets = _make_chunk_with_frames(str(tmp_path), n=1)
        chunk_id, byte_offset = offsets[0]
        # Corrupt one byte of the payload on disk
        payload_start = byte_offset + FRAME_HEADER_SIZE
        with open(path, "r+b") as f:
            f.seek(payload_start)
            original = f.read(1)
            f.seek(payload_start)
            f.write(bytes([original[0] ^ 0xFF]))
        with pytest.raises(ChunkReadError, match="CRC mismatch"):
            read_frame_bytes(chunk_id, byte_offset, str(tmp_path))

    def test_missing_chunk_file_raises(self, tmp_path):
        with pytest.raises(ChunkReadError, match="not found"):
            read_frame_bytes(99, 32, str(tmp_path))

    def test_bad_magic_raises(self, tmp_path):
        path = os.path.join(str(tmp_path), "chunk_000000.bin")
        # Write chunk header then garbage
        with open(path, "wb") as f:
            f.write(pack_chunk_header(0))
            f.write(b"\x00" * FRAME_HEADER_SIZE)   # bad magic
        with pytest.raises(ChunkReadError, match="invalid frame header"):
            read_frame_bytes(0, CHUNK_HEADER_SIZE, str(tmp_path))

    def test_pixel_format_stored_as_string(self, tmp_path):
        _, offsets = _make_chunk_with_frames(str(tmp_path), n=1)
        _, hdr = read_frame_bytes(*offsets[0], str(tmp_path))
        assert hdr["pixel_format"] == "BayerRG8"


class TestBayerToRgb:

    def _bayer_frame(self, w=_W, h=_H) -> bytes:
        row = np.arange(w, dtype=np.int16)
        col = np.arange(h, dtype=np.int16).reshape(-1, 1)
        return ((row + col) % 256).astype(np.uint8).tobytes()

    def test_output_shape_is_hwc(self):
        payload = self._bayer_frame()
        rgb = bayer_to_rgb(payload, _W, _H)
        assert rgb.shape == (_H, _W, 3)

    def test_output_dtype_is_uint8(self):
        payload = self._bayer_frame()
        rgb = bayer_to_rgb(payload, _W, _H)
        assert rgb.dtype == np.uint8

    def test_wrong_size_raises(self):
        with pytest.raises(ChunkReadError, match="size mismatch"):
            bayer_to_rgb(b"\x00" * 10, _W, _H)

    def test_not_all_zero(self):
        payload = self._bayer_frame()
        rgb = bayer_to_rgb(payload, _W, _H)
        assert rgb.max() > 0, "expected non-zero pixels after demosaic"


class TestEncoders:

    def _rgb_array(self) -> np.ndarray:
        row = np.arange(_W, dtype=np.int16)
        col = np.arange(_H, dtype=np.int16).reshape(-1, 1)
        ch0 = (row + col) % 256                                   # (H, W)
        ch1 = np.broadcast_to((row * 2) % 256, (_H, _W)).copy()  # (H, W)
        ch2 = np.broadcast_to(col % 256, (_H, _W)).copy()         # (H, W)
        return np.stack([ch0, ch1, ch2], axis=-1).astype(np.uint8)

    def test_encode_png_starts_with_png_header(self):
        png = encode_png(self._rgb_array())
        assert png[:8] == b"\x89PNG\r\n\x1a\n"

    def test_encode_jpeg_starts_with_jpeg_header(self):
        jpg = encode_jpeg(self._rgb_array())
        assert jpg[:2] == b"\xff\xd8"   # JPEG SOI marker

    def test_png_is_decodable(self):
        png  = encode_png(self._rgb_array())
        back = cv2_decode(png)
        assert back.shape == (_H, _W, 3)

    def test_resize_changes_dimensions(self):
        rgb = self._rgb_array()
        resized = resize_rgb(rgb, 32, 32)
        assert resized.shape == (32, 32, 3)


def cv2_decode(data: bytes) -> np.ndarray:
    import cv2
    arr = np.frombuffer(data, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


# ── FastAPI endpoint unit tests ────────────────────────────────────────────────

class TestHealthEndpoint:

    def test_health_returns_200(self):
        from fastapi.testclient import TestClient
        from frame_fetcher import server
        # Disable lifespan so we don't need postgres
        with TestClient(server.app, raise_server_exceptions=False) as client:
            resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_health_reports_postgres_not_connected(self):
        from fastapi.testclient import TestClient
        from frame_fetcher import server
        with TestClient(server.app, raise_server_exceptions=False) as client:
            data = client.get("/health").json()
        assert data["postgres"] is False


# ── integration tests ──────────────────────────────────────────────────────────

try:
    import asyncpg as _asyncpg
    _ASYNCPG = True
except ImportError:
    _ASYNCPG = False

_DEFAULT_DSN = "postgresql://daq:daq@localhost:5432/daq_test"


@pytest.fixture(scope="module")
def postgres_dsn():
    if not _ASYNCPG:
        pytest.skip("asyncpg not installed")
    dsn = os.environ.get("DAQ_TEST_DSN", _DEFAULT_DSN)
    async def _probe():
        conn = await _asyncpg.connect(dsn, timeout=3)
        await conn.close()
    try:
        asyncio.run(_probe())
    except Exception as e:
        pytest.skip(f"postgres not available: {e}")
    return dsn


@pytest.mark.integration
class TestFullRetrievalPipeline:
    """
    End-to-end: ChunkWriter + MetadataService → GET /frames/{id} → PNG.
    """

    def test_retrieve_frame_returns_png(self, postgres_dsn, tmp_path):
        from ingestion.metadata_service import MetadataService

        N = 20
        buf    = BoundedFrameBuffer(capacity=N + 10)
        svc    = MetadataService()
        writer = ChunkWriter(
            chunk_dir        = str(tmp_path),
            buffer           = buf,
            chunk_max_bytes  = 50 * 1024 * 1024,
            on_frame_written = svc.enqueue,
        )

        # reset table
        asyncio.run(_reset_table(postgres_dsn))
        svc.start(postgres_dsn)
        time.sleep(0.3)
        writer.start()

        numberer = GlobalFrameNumberer()
        for i in range(N):
            row     = np.arange(_W, dtype=np.int16)
            col     = (np.arange(_H, dtype=np.int16) + i * 7).reshape(-1, 1)
            payload = ((row + col) % 256).astype(np.uint8).tobytes()
            buf.push(FramePacket(
                internal_frame_id=numberer.next(),
                camera_id=i % 8, camera_frame_id=i,
                hw_timestamp_us=1_700_000_000_000_000 + i,
                width=_W, height=_H, pixel_format="BayerRG8",
                payload=payload,
            ))

        deadline = time.perf_counter() + 10.0
        while writer.total_frames_written < N and time.perf_counter() < deadline:
            time.sleep(0.05)
        writer.stop()
        svc.flush_sync(timeout=10.0)
        svc.stop()

        # Now query via the API
        os.environ["POSTGRES_DSN"] = postgres_dsn
        os.environ["CHUNK_DIR"]    = str(tmp_path)

        from frame_fetcher import server, metadata_client as mc
        from fastapi.testclient import TestClient

        # re-import to pick up env vars
        import importlib
        importlib.reload(server)

        asyncio.run(mc.connect(postgres_dsn))
        try:
            with TestClient(server.app, raise_server_exceptions=True) as client:
                for frame_id in [0, 5, 10, 19]:
                    resp = client.get(f"/frames/{frame_id}")
                    assert resp.status_code == 200, (
                        f"frame {frame_id}: HTTP {resp.status_code} — {resp.text}"
                    )
                    assert resp.headers["content-type"] == "image/png"
                    assert resp.content[:8] == b"\x89PNG\r\n\x1a\n"
                    assert int(resp.headers["x-frame-id"]) == frame_id
        finally:
            asyncio.run(mc.close())

    def test_missing_frame_returns_404(self, postgres_dsn, tmp_path):
        asyncio.run(_reset_table(postgres_dsn))

        os.environ["POSTGRES_DSN"] = postgres_dsn
        os.environ["CHUNK_DIR"]    = str(tmp_path)

        from frame_fetcher import server, metadata_client as mc
        from fastapi.testclient import TestClient

        asyncio.run(mc.connect(postgres_dsn))
        try:
            with TestClient(server.app, raise_server_exceptions=False) as client:
                resp = client.get("/frames/99999")
            assert resp.status_code == 404
        finally:
            asyncio.run(mc.close())

    def test_jpeg_format_returned_correctly(self, postgres_dsn, tmp_path):
        from ingestion.metadata_service import MetadataService

        asyncio.run(_reset_table(postgres_dsn))
        buf    = BoundedFrameBuffer(capacity=10)
        svc    = MetadataService()
        writer = ChunkWriter(
            chunk_dir=str(tmp_path), buffer=buf,
            chunk_max_bytes=50*1024*1024, on_frame_written=svc.enqueue,
        )
        svc.start(postgres_dsn)
        time.sleep(0.3)
        writer.start()

        numberer = GlobalFrameNumberer()
        payload  = bytes(range(256)) * (_W * _H // 256)
        buf.push(FramePacket(
            internal_frame_id=numberer.next(), camera_id=0, camera_frame_id=0,
            hw_timestamp_us=1_700_000_000_000_000, width=_W, height=_H,
            pixel_format="BayerRG8", payload=payload,
        ))

        deadline = time.perf_counter() + 5.0
        while writer.total_frames_written < 1 and time.perf_counter() < deadline:
            time.sleep(0.05)
        writer.stop()
        svc.flush_sync()
        svc.stop()

        os.environ["POSTGRES_DSN"] = postgres_dsn
        os.environ["CHUNK_DIR"]    = str(tmp_path)

        from frame_fetcher import server, metadata_client as mc
        from fastapi.testclient import TestClient

        asyncio.run(mc.connect(postgres_dsn))
        try:
            with TestClient(server.app) as client:
                resp = client.get("/frames/0?format=jpeg")
            assert resp.status_code == 200
            assert resp.content[:2] == b"\xff\xd8"   # JPEG SOI
        finally:
            asyncio.run(mc.close())


async def _reset_table(dsn: str) -> None:
    conn = await _asyncpg.connect(dsn)
    await conn.execute("DROP TABLE IF EXISTS frames")
    await conn.close()
