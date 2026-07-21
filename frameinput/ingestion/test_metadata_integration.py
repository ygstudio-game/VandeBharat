"""
Integration tests for MetadataService + ChunkWriter wiring (Phase 4).

These tests require a running PostgreSQL instance.

Start one with:
    docker run --rm -e POSTGRES_USER=daq -e POSTGRES_PASSWORD=daq \
               -e POSTGRES_DB=daq_test -p 5432:5432 postgres:16

Or set DAQ_TEST_DSN environment variable to point at any available instance.

Run:
    pytest ingestion/test_metadata_integration.py -v -m integration

All tests are auto-skipped if postgres is unreachable.
"""
import asyncio
import os
import tempfile
import threading
import time
from typing import Optional

import pytest

# ── optional asyncpg import ───────────────────────────────────────────────────
try:
    import asyncpg
    _ASYNCPG_AVAILABLE = True
except ImportError:
    _ASYNCPG_AVAILABLE = False

from core.frame import FramePacket, GlobalFrameNumberer
from ingestion.chunk_writer import ChunkWriter
from ingestion.metadata_service import MetadataService
from ingestion.ring_buffer import BoundedFrameBuffer
from ingestion.simulator import CameraRig, IdsSimulatorSource


_DEFAULT_DSN = "postgresql://daq:daq@localhost:5432/daq_test"


# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def postgres_dsn():
    """Skip entire module if postgres is unreachable."""
    if not _ASYNCPG_AVAILABLE:
        pytest.skip("asyncpg not installed")

    dsn = os.environ.get("DAQ_TEST_DSN", _DEFAULT_DSN)

    async def _probe():
        conn = await asyncpg.connect(dsn, timeout=3)
        await conn.close()

    try:
        asyncio.run(_probe())
    except Exception as e:
        pytest.skip(f"postgres not available at {dsn}: {e}")

    return dsn


@pytest.fixture(autouse=True)
def _require_postgres(postgres_dsn):
    """Ensure every test in this file has a live postgres connection."""


@pytest.fixture
def clean_db(postgres_dsn):
    """Drop and re-create the frames table before each test."""
    async def _reset():
        conn = await asyncpg.connect(postgres_dsn)
        await conn.execute("DROP TABLE IF EXISTS frames")
        await conn.close()
    asyncio.run(_reset())
    yield postgres_dsn


# ── helpers ────────────────────────────────────────────────────────────────────

def _count_rows(dsn: str) -> int:
    async def _q():
        conn = await asyncpg.connect(dsn)
        row = await conn.fetchrow("SELECT COUNT(*) AS n FROM frames")
        await conn.close()
        return row["n"]
    return asyncio.run(_q())


def _fetch_frame(dsn: str, internal_frame_id: int) -> Optional[dict]:
    async def _q():
        conn = await asyncpg.connect(dsn)
        row = await conn.fetchrow(
            "SELECT * FROM frames WHERE internal_frame_id = $1", internal_frame_id
        )
        await conn.close()
        return dict(row) if row else None
    return asyncio.run(_q())


def _make_packet(internal_id: int) -> FramePacket:
    payload = bytes(range(64)) * 16   # 1 024 bytes
    return FramePacket(
        internal_frame_id = internal_id,
        camera_id         = internal_id % 8,
        camera_frame_id   = internal_id,
        hw_timestamp_us   = 1_700_000_000_000_000 + internal_id,
        width             = 32,
        height            = 32,
        pixel_format      = "BayerRG8",
        payload           = payload,
    )


# ── Phase 4 tests ──────────────────────────────────────────────────────────────

@pytest.mark.integration
class TestMetadataServiceAlone:

    def test_init_db_creates_frames_table(self, clean_db):
        svc = MetadataService()
        svc.start(clean_db)
        time.sleep(0.5)   # let the loop connect and create the table
        svc.flush_sync()
        svc.stop()

        async def _check():
            conn = await asyncpg.connect(clean_db)
            row = await conn.fetchrow(
                "SELECT to_regclass('public.frames') AS tbl"
            )
            await conn.close()
            return row["tbl"]

        result = asyncio.run(_check())
        assert result is not None, "frames table was not created"

    def test_single_record_inserted(self, clean_db):
        svc = MetadataService()
        svc.start(clean_db)
        time.sleep(0.3)

        pkt = _make_packet(internal_id=42)
        svc.enqueue(pkt, chunk_id=0, byte_offset=32)

        svc.flush_sync(timeout=5.0)
        svc.stop()

        row = _fetch_frame(clean_db, 42)
        assert row is not None, "frame 42 not found in postgres"
        assert row["chunk_id"]    == 0
        assert row["byte_offset"] == 32
        assert row["camera_id"]   == 42 % 8
        assert row["width"]       == 32
        assert row["height"]      == 32
        assert row["pixel_format"] == "BayerRG8"
        assert row["payload_size"] == 1024

    def test_500_records_all_inserted(self, clean_db):
        svc = MetadataService()
        svc.start(clean_db)
        time.sleep(0.3)

        n = 500
        for i in range(n):
            svc.enqueue(_make_packet(i), chunk_id=0, byte_offset=i * 1088)

        svc.flush_sync(timeout=10.0)
        svc.stop()

        count = _count_rows(clean_db)
        assert count == n, f"expected {n} rows, got {count}"

    def test_duplicate_frame_ids_ignored(self, clean_db):
        svc = MetadataService()
        svc.start(clean_db)
        time.sleep(0.3)

        pkt = _make_packet(internal_id=99)
        svc.enqueue(pkt, chunk_id=0, byte_offset=32)
        svc.enqueue(pkt, chunk_id=0, byte_offset=32)   # duplicate

        svc.flush_sync(timeout=5.0)
        svc.stop()

        count = _count_rows(clean_db)
        assert count == 1, f"expected 1 row (ON CONFLICT DO NOTHING), got {count}"

    def test_byte_offset_stored_correctly(self, clean_db):
        svc = MetadataService()
        svc.start(clean_db)
        time.sleep(0.3)

        pkt = _make_packet(internal_id=7)
        svc.enqueue(pkt, chunk_id=3, byte_offset=999_888_777)

        svc.flush_sync(timeout=5.0)
        svc.stop()

        row = _fetch_frame(clean_db, 7)
        assert row["chunk_id"]    == 3
        assert row["byte_offset"] == 999_888_777


@pytest.mark.integration
class TestChunkWriterWithMetadata:
    """
    End-to-end wiring: ChunkWriter.on_frame_written → MetadataService.enqueue
    """

    def test_all_written_frames_appear_in_postgres(self, clean_db, tmp_path):
        N = 200
        buf    = BoundedFrameBuffer(capacity=N + 64)
        svc    = MetadataService()
        writer = ChunkWriter(
            chunk_dir        = str(tmp_path),
            buffer           = buf,
            chunk_max_bytes  = 50 * 1024 * 1024,
            on_frame_written = svc.enqueue,
        )

        svc.start(clean_db)
        time.sleep(0.3)
        writer.start()

        for i in range(N):
            buf.push(_make_packet(i))

        deadline = time.perf_counter() + 10.0
        while writer.total_frames_written < N and time.perf_counter() < deadline:
            time.sleep(0.05)
        writer.stop()

        svc.flush_sync(timeout=10.0)
        svc.stop()

        db_count = _count_rows(clean_db)
        assert db_count == N, (
            f"writer wrote {writer.total_frames_written} frames; "
            f"postgres has {db_count} rows (expected {N})"
        )

    def test_chunk_id_and_offset_match_file_content(self, clean_db, tmp_path):
        """
        Retrieve a frame from the database, seek to its stored offset,
        and verify the internal_frame_id in the file header matches.
        """
        import zlib
        from core.chunk_format import FRAME_HEADER_SIZE, unpack_frame_header, compute_crc32

        N = 50
        buf    = BoundedFrameBuffer(capacity=N + 64)
        svc    = MetadataService()
        writer = ChunkWriter(
            chunk_dir        = str(tmp_path),
            buffer           = buf,
            chunk_max_bytes  = 50 * 1024 * 1024,
            on_frame_written = svc.enqueue,
        )

        svc.start(clean_db)
        time.sleep(0.3)
        writer.start()

        for i in range(N):
            buf.push(_make_packet(i))

        deadline = time.perf_counter() + 10.0
        while writer.total_frames_written < N and time.perf_counter() < deadline:
            time.sleep(0.05)
        writer.stop()
        svc.flush_sync(timeout=10.0)
        svc.stop()

        # verify 10 random frames
        for target_id in range(0, N, N // 10):
            row = _fetch_frame(clean_db, target_id)
            assert row is not None, f"frame {target_id} not in postgres"

            path = os.path.join(str(tmp_path), f"chunk_{row['chunk_id']:06d}.bin")
            with open(path, "rb") as f:
                f.seek(row["byte_offset"])
                raw_hdr = f.read(FRAME_HEADER_SIZE)
                hdr     = unpack_frame_header(raw_hdr)
                payload = f.read(hdr["payload_size"])

            assert hdr["internal_frame_id"] == target_id, (
                f"frame {target_id}: header says {hdr['internal_frame_id']}"
            )
            assert compute_crc32(payload) == hdr["crc32"], (
                f"frame {target_id}: CRC mismatch"
            )

    def test_row_count_equals_writer_total_across_rotations(self, clean_db, tmp_path):
        N = 100
        buf    = BoundedFrameBuffer(capacity=N + 64)
        svc    = MetadataService()
        writer = ChunkWriter(
            chunk_dir        = str(tmp_path),
            buffer           = buf,
            chunk_max_bytes  = 10_000,   # tiny → many rotations
            on_frame_written = svc.enqueue,
        )

        svc.start(clean_db)
        time.sleep(0.3)
        writer.start()

        for i in range(N):
            buf.push(_make_packet(i))

        deadline = time.perf_counter() + 10.0
        while writer.total_frames_written < N and time.perf_counter() < deadline:
            time.sleep(0.05)
        writer.stop()
        svc.flush_sync(timeout=10.0)
        svc.stop()

        assert writer.chunks_written > 1, "expected multiple chunk rotations"
        assert _count_rows(clean_db) == writer.total_frames_written


@pytest.mark.integration
class TestWithRealSimulator:
    """
    5-second ingestion run: all 8 simulated cameras → chunk files → postgres.
    Validates COUNT(*) == total_frames_written at the end.
    """

    def test_5_second_ingest_all_frames_indexed(self, clean_db, tmp_path):
        DURATION   = 5.0
        CHUNK_MAX  = 100 * 1024 * 1024   # 100 MB chunks

        numberer = GlobalFrameNumberer()
        buf      = BoundedFrameBuffer(capacity=8192)
        svc      = MetadataService()
        writer   = ChunkWriter(
            chunk_dir        = str(tmp_path),
            buffer           = buf,
            chunk_max_bytes  = CHUNK_MAX,
            on_frame_written = svc.enqueue,
        )
        rig = CameraRig(numberer, buf)

        svc.start(clean_db)
        time.sleep(0.5)
        writer.start()
        rig.start()

        time.sleep(DURATION)

        rig.stop()
        # wait for the writer to catch up
        deadline = time.perf_counter() + 15.0
        while writer.total_frames_written < rig.total_frames:
            if time.perf_counter() > deadline:
                break
            time.sleep(0.1)

        writer.stop()
        svc.flush_sync(timeout=15.0)
        svc.stop()

        db_count     = _count_rows(clean_db)
        written      = writer.total_frames_written
        dropped      = buf.frames_dropped

        print(
            f"\n  written={written:,}  db_rows={db_count:,}  "
            f"dropped={dropped:,}  chunks={writer.chunks_written}"
        )

        # Every written frame must have a metadata row
        assert db_count == written, (
            f"db has {db_count} rows but writer wrote {written} frames"
        )
        # Healthy demo: no drops during 5-second test
        assert dropped == 0, f"unexpected drops: {dropped}"
