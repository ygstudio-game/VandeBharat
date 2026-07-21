"""
Frame Fetching Service — FastAPI application.

Endpoints
─────────
GET /frames/{frame_id}
    Query PostgreSQL for chunk_id + byte_offset, seek into the .bin chunk
    file, demosaic BayerRG8 → RGB, return as PNG (default) or JPEG.
    Optional ?resize=WxH query parameter.

GET /frames/{frame_id}/raw
    Return the raw BayerRG8 payload bytes without demosaicing.

GET /stats
    Return total indexed frame count and service uptime.

GET /health
    Liveness probe.  Returns 200 even if postgres is not connected.

GET /metrics
    Prometheus scrape endpoint (only registered if METRICS_PORT env is unset;
    if it is set, a separate HTTP server is started in start_metrics_server()).
"""
import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from frame_fetcher import chunk_reader, metadata_client
from ingestion.metrics import retrieval_latency

logger = logging.getLogger("frame_fetcher.server")

# ── configuration (from environment) ─────────────────────────────────────────
CHUNK_DIR    = os.environ.get("CHUNK_DIR",    "/data/chunks")
POSTGRES_DSN = os.environ.get("POSTGRES_DSN", "postgresql://daq:daq@postgres:5432/daq")

_start_time = time.time()


# ── lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await metadata_client.connect(POSTGRES_DSN)
        logger.info("frame_fetcher: postgres connected")
    except Exception as e:
        # Don't crash on startup — /health still works; /frames/ returns 503
        logger.warning("frame_fetcher: postgres unavailable (%s) — retrieval disabled", e)
    yield
    await metadata_client.close()


app = FastAPI(title="DAQ Frame Fetcher", version="1.0.0", lifespan=lifespan)


# ── endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "postgres": metadata_client.is_connected()}


@app.get("/stats")
async def stats():
    if not metadata_client.is_connected():
        raise HTTPException(503, "metadata service not available")
    count = await metadata_client.total_frame_count()
    return {
        "total_frames_indexed": count,
        "chunk_dir": CHUNK_DIR,
        "uptime_seconds": round(time.time() - _start_time, 1),
    }


@app.get("/frames/{frame_id}/raw")
async def get_frame_raw(frame_id: int):
    """Return the raw BayerRG8 payload for the given frame ID."""
    meta = await _get_meta_or_404(frame_id)
    payload, _ = await asyncio.to_thread(
        chunk_reader.read_frame_bytes,
        meta["chunk_id"], meta["byte_offset"], CHUNK_DIR,
    )
    return Response(content=payload, media_type="application/octet-stream")


@app.get("/frames/{frame_id}")
async def get_frame(
    frame_id: int,
    fmt:    str       = Query(default="png",  alias="format", pattern="^(png|jpeg|jpg)$"),
    resize: str | None = Query(default=None,   pattern=r"^\d+x\d+$"),
):
    """
    Retrieve a stored frame by internal_frame_id.

    Query params:
        format  : "png" (default) or "jpeg"
        resize  : "WxH" e.g. "640x640" — resize after demosaic
    """
    t0 = time.perf_counter()
    meta = await _get_meta_or_404(frame_id)

    # ── read + CRC validate ───────────────────────────────────────────────────
    try:
        payload, hdr = await asyncio.to_thread(
            chunk_reader.read_frame_bytes,
            meta["chunk_id"], meta["byte_offset"], CHUNK_DIR,
        )
    except chunk_reader.ChunkReadError as e:
        raise HTTPException(500, f"chunk read error: {e}")

    # ── demosaic ──────────────────────────────────────────────────────────────
    try:
        rgb = await asyncio.to_thread(
            chunk_reader.bayer_to_rgb,
            payload, meta["width"], meta["height"],
        )
    except chunk_reader.ChunkReadError as e:
        raise HTTPException(500, f"demosaic error: {e}")

    # ── optional resize ───────────────────────────────────────────────────────
    if resize:
        w, h = map(int, resize.split("x"))
        rgb = await asyncio.to_thread(chunk_reader.resize_rgb, rgb, w, h)

    # ── encode ────────────────────────────────────────────────────────────────
    if fmt in ("jpeg", "jpg"):
        img_bytes  = await asyncio.to_thread(chunk_reader.encode_jpeg, rgb)
        media_type = "image/jpeg"
    else:
        img_bytes  = await asyncio.to_thread(chunk_reader.encode_png, rgb)
        media_type = "image/png"

    retrieval_latency.observe(time.perf_counter() - t0)

    return Response(
        content=img_bytes,
        media_type=media_type,
        headers={
            "X-Frame-Id":    str(frame_id),
            "X-Chunk-Id":    str(meta["chunk_id"]),
            "X-Byte-Offset": str(meta["byte_offset"]),
            "X-Width":       str(meta["width"]),
            "X-Height":      str(meta["height"]),
        },
    )


@app.get("/metrics")
async def prometheus_metrics():
    """Prometheus scrape endpoint (alternative to dedicated HTTP server)."""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_meta_or_404(frame_id: int) -> dict:
    if not metadata_client.is_connected():
        raise HTTPException(503, "metadata service not available — postgres not connected")
    meta = await metadata_client.get_frame_meta(frame_id)
    if meta is None:
        raise HTTPException(404, f"frame {frame_id} not found")
    return meta
