"""
DAQ Ingestion Pipeline — main entry point.

Wires together all components and runs until stopped:

    8 simulator cameras  →  BoundedFrameBuffer  →  ChunkWriter  →  NVMe (.bin)
                                                        ↓               ↓
                                                 MetadataService   ChunkPublisher
                                                   (PostgreSQL)       (NATS)

Environment variables (set via .env / Docker):
    POSTGRES_DSN          postgresql://daq:daq@postgres:5432/daq
    NATS_URL              nats://nats:4222
    CHUNK_DIR             /data/chunks
    CHUNK_MAX_BYTES       536870912   (512 MB per chunk file)
    METRICS_PORT          9100
    RING_CAPACITY         2048

Stop conditions (pipeline exits cleanly when ANY of these is hit):
    DEMO_DURATION_S       0 = run forever (default).  Set e.g. 120 to auto-stop
                          after 2 minutes.
    MIN_FREE_DISK_GB      10 = stop when free space on CHUNK_DIR drops below
                          this many GB.  Prevents filling the drive.
"""
import logging
import os
import shutil
import signal
import sys
import threading
import time

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

POSTGRES_DSN      = os.environ.get("POSTGRES_DSN",      "postgresql://daq:daq@postgres:5432/daq")
NATS_URL          = os.environ.get("NATS_URL",           "nats://nats:4222")
CHUNK_DIR         = os.environ.get("CHUNK_DIR",          "/data/chunks")
CHUNK_MAX_BYTES   = int(os.environ.get("CHUNK_MAX_BYTES",   str(512 * 1024 * 1024)))
METRICS_PORT      = int(os.environ.get("METRICS_PORT",   "9100"))
RING_CAPACITY     = int(os.environ.get("RING_CAPACITY",  "2048"))
DEMO_DURATION_S   = int(os.environ.get("DEMO_DURATION_S", "0"))    # 0 = no time limit
MIN_FREE_DISK_GB  = int(os.environ.get("MIN_FREE_DISK_GB", "10"))  # stop before disk fills

# Written by the dashboard when the user changes bandwidth target
_BANDWIDTH_CONFIG  = os.path.join(CHUNK_DIR, ".daq_bandwidth_gbe")


def _read_bandwidth_gbe() -> float:
    """Read target bandwidth from the shared config file, fallback to env var."""
    try:
        with open(_BANDWIDTH_CONFIG) as f:
            return float(f.read().strip())
    except Exception:
        pass
    return float(os.environ.get("BANDWIDTH_GBE", "10.0"))


def _free_disk_gb(path: str) -> float:
    try:
        return shutil.disk_usage(path).free / (1024 ** 3)
    except Exception:
        return 9999.0


# ── pipeline ──────────────────────────────────────────────────────────────────

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
        logger.warning("NATS unreachable at %s — chunk.ready events disabled", NATS_URL)

    # 4. Shared ring buffer
    buffer = BoundedFrameBuffer(capacity=RING_CAPACITY)
    logger.info("Ring buffer: capacity=%d frames", RING_CAPACITY)

    # 5. on_frame_written callback
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
    logger.info("ChunkWriter started  dir=%s  max=%d MB", CHUNK_DIR, CHUNK_MAX_BYTES // 1024 // 1024)

    # 7. Camera rig
    bandwidth_gbe = _read_bandwidth_gbe()
    numberer = GlobalFrameNumberer()
    rig = CameraRig(numberer=numberer, buffer=buffer, bandwidth_gbe=bandwidth_gbe)
    rig.start()
    target_mbps = bandwidth_gbe * 125
    logger.info(
        "CameraRig started: %d cameras  target=%.1f GbE (%.0f MB/s)",
        len(rig.cameras), bandwidth_gbe, target_mbps,
    )
    for cam in rig.cameras:
        logger.info(
            "  cam%d  %dx%d  %.1f FPS  (~%.0f MB/s)",
            cam.camera_id, cam.width, cam.height, cam.fps,
            cam.fps * cam.width * cam.height / 1e6,
        )

    # 8. Live terminal stats
    stats = StatsThread(cameras=rig.cameras, buffer=buffer)
    stats.start()

    # 9. Log active stop conditions
    if DEMO_DURATION_S > 0:
        logger.info("Auto-stop: DEMO_DURATION_S=%ds", DEMO_DURATION_S)
    logger.info("Disk guard: will stop when free space < %d GB on %s", MIN_FREE_DISK_GB, CHUNK_DIR)

    # 10. Stop event — set by signal OR watchdog thread
    stop_event = threading.Event()

    def _shutdown(signum, _frame):
        logger.info("Signal %d received — shutting down", signum)
        stop_event.set()

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT,  _shutdown)

    # 11. Watchdog: checks duration limit + disk space every 5 seconds
    start_time = time.monotonic()

    def _watchdog():
        while not stop_event.is_set():
            time.sleep(5)

            # Duration limit
            if DEMO_DURATION_S > 0:
                elapsed = time.monotonic() - start_time
                if elapsed >= DEMO_DURATION_S:
                    logger.info(
                        "DEMO_DURATION_S=%ds reached (elapsed %.0fs) — stopping pipeline",
                        DEMO_DURATION_S, elapsed,
                    )
                    stop_event.set()
                    return

            # Disk space guard
            free_gb = _free_disk_gb(CHUNK_DIR)
            if free_gb < MIN_FREE_DISK_GB:
                logger.warning(
                    "Disk space low: %.1f GB free (threshold %d GB) — stopping pipeline",
                    free_gb, MIN_FREE_DISK_GB,
                )
                stop_event.set()
                return

    watchdog = threading.Thread(target=_watchdog, name="watchdog", daemon=True)
    watchdog.start()

    logger.info("Pipeline running — press Ctrl-C or SIGTERM to stop")
    stop_event.wait()

    # 12. Graceful shutdown
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
        "Shutdown complete — frames: %d  bytes: %d  chunks: %d",
        writer.total_frames_written,
        writer.total_bytes_written,
        writer.chunks_written,
    )


if __name__ == "__main__":
    main()
