"""
Prometheus metrics for the DAQ ingestion pipeline (Phase 6, Task 6.2).

All metric objects are module-level singletons.  Any module that imports
from here gets the same counters — they share one global registry by default.

Usage
─────
    from ingestion.metrics import frames_written, write_latency
    frames_written.inc()
    with write_latency.time():
        ...

Start the HTTP scrape endpoint once at process startup:
    from ingestion.metrics import start_metrics_server
    start_metrics_server(port=9100)
"""
import time
import threading
from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    start_http_server,
)

# ── counters ──────────────────────────────────────────────────────────────────

frames_received = Counter(
    "daq_frames_received",
    "Total frames received from camera sources",
    ["camera_id"],
)

frames_written = Counter(
    "daq_frames_written",
    "Total frames successfully written to chunk files",
)

frames_dropped = Counter(
    "daq_frames_dropped",
    "Total frames dropped by the ring buffer due to back-pressure",
)

chunks_written = Counter(
    "daq_chunks_written",
    "Total chunk files completed and closed",
)

bytes_written = Counter(
    "daq_bytes_written",
    "Total bytes (frame header + payload) written to NVMe",
)

metadata_inserts = Counter(
    "daq_metadata_inserts",
    "Total frame metadata rows inserted into PostgreSQL",
)

# ── gauges ────────────────────────────────────────────────────────────────────

buffer_fill_ratio = Gauge(
    "daq_buffer_fill_ratio",
    "Ring buffer current fill level (0.0 – 1.0)",
)

throughput_mbps = Gauge(
    "daq_throughput_mbps",
    "Rolling 1-second write throughput in MB/s",
)

# ── histograms ────────────────────────────────────────────────────────────────

write_latency = Histogram(
    "daq_chunk_write_latency_seconds",
    "Per-frame time spent in ChunkWriter._write_frame()",
    buckets=[0.0001, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.05, 0.1],
)

# frame fetcher retrieval latency (registered here so both services share schema)
retrieval_latency = Histogram(
    "daq_frame_retrieval_latency_seconds",
    "End-to-end latency for GET /frames/{id} (seek + demosaic + encode)",
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5],
)

# ── throughput tracker ────────────────────────────────────────────────────────

class _ThroughputTracker:
    """
    Updates the throughput_mbps gauge every second from a background thread.
    Reads bytes_written counter deltas to compute rolling MB/s.
    """

    def __init__(self, interval_s: float = 1.0):
        self._interval  = interval_s
        self._last_bytes = 0.0
        self._running    = threading.Event()
        self._thread: threading.Thread | None = None

    @staticmethod
    def _read_bytes_written() -> float:
        """Read current bytes_written counter value."""
        try:
            return bytes_written._value.get()
        except Exception:
            pass
        try:
            for metric in bytes_written.collect():
                for sample in metric.samples:
                    if "_total" in sample.name:
                        return sample.value
        except Exception:
            pass
        return 0.0

    def start(self) -> None:
        self._last_bytes = self._read_bytes_written()
        self._running.set()
        self._thread = threading.Thread(
            target=self._run, name="throughput-tracker", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._running.clear()
        if self._thread:
            self._thread.join(timeout=2.0)

    def _run(self) -> None:
        alpha = 0.4   # EMA smoothing — keeps gauge non-zero between write bursts
        smoothed = 0.0
        while self._running.is_set():
            time.sleep(self._interval)
            cur     = self._read_bytes_written()
            delta   = cur - self._last_bytes
            self._last_bytes = cur
            instant = delta / 1e6 / self._interval
            smoothed = alpha * instant + (1.0 - alpha) * smoothed
            throughput_mbps.set(smoothed)


_tracker: _ThroughputTracker | None = None


# ── public start function ─────────────────────────────────────────────────────

def start_metrics_server(port: int = 9100) -> None:
    """
    Start the Prometheus HTTP scrape server and the throughput tracker.
    Call once at process startup.
    """
    global _tracker
    start_http_server(port)
    _tracker = _ThroughputTracker()
    _tracker.start()
