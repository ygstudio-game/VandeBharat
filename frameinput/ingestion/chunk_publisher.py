"""
ChunkPublisher — publishes a NATS message on the `chunk.ready` subject
whenever the ChunkWriter closes (rotates) a chunk file.

Downstream consumers (preprocessing, AI, backup, cloud sync) subscribe to
`chunk.ready` and process the completed chunk independently of acquisition.

Thread model
────────────
ChunkWriter calls publish_chunk_ready() synchronously from its writer thread.
The publisher bridges sync → async via asyncio.run_coroutine_threadsafe()
into a private event loop daemon thread, so NATS I/O never blocks the writer.

Usage
─────
    pub = ChunkPublisher()
    await pub.connect("nats://localhost:4222")       # call from async context
    # --- or ---
    pub.start("nats://localhost:4222")               # blocking connect in bg thread

    # wire into ChunkWriter:
    writer = ChunkWriter(..., on_chunk_closed=pub.publish_chunk_ready)

    pub.stop()
"""
import asyncio
import json
import logging
import threading
import time
from typing import Optional

import nats

logger = logging.getLogger("chunk_publisher")

SUBJECT = "chunk.ready"


class ChunkPublisher:

    def __init__(self) -> None:
        self._nc: Optional[nats.aio.client.Client] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._connected = threading.Event()
        self._stop_flag = threading.Event()

        self.messages_published = 0
        self.publish_errors     = 0

    # ── public API ─────────────────────────────────────────────────────────────

    def start(self, url: str, timeout: float = 10.0) -> None:
        """
        Start the background event loop, connect to NATS, and block until
        connected (or raise TimeoutError).  Call once at startup.
        """
        self._stop_flag.clear()
        self._thread = threading.Thread(
            target=self._run_loop,
            args=(url,),
            name="chunk-publisher",
            daemon=True,
        )
        self._thread.start()
        if not self._connected.wait(timeout=timeout):
            raise TimeoutError(f"could not connect to NATS at {url} within {timeout}s")

    def publish_chunk_ready(
        self, chunk_id: int, path: str, frame_count: int
    ) -> None:
        """
        Called from ChunkWriter thread (sync).  Non-blocking — submits to
        the publisher's event loop and returns immediately.
        """
        if self._loop is None or not self._loop.is_running():
            logger.warning("publisher not running — dropping chunk.ready for chunk %d", chunk_id)
            return
        asyncio.run_coroutine_threadsafe(
            self._publish(chunk_id, path, frame_count),
            self._loop,
        )

    def stop(self, timeout: float = 5.0) -> None:
        self._stop_flag.set()
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join(timeout=timeout)

    # ── internals ──────────────────────────────────────────────────────────────

    def _run_loop(self, url: str) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._connect(url))
            self._loop.run_forever()
        except Exception:
            logger.exception("chunk publisher event loop crashed")
        finally:
            if self._nc:
                try:
                    self._loop.run_until_complete(self._nc.close())
                except Exception:
                    pass
            self._loop.close()

    async def _connect(self, url: str) -> None:
        self._nc = await nats.connect(
            url,
            name="daq-chunk-publisher",
            reconnect_time_wait=1,
            max_reconnect_attempts=5,
        )
        logger.info("ChunkPublisher connected to NATS at %s", url)
        self._connected.set()

    async def _publish(self, chunk_id: int, path: str, frame_count: int) -> None:
        if self._nc is None or not self._nc.is_connected:
            logger.warning("NATS not connected — dropping chunk.ready for chunk %d", chunk_id)
            self.publish_errors += 1
            return
        payload = json.dumps({
            "chunk_id":    chunk_id,
            "path":        path,
            "frame_count": frame_count,
            "timestamp_us": time.time_ns() // 1000,
        }).encode()
        try:
            await self._nc.publish(SUBJECT, payload)
            self.messages_published += 1
            logger.debug("published chunk.ready chunk_id=%d frames=%d", chunk_id, frame_count)
        except Exception as e:
            self.publish_errors += 1
            logger.error("NATS publish failed for chunk %d: %s", chunk_id, e)
