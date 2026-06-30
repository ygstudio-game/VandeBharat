"""
Ingestion Service — port 5007 (B1).

Streams a looping video file as if it were a live camera, applies drop-oldest
back-pressure, and publishes frame references to the Redis stream
`vande:stream:ingest`. Runs alongside the existing upload/batch path (does not
replace it).

Endpoints:
  GET  /health   standardized envelope
  GET  /metrics  frames_produced / published / dropped / reconnects
  POST /start    begin streaming in a background thread
  POST /stop     stop streaming
"""
import os
import sys
import logging
import threading

from fastapi import FastAPI

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "..", "GPU", "shared"))
from logging_utils import configure_logging  # noqa: E402
from health import health_payload  # noqa: E402

from config import load_config  # noqa: E402
from frame import FrameNumberer  # noqa: E402
from buffer import BoundedFrameBuffer  # noqa: E402
from source import FileLoopSource  # noqa: E402
from store import LocalFileStore  # noqa: E402
from publisher import RedisPublisher  # noqa: E402
from pipeline import IngestionPipeline  # noqa: E402
from quality_gate import QualityGate  # noqa: E402
from scheduler import FrameScheduler, make_motion_selector  # noqa: E402

configure_logging("ingestion")
logger = logging.getLogger("ingestion")

app = FastAPI(title="VandeInspect Ingestion Service", version="1.0.0")

_state = {"pipeline": None, "thread": None, "running": False}


@app.get("/health")
def health():
    return health_payload("ingestion", port=5007, running=_state["running"])


@app.get("/metrics")
def metrics():
    p = _state["pipeline"]
    if not p:
        return {"running": False}
    return {
        "running": _state["running"],
        "frames_produced": p.frames_produced,
        "frames_published": p.frames_published,
        "frames_rejected": p.frames_rejected,
        "frames_skipped": p.frames_skipped,
        "frames_dropped": p.frames_dropped,
        "reject_reasons": p.reject_reasons,
        "reconnects": p.reconnects,
        "buffer_len": len(p.buffer),
    }


def _build_pipeline() -> IngestionPipeline:
    cfg = load_config()
    source = FileLoopSource(cfg["source_uri"], camera_id=int(cfg["camera_id"]),
                            jpeg_quality=int(cfg["jpeg_quality"]))
    buf = BoundedFrameBuffer(int(cfg["buffer_capacity"]))
    store = LocalFileStore(cfg["frame_store_dir"])
    publisher = RedisPublisher(cfg["redis_url"])
    screen = None
    q = cfg.get("quality", {})
    if q.get("enabled", False):
        screen = QualityGate.from_config({"quality": q}).screen_payload
    select = None
    s = cfg.get("scheduler", {})
    if s.get("enabled", False):
        select = make_motion_selector(FrameScheduler.from_config({"scheduler": s}))
    return IngestionPipeline(
        source, buf, store, publisher,
        numberer=FrameNumberer(),
        max_reconnect_attempts=int(cfg["max_reconnect_attempts"]),
        backoff_base_s=float(cfg["backoff_base_s"]),
        screen=screen,
        select=select,
    )


def _run_loop(p: IngestionPipeline):
    while _state["running"]:
        p.produce_one()
        p.drain()


@app.post("/start")
def start():
    if _state["running"]:
        return {"status": "already_running"}
    p = _build_pipeline()
    _state["pipeline"] = p
    _state["running"] = True
    t = threading.Thread(target=_run_loop, args=(p,), daemon=True)
    _state["thread"] = t
    t.start()
    logger.info('{"event":"ingestion_started"}')
    return {"status": "started"}


@app.post("/stop")
def stop():
    _state["running"] = False
    logger.info('{"event":"ingestion_stopped"}')
    return {"status": "stopped"}
