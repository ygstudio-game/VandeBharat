"""
ChunkWriter — consumes FramePackets from the ring buffer and writes binary
.bin chunk files to the NVMe storage directory.

Design
──────
- Runs in a single dedicated thread so the writer never competes with the
  8 camera threads for the GIL.
- Uses synchronous buffered I/O (8 MB OS buffer).  On Linux NVMe, sequential
  writes through the page cache sustain 3–5 GB/s easily.
- Rotates to a new chunk file when current_chunk_bytes >= chunk_max_bytes.
- Calls two optional callbacks (both from the writer thread):
    on_frame_written(pkt, chunk_id, byte_offset)  — wired to MetadataService
    on_chunk_closed(chunk_id, path, frame_count)  — wired to ChunkPublisher (Phase 6)
- stop() drains any remaining frames from the buffer before closing the
  current chunk, so no data is lost on clean shutdown.
"""
import logging
import os
import threading
import time
from typing import Callable, Optional

from core.chunk_format import (
    CHUNK_HEADER_SIZE,
    FRAME_HEADER_SIZE,
    compute_crc32,
    pack_chunk_header,
    pack_frame_header,
)
from core.frame import FramePacket
from ingestion.ring_buffer import BoundedFrameBuffer
from ingestion import metrics as _m

logger = logging.getLogger("chunk_writer")

_IDLE_SLEEP_S   = 0.0001   # 100 µs spin when buffer is empty
_FILE_BUFFER    = 8 * 1024 * 1024   # 8 MB OS write buffer
_DEFAULT_CHUNK  = 512 * 1024 * 1024  # 512 MB


class ChunkWriter:

    def __init__(
        self,
        chunk_dir:      str,
        buffer:         BoundedFrameBuffer,
        chunk_max_bytes: int = _DEFAULT_CHUNK,
        on_frame_written: Optional[Callable] = None,
        on_chunk_closed:  Optional[Callable] = None,
    ):
        """
        chunk_dir        : directory where .bin files are created
        buffer           : ring buffer to consume from
        chunk_max_bytes  : rotate file when this many bytes have been written
        on_frame_written : callable(pkt, chunk_id, byte_offset) — sync, non-blocking
        on_chunk_closed  : callable(chunk_id, path, frame_count) — sync, non-blocking
        """
        os.makedirs(chunk_dir, exist_ok=True)

        self._chunk_dir       = chunk_dir
        self._buffer          = buffer
        self._chunk_max_bytes = chunk_max_bytes
        self._on_frame_written = on_frame_written
        self._on_chunk_closed  = on_chunk_closed

        # ── current chunk state ───────────────────────────────────────────────
        self._chunk_id    = 0
        self._file        = None          # open binary file handle
        self._chunk_bytes = 0             # bytes written to current chunk so far
        self._chunk_frames = 0            # frames in current chunk

        # ── lifecycle ─────────────────────────────────────────────────────────
        self._running = threading.Event()
        self._thread: Optional[threading.Thread] = None

        # ── aggregate stats ───────────────────────────────────────────────────
        self.total_frames_written = 0
        self.total_bytes_written  = 0
        self.chunks_written       = 0

    # ── public API ─────────────────────────────────────────────────────────────

    def start(self) -> threading.Thread:
        self._running.set()
        self._thread = threading.Thread(
            target=self._run, name="chunk-writer", daemon=True
        )
        self._thread.start()
        return self._thread

    def stop(self, timeout: float = 10.0) -> None:
        """Signal stop; drain remaining buffer frames; close current chunk."""
        self._running.clear()
        if self._thread:
            self._thread.join(timeout=timeout)

    @property
    def current_chunk_id(self) -> int:
        return self._chunk_id

    @property
    def current_chunk_path(self) -> str:
        return self._chunk_path(self._chunk_id)

    # ── file management ────────────────────────────────────────────────────────

    def _chunk_path(self, chunk_id: int) -> str:
        return os.path.join(self._chunk_dir, f"chunk_{chunk_id:06d}.bin")

    def _open_chunk(self) -> None:
        path = self._chunk_path(self._chunk_id)
        self._file = open(path, "wb", buffering=_FILE_BUFFER)
        header = pack_chunk_header(self._chunk_id)
        self._file.write(header)
        self._chunk_bytes  = CHUNK_HEADER_SIZE
        self._chunk_frames = 0
        logger.debug("opened chunk %06d → %s", self._chunk_id, path)

    def _close_chunk(self) -> None:
        if self._file is None:
            return
        self._file.flush()
        self._file.close()
        self._file = None
        path = self._chunk_path(self._chunk_id)
        self.chunks_written += 1
        logger.info(
            "closed chunk %06d | frames=%d | bytes=%d | path=%s",
            self._chunk_id, self._chunk_frames, self._chunk_bytes, path,
        )
        if self._on_chunk_closed:
            try:
                self._on_chunk_closed(self._chunk_id, path, self._chunk_frames)
            except Exception:
                logger.exception("on_chunk_closed callback raised")

    def _rotate(self) -> None:
        self._close_chunk()
        self._chunk_id += 1
        self._open_chunk()
        _m.chunks_written.inc()

    # ── frame write ────────────────────────────────────────────────────────────

    def _write_frame(self, pkt: FramePacket) -> int:
        """
        Write one frame to the current chunk.
        Returns the byte offset of this frame's FrameHeader inside the chunk.
        """
        byte_offset = self._chunk_bytes
        crc         = compute_crc32(pkt.payload)
        hdr         = pack_frame_header(pkt, crc)

        t0 = time.time()
        self._file.write(hdr)
        self._file.write(pkt.payload)
        _m.write_latency.observe(time.time() - t0)

        record_size = FRAME_HEADER_SIZE + len(pkt.payload)
        self._chunk_bytes  += record_size
        self._chunk_frames += 1
        self.total_frames_written += 1
        self.total_bytes_written  += record_size

        _m.frames_written.inc()
        _m.bytes_written.inc(record_size)

        if self._on_frame_written:
            try:
                self._on_frame_written(pkt, self._chunk_id, byte_offset)
            except Exception:
                logger.exception("on_frame_written callback raised")

        return byte_offset

    # ── main loop ──────────────────────────────────────────────────────────────

    def _run(self) -> None:
        self._open_chunk()
        try:
            while self._running.is_set():
                pkt = self._buffer.pop()
                if pkt is None:
                    time.sleep(_IDLE_SLEEP_S)
                    continue
                self._write_frame(pkt)
                if self._chunk_bytes >= self._chunk_max_bytes:
                    self._rotate()

            # drain remaining frames on clean shutdown
            while True:
                pkt = self._buffer.pop()
                if pkt is None:
                    break
                self._write_frame(pkt)
                if self._chunk_bytes >= self._chunk_max_bytes:
                    self._rotate()

        finally:
            self._close_chunk()
