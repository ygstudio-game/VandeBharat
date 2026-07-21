"""
MetadataService — indexes every written frame in PostgreSQL.

Thread model
────────────
ChunkWriter runs synchronously in its own thread and calls enqueue() after
each frame write.  MetadataService bridges sync → async via a threading.Queue:

    ChunkWriter thread  →  threading.Queue  →  asyncio event loop thread
                               (non-blocking put)     (batched executemany)

The asyncio loop runs in a private daemon thread so it never blocks the
writer.  Inserts are batched: up to BATCH_SIZE records, or flushed every
FLUSH_MS milliseconds — whichever comes first.

Usage
─────
    svc = MetadataService()
    svc.start("postgresql://daq:daq@localhost:5432/daq")
    # wire into ChunkWriter:
    writer = ChunkWriter(..., on_frame_written=svc.enqueue)
    # on shutdown:
    svc.flush_sync()
    svc.stop()
"""
import asyncio
import logging
import queue
import threading
import time
from typing import Optional

import asyncpg

logger = logging.getLogger("metadata_service")

_BATCH_SIZE = 100        # rows per INSERT batch
_FLUSH_MS   = 200        # max latency before flushing a partial batch
_QUEUE_MAX  = 50_000     # drop records if the queue exceeds this (back-pressure safeguard)

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS frames (
    internal_frame_id  BIGINT       PRIMARY KEY,
    camera_id          SMALLINT     NOT NULL,
    camera_frame_id    BIGINT       NOT NULL,
    hw_timestamp_us    BIGINT       NOT NULL,
    chunk_id           INT          NOT NULL,
    byte_offset        BIGINT       NOT NULL,
    payload_size       INT          NOT NULL,
    width              SMALLINT     NOT NULL,
    height             SMALLINT     NOT NULL,
    pixel_format       VARCHAR(16)  NOT NULL,
    ingested_at        TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_frames_camera_ts ON frames (camera_id, hw_timestamp_us);
CREATE INDEX IF NOT EXISTS idx_frames_chunk     ON frames (chunk_id, byte_offset);
"""

_INSERT_SQL = """
INSERT INTO frames
    (internal_frame_id, camera_id, camera_frame_id, hw_timestamp_us,
     chunk_id, byte_offset, payload_size, width, height, pixel_format)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT DO NOTHING
"""


class MetadataService:

    def __init__(self) -> None:
        self._sync_q: queue.Queue = queue.Queue(maxsize=_QUEUE_MAX)
        self._loop:   Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._pool:   Optional[asyncpg.Pool] = None
        self._dsn:    str = ""
        self._stop_flag = threading.Event()

        # ── observable stats ──────────────────────────────────────────────────
        self.records_inserted = 0
        self.insert_errors    = 0
        self.records_dropped  = 0   # enqueue() overflows

    # ── public API (called from any thread) ───────────────────────────────────

    def start(self, dsn: str) -> None:
        """Connect to postgres and start the background flush loop."""
        self._dsn = dsn
        self._stop_flag.clear()
        self._thread = threading.Thread(
            target=self._run_loop,
            name="metadata-svc",
            daemon=True,
        )
        self._thread.start()

    def enqueue(self, pkt, chunk_id: int, byte_offset: int) -> None:
        """
        Non-blocking.  Called from ChunkWriter thread after each frame write.
        Converts FramePacket fields to a flat tuple for executemany().
        """
        record = (
            pkt.internal_frame_id,
            pkt.camera_id,
            pkt.camera_frame_id,
            pkt.hw_timestamp_us,
            chunk_id,
            byte_offset,
            len(pkt.payload),
            pkt.width,
            pkt.height,
            pkt.pixel_format,
        )
        try:
            self._sync_q.put_nowait(record)
        except queue.Full:
            self.records_dropped += 1
            logger.warning(
                "metadata queue full — dropping record for frame %d",
                pkt.internal_frame_id,
            )

    @property
    def records_pending(self) -> int:
        return self._sync_q.qsize()

    def flush_sync(self, timeout: float = 10.0) -> None:
        """
        Block the calling thread until all queued records are inserted.
        Use before stop() in tests and clean shutdown.
        """
        deadline = time.monotonic() + timeout
        while self._sync_q.qsize() > 0 and time.monotonic() < deadline:
            time.sleep(0.02)

    def stop(self, timeout: float = 15.0) -> None:
        """Graceful shutdown: signal the event loop to stop, then join."""
        self._stop_flag.set()
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join(timeout=timeout)

    # ── asyncio internals (run inside the daemon thread) ──────────────────────

    def _run_loop(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._main())
        except Exception:
            logger.exception("metadata event loop crashed")
        finally:
            self._loop.close()

    async def _main(self) -> None:
        self._pool = await asyncpg.create_pool(
            self._dsn, min_size=1, max_size=3,
            command_timeout=30,
        )
        async with self._pool.acquire() as conn:
            await conn.execute(_CREATE_TABLE_SQL)
        logger.info("MetadataService: connected to postgres, table ready")
        await self._flush_loop()
        await self._pool.close()

    async def _flush_loop(self) -> None:
        batch: list[tuple] = []

        while not self._stop_flag.is_set():
            # collect up to BATCH_SIZE records or wait FLUSH_MS
            flush_deadline = asyncio.get_event_loop().time() + _FLUSH_MS / 1000.0

            while asyncio.get_event_loop().time() < flush_deadline:
                try:
                    record = self._sync_q.get_nowait()
                    batch.append(record)
                    if len(batch) >= _BATCH_SIZE:
                        break
                except queue.Empty:
                    await asyncio.sleep(0.002)

            if batch:
                await self._insert_batch(batch)
                batch.clear()

        # final drain after stop_flag is set
        while True:
            try:
                batch.append(self._sync_q.get_nowait())
                if len(batch) >= _BATCH_SIZE:
                    await self._insert_batch(batch)
                    batch.clear()
            except queue.Empty:
                break
        if batch:
            await self._insert_batch(batch)

    async def _insert_batch(self, batch: list[tuple]) -> None:
        try:
            async with self._pool.acquire() as conn:
                await conn.executemany(_INSERT_SQL, batch)
            self.records_inserted += len(batch)
            logger.debug("inserted %d metadata records (total %d)", len(batch), self.records_inserted)
        except Exception as e:
            self.insert_errors += 1
            logger.error("metadata insert failed (%d records): %s", len(batch), e)
