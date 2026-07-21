"""
DAQ Ingestion Pipeline — main entry point.

Wires together all components and runs until SIGTERM / Ctrl-C:

    8 simulator cameras  →  BoundedFrameBuffer  →  ChunkWriter  →  NVMe (.bin)
                                                        ↓               ↓
                                                 MetadataService   ChunkPublisher
                                                   (PostgreSQL)       (NATS)

Environment variables (set via .env / Docker):
    POSTGRES_DSN      postgresql://daq:daq@postgres:5432/daq
    NATS_URL          nats://nats:4222
    CHUNK_DIR         /data/chunks
    CHUNK_MAX_BYTES   536870912   (512 MB)
    METRICS_PORT      9100
    RING_CAPACITY     2048
"""
import logging
import os
import signal
import sys
import threading

# Make 'core' and 'ingestion' importable when run as a module inside Docker
# (PYTHONPATH=/app is set in the Dockerfile; this guard covers local dev runs).
if __name__ == "__main__":
    import pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from core.frame import GlobalFrameNumberer
from ingestion.chunk_publisher import ChunkPublisher
from ingestion.chunk_writer import ChunkWriter
from ingestion.metadata_service import MetadataService
from ingestion.metrics import frames_received, start_metrics_server
from ingestion.ring_buffer import BoundedFrameBuffer
from ingestion.simulator import CameraRig
from ingestion.stats import StatsThread

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)-24s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("pipeline")

# ── configuration ─────────────────────────────────────────────────────────────

POSTGRES_DSN    = os.environ.get("POSTGRES_DSN",    "postgresql://daq:daq@postgres:5432/daq")
NATS_URL        = os.environ.get("NATS_URL",         "nats://nats:4222")
CHUNK_DIR       = os.environ.get("CHUNK_DIR",        "/data/chunks")
CHUNK_MAX_BYTES = int(os.environ.get("CHUNK_MAX_BYTES", str(512 * 1024 * 1024)))
METRICS_PORT    = int(os.environ.get("METRICS_PORT", "9100"))
RING_CAPACITY   = int(os.environ.get("RING_CAPACITY", "2048"))


# ── pipeline wiring ───────────────────────────────────────────────────────────

def main() -> None:

    # 1. Prometheus metrics HTTP endpoint
    logger.info("Starting Prometheus metrics server on :%d", METRICS_PORT)
    start_metrics_server(METRICS_PORT)

    # 2. PostgreSQL metadata service
    metadata_svc = MetadataService()
    metadata_svc.start(POSTGRES_DSN)
    logger.info("MetadataService started  dsn=%s", POSTGRES_DSN)

    # 3. NATS chunk publisher (non-fatal if NATS is absent)
    publisher = ChunkPublisher()
    try:
        publisher.start(NATS_URL, timeout=15.0)
        logger.info("ChunkPublisher connected  url=%s", NATS_URL)
    except TimeoutError:
        logger.warning(
            "NATS unreachable at %s — chunk.ready events will be skipped", NATS_URL
        )

    # 4. Shared ring buffer
    buffer = BoundedFrameBuffer(capacity=RING_CAPACITY)
    logger.info("Ring buffer: capacity=%d frames", RING_CAPACITY)

    # 5. on_frame_written callback — wires writer → metadata + per-camera counter
    def _on_frame_written(pkt, chunk_id, byte_offset):
        metadata_svc.enqueue(pkt, chunk_id, byte_offset)
        frames_received.labels(camera_id=str(pkt.camera_id)).inc()

    # 6. Chunk writer
    writer = ChunkWriter(
        chunk_dir        = CHUNK_DIR,
        buffer           = buffer,
        chunk_max_bytes  = CHUNK_MAX_BYTES,
        on_frame_written = _on_frame_written,
        on_chunk_closed  = publisher.publish_chunk_ready,
    )
    writer.start()
    logger.info(
        "ChunkWriter started  dir=%s  max=%d MB",
        CHUNK_DIR, CHUNK_MAX_BYTES // 1024 // 1024,
    )

    # 7. Camera rig — 8 simulated cameras
    numberer = GlobalFrameNumberer()
    rig = CameraRig(numberer=numberer, buffer=buffer)
    rig.start()
    logger.info("CameraRig started: %d cameras", len(rig.cameras))
    for cam in rig.cameras:
        logger.info(
            "  cam%d  %dx%d  %.0f FPS  (~%.0f MB/s each)",
            cam.camera_id, cam.width, cam.height, cam.fps,
            cam.fps * cam.width * cam.height / 1e6,
        )

    # 8. Live terminal stats
    stats = StatsThread(cameras=rig.cameras, buffer=buffer)
    stats.start()

    # 9. Block until SIGTERM or SIGINT, then drain gracefully
    stop_event = threading.Event()

    def _shutdown(signum, _frame):
        logger.info("Signal %d received — initiating graceful shutdown", signum)
        stop_event.set()

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT,  _shutdown)

    logger.info("Pipeline running — waiting for shutdown signal (Ctrl-C or SIGTERM)")
    stop_event.wait()

    logger.info("Stopping camera rig...")
    rig.stop()
    stats.stop()

    logger.info("Stopping chunk writer (draining buffer)...")
    writer.stop(timeout=30.0)

    logger.info("Flushing metadata to PostgreSQL...")
    metadata_svc.flush_sync(timeout=30.0)
    metadata_svc.stop()

    publisher.stop()

    logger.info(
        "Shutdown complete — frames written: %d  bytes: %d  chunks: %d",
        writer.total_frames_written,
        writer.total_bytes_written,
        writer.chunks_written,
    )


if __name__ == "__main__":
    main()
