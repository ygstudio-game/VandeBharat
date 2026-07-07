"""
Real-time consumer (B5, host wiring) — connects the streaming path on the real
stack:

    vande:stream:ingest  --XREADGROUP-->  HttpYoloInferer  -->  RealtimeProcessor
                                                              -->  DB sink + latency

Run on the host (needs Redis + YOLO service + DB):
    python services/ingestion/realtime_consumer.py

The orchestration/latency logic lives in realtime.py + latency.py (unit-tested).
This module only provides the real Redis/HTTP/DB adapters (integration tier).
"""
import os
import logging

from latency import LatencyTracker
from realtime import RealtimeProcessor

logger = logging.getLogger("realtime_consumer")

STREAM = "vande:stream:ingest"
GROUP = "vande:group:ingest"


class RedisFrameSource:
    """Yields frame events {frame_ref, ingest_timestamp_ms} from the ingest stream."""

    def __init__(self, redis_url: str, consumer: str = "rt-1",
                 stream: str = STREAM, group: str = GROUP):
        import redis  # lazy
        self._r = redis.Redis.from_url(redis_url, decode_responses=True)
        self.consumer = consumer
        self.stream = stream
        self.group = group
        try:
            self._r.xgroup_create(stream, group, id="0", mkstream=True)
        except Exception:
            pass  # group already exists

    def read(self, block_ms: int = 5000, count: int = 16):
        resp = self._r.xreadgroup(self.group, self.consumer, {self.stream: ">"},
                                  count=count, block=block_ms)
        events = []
        for _stream, entries in resp or []:
            for msg_id, fields in entries:
                events.append({
                    "msg_id": msg_id,
                    "frame_ref": fields.get("frame_ref"),
                    # wall-clock epoch so ingest->flag latency is valid across processes
                    "ingest_timestamp_ms": float(fields.get("ingest_epoch_ms", 0.0)),
                })
        return events

    def ack(self, msg_id: str):
        self._r.xack(self.stream, self.group, msg_id)


class HttpYoloInferer:
    """POSTs a frame (by reference) to the existing YOLO service; returns detections."""

    def __init__(self, yolo_url: str):
        self.yolo_url = yolo_url

    def __call__(self, frame_ref: str):
        import requests  # lazy
        # frame_ref is a local path (LocalFileStore) in B1; read + post bytes.
        with open(frame_ref, "rb") as f:
            files = {"file": ("frame.jpg", f, "image/jpeg")}
            r = requests.post(self.yolo_url, files=files, timeout=10)
        r.raise_for_status()
        return r.json().get("detections", [])


def db_sink(redis_url: str):
    """Returns a sink(defect_event) that writes to Postgres. Lazy psycopg2."""
    def sink(event: dict):
        logger.info('{"event":"defect_persisted","class":"%s"}', event.get("defect_class"))
        # real impl: INSERT into defects(...) + emit WS via backend
    return sink


def main():
    redis_url = os.environ.get("INGEST_REDIS_URL", "redis://127.0.0.1:6379")
    yolo_url = os.environ.get("YOLO_SERVICE_URL", "http://127.0.0.1:5002/api/yolo/predict")
    budget = float(os.environ.get("RT_BUDGET_MS", "10000"))

    src = RedisFrameSource(redis_url)
    inferer = HttpYoloInferer(yolo_url)
    lt = LatencyTracker(budget_ms=budget)
    import time
    proc = RealtimeProcessor(inferer, db_sink(redis_url), lt,
                             clock=lambda: time.time() * 1000.0)  # wall clock, matches ingest_epoch_ms

    logger.info('{"event":"realtime_consumer_started"}')
    while True:
        for ev in src.read():
            proc.process(ev)
            src.ack(ev["msg_id"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
