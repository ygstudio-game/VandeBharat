"""
Unit tests for ingestion/metrics.py and ingestion/chunk_publisher.py (Phase 6).

Metrics tests require only prometheus_client — no external services.
Publisher tests require a running NATS server and are marked @integration.

Run:
    pytest ingestion/test_metrics.py -v                  # metrics only
    pytest ingestion/test_metrics.py -v -m integration   # +NATS tests
"""
import os
import socket
import threading
import time

import pytest
from prometheus_client import REGISTRY, Counter, generate_latest


# ── metrics unit tests ────────────────────────────────────────────────────────

class TestMetricObjects:

    def test_all_metric_names_registered(self):
        from ingestion import metrics as m
        names = {mf.name for mf in REGISTRY.collect()}
        # Counter metric family names are stored WITHOUT _total by prometheus_client;
        # _total only appears in the scrape text output and in Prometheus time-series names.
        expected = [
            "daq_frames_received",
            "daq_frames_written",
            "daq_frames_dropped",
            "daq_chunks_written",
            "daq_bytes_written",
            "daq_metadata_inserts",
            "daq_buffer_fill_ratio",
            "daq_throughput_mbps",
            "daq_chunk_write_latency_seconds",
            "daq_frame_retrieval_latency_seconds",
        ]
        for name in expected:
            assert name in names, f"metric {name!r} not registered"

    def test_counter_increments(self):
        from ingestion.metrics import frames_written
        before = frames_written._value.get()
        frames_written.inc()
        frames_written.inc(5)
        assert frames_written._value.get() == before + 6

    def test_gauge_set(self):
        from ingestion.metrics import buffer_fill_ratio
        buffer_fill_ratio.set(0.42)
        assert abs(buffer_fill_ratio._value.get() - 0.42) < 1e-9

    def test_histogram_observe(self):
        from ingestion.metrics import write_latency
        write_latency.observe(0.001)
        write_latency.observe(0.005)
        # no assertion needed — just verify it doesn't crash

    def test_labeled_counter_increments(self):
        from ingestion.metrics import frames_received
        before = frames_received.labels(camera_id="0")._value.get()
        frames_received.labels(camera_id="0").inc()
        assert frames_received.labels(camera_id="0")._value.get() == before + 1

    def test_generate_latest_is_valid_text(self):
        output = generate_latest().decode("utf-8")
        assert "daq_frames_written_total" in output
        assert "daq_buffer_fill_ratio" in output

    def test_write_latency_context_manager(self):
        from ingestion.metrics import write_latency
        with write_latency.time():
            time.sleep(0.001)   # just confirm no crash


class TestThroughputTracker:

    def test_throughput_updates_after_bytes_written(self):
        from ingestion.metrics import bytes_written, throughput_mbps, _ThroughputTracker

        tracker = _ThroughputTracker(interval_s=0.1)
        tracker.start()

        bytes_written.inc(50 * 1024 * 1024)   # add 50 MB
        time.sleep(0.25)

        val = throughput_mbps._value.get()
        tracker.stop()

        assert val > 0, f"expected throughput > 0, got {val}"


class TestMetricsIntegrationWithChunkWriter:
    """
    Verify that ChunkWriter actually increments the module-level metrics.
    These are unit tests — no postgres needed.
    """

    def test_frames_written_counter_updated(self, tmp_path):
        from ingestion.metrics import frames_written, bytes_written
        from ingestion.chunk_writer import ChunkWriter
        from ingestion.ring_buffer import BoundedFrameBuffer
        from core.frame import FramePacket, GlobalFrameNumberer
        import numpy as np

        before_f = frames_written._value.get()
        before_b = bytes_written._value.get()

        n = 10
        buf    = BoundedFrameBuffer(capacity=n + 10)
        writer = ChunkWriter(
            chunk_dir=str(tmp_path), buffer=buf, chunk_max_bytes=50*1024*1024
        )
        writer.start()

        numberer = GlobalFrameNumberer()
        for i in range(n):
            row     = np.arange(32, dtype=np.int16)
            col     = np.arange(32, dtype=np.int16).reshape(-1, 1)
            payload = ((row + col + i) % 256).astype(np.uint8).tobytes()
            buf.push(FramePacket(
                internal_frame_id=numberer.next(), camera_id=0, camera_frame_id=i,
                hw_timestamp_us=1_700_000_000_000_000 + i,
                width=32, height=32, pixel_format="BayerRG8", payload=payload,
            ))

        deadline = time.perf_counter() + 5.0
        while writer.total_frames_written < n and time.perf_counter() < deadline:
            time.sleep(0.02)
        writer.stop()

        assert frames_written._value.get() >= before_f + n
        assert bytes_written._value.get()  > before_b

    def test_frames_dropped_counter_updated(self):
        from ingestion.metrics import frames_dropped
        from ingestion.ring_buffer import BoundedFrameBuffer
        from core.frame import FramePacket

        before = frames_dropped._value.get()
        buf    = BoundedFrameBuffer(capacity=2)
        payload = b"\x00" * 1024

        for i in range(10):   # overfill by 8 frames
            buf.push(FramePacket(
                internal_frame_id=i, camera_id=0, camera_frame_id=i,
                hw_timestamp_us=0, width=32, height=32,
                pixel_format="BayerRG8", payload=payload,
            ))

        assert frames_dropped._value.get() >= before + 8


# ── NATS publisher integration tests ──────────────────────────────────────────

def _nats_available(url: str = "nats://localhost:4222") -> bool:
    """Quick TCP probe — doesn't do NATS handshake."""
    try:
        host, port = url.replace("nats://", "").split(":")
        s = socket.create_connection((host, int(port)), timeout=1)
        s.close()
        return True
    except Exception:
        return False


@pytest.fixture(scope="module")
def nats_url():
    url = os.environ.get("DAQ_NATS_URL", "nats://localhost:4222")
    if not _nats_available(url):
        pytest.skip(f"NATS not reachable at {url} — start with: docker compose up nats")
    return url


@pytest.mark.integration
class TestChunkPublisher:

    def test_connect_and_publish(self, nats_url):
        import asyncio
        import json
        import nats as nats_lib
        from ingestion.chunk_publisher import ChunkPublisher

        received: list[dict] = []

        async def _subscribe_and_receive():
            nc  = await nats_lib.connect(nats_url)
            sub = await nc.subscribe("chunk.ready")

            pub = ChunkPublisher()
            pub.start(nats_url, timeout=5.0)
            pub.publish_chunk_ready(chunk_id=7, path="/data/chunks/chunk_000007.bin", frame_count=4321)

            # wait up to 2 s for the message
            try:
                msg = await asyncio.wait_for(sub.next_msg(), timeout=2.0)
                received.append(json.loads(msg.data))
            except asyncio.TimeoutError:
                pass
            finally:
                pub.stop()
                await nc.close()

        asyncio.run(_subscribe_and_receive())

        assert len(received) == 1, "expected exactly one chunk.ready message"
        msg = received[0]
        assert msg["chunk_id"]    == 7
        assert msg["frame_count"] == 4321
        assert "/chunk_000007.bin" in msg["path"]
        assert msg["timestamp_us"] > 0

    def test_messages_published_counter_increments(self, nats_url):
        from ingestion.chunk_publisher import ChunkPublisher

        pub = ChunkPublisher()
        pub.start(nats_url, timeout=5.0)

        for i in range(5):
            pub.publish_chunk_ready(i, f"/data/chunk_{i:06d}.bin", 100)
        time.sleep(0.3)   # let async coroutines complete

        pub.stop()
        assert pub.messages_published == 5

    def test_stop_and_restart(self, nats_url):
        from ingestion.chunk_publisher import ChunkPublisher

        pub = ChunkPublisher()
        pub.start(nats_url, timeout=5.0)
        pub.publish_chunk_ready(0, "/tmp/chunk_000000.bin", 10)
        time.sleep(0.1)
        pub.stop()
        # Re-start should work cleanly
        pub2 = ChunkPublisher()
        pub2.start(nats_url, timeout=5.0)
        pub2.publish_chunk_ready(1, "/tmp/chunk_000001.bin", 20)
        time.sleep(0.1)
        pub2.stop()
        assert pub2.messages_published == 1
