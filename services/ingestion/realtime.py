"""
RealtimeProcessor (B5) — drives the streaming path end to end:

    ingest frame event  ->  inferer (YOLO/OCR)  ->  defect? -> sink (DB + WebSocket)
                                                              -> record ingest->flag latency

All collaborators are injected so the wiring + latency accounting are unit-tested
with fakes (fake clock, fake inferer). In production the inferer POSTs the frame
to the existing YOLO service (PyTorch backend — B4 TensorRT deferred) and the sink
writes the defect row + emits the WebSocket event.
"""
import logging

from latency import LatencyTracker

logger = logging.getLogger("realtime")


def _default_is_defect(det: dict) -> bool:
    return bool(det.get("is_defect", False))


class RealtimeProcessor:
    def __init__(self, inferer, sink, latency: LatencyTracker, *,
                 clock, is_defect=_default_is_defect):
        self.inferer = inferer          # frame_ref -> list[detection dict]
        self.sink = sink                # defect_event -> None (DB write + WS emit)
        self.latency = latency
        self.clock = clock              # () -> ms (same scale as ingest_timestamp_ms)
        self.is_defect = is_defect
        self.frames_processed = 0
        self.defects_flagged = 0

    def process(self, frame_event: dict) -> int:
        """Process one ingested frame event. Returns #defects flagged."""
        self.frames_processed += 1
        ingest_ts = frame_event["ingest_timestamp_ms"]
        ref = frame_event["frame_ref"]
        flagged = 0
        for det in self.inferer(ref):
            if self.is_defect(det):
                event = {
                    "frame_ref": ref,
                    "defect_class": det.get("class"),
                    "confidence": det.get("confidence"),
                    "ingest_timestamp_ms": ingest_ts,
                }
                self.sink(event)
                latency_ms = self.clock() - ingest_ts
                self.latency.record(latency_ms)
                self.defects_flagged += 1
                flagged += 1
                logger.info('{"event":"defect_flagged","class":"%s","latency_ms":%.1f}',
                            det.get("class"), latency_ms)
        return flagged
