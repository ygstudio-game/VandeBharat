"""
IngestionPipeline (B1) — wires source -> bounded buffer -> store -> publisher.

Guarantees:
  * strictly increasing per-camera frame_number on everything published
  * capture never blocks: full buffer drops oldest (counted)
  * transient source failure -> bounded-backoff reconnect, then continue (no crash)

All collaborators are injected so the whole loop is unit-testable with a synthetic
source + in-memory publisher (no cv2 / no Redis).
"""
import logging

from frame import FramePacket, FrameNumberer, default_clock_ms
from source import FrameSource, SourceUnavailable
from buffer import BoundedFrameBuffer
from store import FrameStore
from publisher import Publisher

logger = logging.getLogger("ingestion")


class IngestionPipeline:
    def __init__(
        self,
        source: FrameSource,
        buffer: BoundedFrameBuffer,
        store: FrameStore,
        publisher: Publisher,
        *,
        numberer: FrameNumberer | None = None,
        clock=default_clock_ms,
        max_reconnect_attempts: int = 5,
        backoff_base_s: float = 0.5,
        sleeper=None,
        screen=None,
        select=None,
    ):
        self.source = source
        self.buffer = buffer
        self.store = store
        self.publisher = publisher
        self.numberer = numberer or FrameNumberer()
        self.clock = clock
        self.max_reconnect_attempts = max_reconnect_attempts
        self.backoff_base_s = backoff_base_s
        # screen(payload) -> (accepted: bool, reason: str); None = no pre-screen (B2)
        self.screen = screen
        # select(payload) -> (process: bool, task, reason); None = process all (B3)
        self.select = select
        import time as _t
        self._sleep = sleeper or _t.sleep
        # metrics
        self.frames_produced = 0
        self.frames_published = 0
        self.frames_rejected = 0
        self.frames_skipped = 0
        self.reject_reasons: dict[str, int] = {}
        self.reconnects = 0

    # ---- producer ----
    def produce_one(self) -> FramePacket | None:
        payload = self._read_with_reconnect()
        if payload is None:
            return None
        # B2 quality pre-screen: reject blurry/dark/overexposed before the GPU.
        if self.screen is not None:
            accepted, reason = self.screen(payload)
            if not accepted:
                self.frames_rejected += 1
                self.reject_reasons[reason] = self.reject_reasons.get(reason, 0) + 1
                logger.info('{"event":"frame_rejected","camera":%s,"reason":"%s"}',
                            self.source.camera_id, reason)
                return None
        # B3 smart selection: skip frames not worth GPU (inter-coach gaps, active stride).
        if self.select is not None:
            process, _task, sreason = self.select(payload)
            if not process:
                self.frames_skipped += 1
                return None
        cam = self.source.camera_id
        pkt = FramePacket(
            camera_id=cam,
            frame_number=self.numberer.next(cam),
            timestamp_ms=self.clock(),
            payload=payload,
        )
        self.buffer.push(pkt)
        self.frames_produced += 1
        return pkt

    def _read_with_reconnect(self) -> bytes | None:
        attempt = 0
        while True:
            try:
                return self.source.read()
            except SourceUnavailable as e:
                attempt += 1
                if attempt > self.max_reconnect_attempts:
                    logger.error('{"event":"source_dead","camera":%s,"err":"%s"}',
                                 self.source.camera_id, e)
                    raise
                backoff = self.backoff_base_s * (2 ** (attempt - 1))
                logger.warning('{"event":"source_reconnect","camera":%s,"attempt":%d,"backoff_s":%.2f}',
                               self.source.camera_id, attempt, backoff)
                self._sleep(backoff)
                self.source.reconnect()
                self.reconnects += 1

    # ---- consumer ----
    def consume_one(self) -> FramePacket | None:
        pkt = self.buffer.pop()
        if pkt is None:
            return None
        ref = self.store.put(pkt)
        self.publisher.publish(pkt, ref)
        self.frames_published += 1
        return pkt

    def drain(self) -> int:
        n = 0
        while self.consume_one() is not None:
            n += 1
        return n

    # ---- combined ----
    def run(self, n_frames: int) -> None:
        """Produce then immediately drain n frames (1:1 — no drops)."""
        for _ in range(n_frames):
            self.produce_one()
            self.drain()

    @property
    def frames_dropped(self) -> int:
        return self.buffer.frames_dropped
