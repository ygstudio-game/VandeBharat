# DAQ Frame Ingestion & Retrieval — Implementation Plan

> Target hardware: NVIDIA DGX Spark (ARM64, 128 GB unified RAM, 1 TB NVMe)
> Goal: Demonstrate sustained 8-camera simulated ingest → binary chunk storage → O(1) frame retrieval
> Language: Python (all services)
> Deployment: Docker Compose

---

## Quick Demo Target

The demo is considered complete when a single command does this:

```
docker compose up
# wait ~60 seconds for services to start
python demo_run.py        # runs 2-minute ingestion
curl http://localhost:8000/frames/500 --output frame500.png
open frame500.png         # valid colour RGB image appears
```

Grafana at `http://localhost:3000` shows:
- ~963 MB/s sustained throughput
- 0 dropped frames
- Live frames/sec per camera
- Chunk rotation events

---

## Directory Layout (everything goes under `frameinput/`)

```
frameinput/
├── PLAN.md                         ← this file
│
├── core/                           ← shared data structures
│   ├── frame.py                    ← FramePacket (extended)
│   └── chunk_format.py             ← struct definitions for .bin headers
│
├── ingestion/                      ← camera simulator + ring buffer + chunk writer
│   ├── simulator.py                ← IdsSimulatorSource (8 camera threads)
│   ├── ring_buffer.py              ← BoundedFrameBuffer (adapted from existing)
│   ├── chunk_writer.py             ← binary .bin writer, 512 MB rotation, CRC32
│   ├── metadata_service.py         ← asyncpg → PostgreSQL batch inserts
│   ├── chunk_publisher.py          ← nats-py → chunk.ready on rotation
│   ├── metrics.py                  ← prometheus_client counters
│   ├── pipeline.py                 ← wires all components, 8+1 threads
│   └── requirements.txt
│
├── frame_fetcher/                  ← retrieval + preprocessing API
│   ├── server.py                   ← FastAPI app
│   ├── chunk_reader.py             ← seek → read → CRC validate → demosaic
│   ├── metadata_client.py          ← asyncpg query
│   └── requirements.txt
│
├── infra/
│   ├── prometheus.yml              ← scrape config
│   └── grafana_dashboard.json      ← 8-panel DAQ dashboard
│
├── docker-compose.yml              ← full stack
├── demo_run.py                     ← one-shot demo script
└── .env                            ← config (ports, paths, chunk size)
```

---

## Phase 0 — Environment Bootstrap (Day 0, ~2 hours)

Goal: DGX Spark is ready to build and run the stack.

### Task 0.1 — Verify Docker on DGX Spark
```bash
docker --version            # must be >= 24
docker compose version      # must be >= 2.20
uname -m                    # must be aarch64
```
If Docker is missing: `sudo apt install docker.io docker-compose-plugin`

### Task 0.2 — Pull all base images (ARM64)
```bash
docker pull postgres:16
docker pull nats:2.10-alpine
docker pull prom/prometheus:latest
docker pull grafana/grafana:latest
```
Verify each with `docker inspect <image> | grep Architecture` → must show `arm64`.

### Task 0.3 — Create NVMe mount point for chunks
```bash
sudo mkdir -p /data/chunks
sudo chown $USER:$USER /data/chunks
df -h /data/chunks          # confirm it is on the NVMe device
```

### Task 0.4 — Create project skeleton
```bash
mkdir -p frameinput/{core,ingestion,frame_fetcher,infra}
touch frameinput/.env
```

### Task 0.5 — Write `.env` file
```env
POSTGRES_USER=daq
POSTGRES_PASSWORD=daq
POSTGRES_DB=daq
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

NATS_URL=nats://nats:4222

CHUNK_DIR=/data/chunks
CHUNK_MAX_BYTES=536870912      # 512 MB

PROMETHEUS_PORT=9100
FETCHER_PORT=8000

# Simulator config
SIM_FPS_5040=80
SIM_FPS_50C0=54
SIM_WIDTH_5040=1456
SIM_HEIGHT_5040=1088
SIM_WIDTH_50C0=1936
SIM_HEIGHT_50C0=1216
```

### Task 0.6 — Write base `requirements.txt` (shared)
```
asyncpg==0.29.0
nats-py==2.7.2
prometheus_client==0.20.0
fastapi==0.111.0
uvicorn[standard]==0.30.1
opencv-python-headless==4.10.0.84
numpy==1.26.4
aiofiles==23.2.1
```

**Exit criteria:** `docker compose up postgres` starts cleanly, `psql` connects.

---

## Phase 1 — Core Data Structures (Day 1 morning, ~3 hours)

Goal: `FramePacket` and binary chunk format are defined, unit-tested, importable by all services.

### Task 1.1 — Write `core/frame.py`

Fields added over the existing `FramePacket`:

| Field | Type | Description |
|---|---|---|
| `internal_frame_id` | `int` | Global monotonic ID across all cameras |
| `camera_frame_id` | `int` | GigE Vision Block ID (simulator: increments per camera) |
| `hw_timestamp_us` | `int` | Microseconds since epoch (simulator: `time.time_us()`) |
| `camera_id` | `int` | 0–7 |
| `width` | `int` | Pixel columns |
| `height` | `int` | Pixel rows |
| `pixel_format` | `str` | `"BayerRG8"` |
| `payload` | `bytes` | Raw BayerRG8 bytes, length = width × height |
| `is_dropped` | `bool` | Set True by ring buffer on overflow |

Remove: `trigger_id`, `meta`, `timestamp_ms` (replaced by `hw_timestamp_us`).

`FrameNumberer` becomes a global atomic counter (use `itertools.count()` wrapped in a lock) so all 8 camera threads share one monotonic sequence.

### Task 1.2 — Write `core/chunk_format.py`

Define two `struct` layouts using Python `struct` module:

**ChunkHeader** — 32 bytes, packed at start of each `.bin` file:
```python
import struct
CHUNK_MAGIC = b"DAQ\x00"
CHUNK_HEADER_FMT = "<4sIq16s"   # magic(4) chunk_id(4) created_at_us(8) reserved(16)
CHUNK_HEADER_SIZE = struct.calcsize(CHUNK_HEADER_FMT)  # = 32
```

**FrameHeader** — 64 bytes, packed before each frame's payload:
```python
FRAME_MAGIC = b"FRM\x00"
FRAME_HEADER_FMT = "<4sQQqBBHHII22s"
# magic(4) internal_frame_id(8) camera_frame_id(8) hw_timestamp_us(8)
# camera_id(1) pixel_format_id(1) width(2) height(2)
# payload_size(4) crc32(4) reserved(22)
FRAME_HEADER_SIZE = struct.calcsize(FRAME_HEADER_FMT)  # = 64
```

Pixel format enum:
```python
PIXEL_FORMAT = {"BayerRG8": 0, "Mono8": 1, "RGB8": 2}
PIXEL_FORMAT_INV = {v: k for k, v in PIXEL_FORMAT.items()}
```

Provide two functions:
- `pack_frame_header(pkt: FramePacket, crc: int) -> bytes`
- `unpack_frame_header(data: bytes) -> dict`

### Task 1.3 — Unit test `core/chunk_format.py`

File: `core/test_chunk_format.py`

Tests:
- Pack a dummy `FramePacket` → unpack → assert every field round-trips
- Assert `CHUNK_HEADER_SIZE == 32`
- Assert `FRAME_HEADER_SIZE == 64`
- Assert wrong magic raises `ValueError`

Run: `python -m pytest core/test_chunk_format.py -v`

**Exit criteria:** All 4 tests pass. Both struct sizes confirmed in stdout.

---

## Phase 2 — Camera Simulator (Day 1 afternoon, ~3 hours)

Goal: 8 threads generating realistic BayerRG8 frames at correct FPS, visible in terminal.

### Task 2.1 — Write `ingestion/simulator.py`

Class `IdsSimulatorSource`:

```python
class IdsSimulatorSource:
    def __init__(self, camera_id, width, height, fps, frame_numberer):
        ...

    def read(self) -> FramePacket:
        # pace to target FPS using time.perf_counter()
        # generate payload = bytes of length width*height
        # content: structured noise so each frame is visually distinct
        #   use numpy: base pattern + camera_id watermark + frame_number stripe
        # return FramePacket with all fields set
```

Payload generation (fast, no random — deterministic pattern):
```python
row = np.arange(width, dtype=np.uint8)
col = np.arange(height, dtype=np.uint8).reshape(-1, 1)
frame = ((row + col + frame_number) % 256).astype(np.uint8)
payload = frame.tobytes()
```

FPS pacing:
```python
interval = 1.0 / self.fps
next_tick = time.perf_counter() + interval
# ... generate frame ...
sleep_s = next_tick - time.perf_counter()
if sleep_s > 0:
    time.sleep(sleep_s)
```

### Task 2.2 — Write `ingestion/ring_buffer.py`

Adapt existing `BoundedFrameBuffer` directly. Only change:
- Accept `FramePacket` from `core/frame.py` (not `services/ingestion/frame.py`)
- Expose `fill_ratio` property: `len(self._dq) / self.capacity`

Capacity: `2048` frames (config-driven via `.env`).

### Task 2.3 — Write quick smoke test for simulator

File: `ingestion/test_simulator_smoke.py`

```python
def test_8_cameras_emit_correct_fps():
    # Start 8 IdsSimulatorSource threads for 2 seconds
    # Count frames received from each
    # Assert GV-5040CP cameras: received between 75 and 85 FPS (±5%)
    # Assert GV-50C0CP cameras: received between 51 and 57 FPS (±5%)
    # Assert total bytes generated > 800 MB
```

### Task 2.4 — Print live FPS to terminal

In `pipeline.py` add a `StatsThread` that every 1 second prints:
```
[DAQ] cam0: 80.1 fps  cam1: 79.9 fps  ... | buffer: 12/2048 | total: 43,200 frames | 963.2 MB/s
```

**Exit criteria:** Terminal shows all 8 cameras emitting at target FPS, combined ~963 MB/s, for 30 seconds without crashing.

---

## Phase 3 — Chunk Storage Writer (Day 2 morning, ~4 hours)

Goal: Frames flow from ring buffer → binary `.bin` files on NVMe with correct format.

### Task 3.1 — Write `ingestion/chunk_writer.py`

`ChunkWriter` runs in its own thread, consuming from `BoundedFrameBuffer`.

Internal state:
```python
self.current_chunk_id = 0
self.current_file = None        # open binary file handle
self.current_chunk_bytes = 0   # bytes written to current chunk
self.current_frame_count = 0   # frames in current chunk
self.chunk_max_bytes = 512 * 1024 * 1024
```

`open_chunk()`:
- Path: `{CHUNK_DIR}/chunk_{chunk_id:06d}.bin`
- Write 32-byte `ChunkHeader` immediately
- Reset `current_chunk_bytes = CHUNK_HEADER_SIZE`

`write_frame(pkt: FramePacket) -> int` (returns byte_offset of this frame):
```python
byte_offset = self.current_chunk_bytes
crc = zlib.crc32(pkt.payload) & 0xFFFFFFFF
header = pack_frame_header(pkt, crc)
self.current_file.write(header)
self.current_file.write(pkt.payload)
self.current_file.flush()           # O_DIRECT not needed for demo
self.current_chunk_bytes += FRAME_HEADER_SIZE + len(pkt.payload)
return byte_offset
```

`maybe_rotate()`:
- If `current_chunk_bytes >= CHUNK_MAX_BYTES`: close file, fire rotation callback, increment `chunk_id`, call `open_chunk()`

`run()` loop:
```python
while self.running:
    pkt = self.buffer.pop()
    if pkt is None:
        time.sleep(0.0001)   # 100 µs idle spin
        continue
    byte_offset = self.write_frame(pkt)
    self.on_frame_written(pkt, self.current_chunk_id, byte_offset)
    self.maybe_rotate()
```

Rotation callback signature: `on_chunk_closed(chunk_id, path, frame_count)` — called by metadata + NATS publisher.

### Task 3.2 — Unit test `chunk_writer.py`

File: `ingestion/test_chunk_writer.py`

Tests:
- Write 100 frames to a temp dir → open `.bin` → seek to each stored byte_offset → read + unpack header → assert `internal_frame_id` matches
- Assert CRC32 of read payload matches stored CRC
- Write 512 MB + 1 byte of frames → assert two chunk files created
- Assert `ChunkHeader.magic == b"DAQ\x00"` on both files

### Task 3.3 — Manual binary verification script

File: `ingestion/inspect_chunk.py`

```bash
python ingestion/inspect_chunk.py /data/chunks/chunk_000001.bin
```

Output:
```
Chunk 1 | created: 2026-07-20 14:23:01 | frames: 8,247
Frame 0  | internal_id=0       | cam=0 | 1456×1088 | offset=32      | crc=OK
Frame 1  | internal_id=1       | cam=4 | 1936×1216 | offset=1584672 | crc=OK
Frame 2  | internal_id=2       | cam=1 | 1456×1088 | offset=3921344 | crc=OK
...
```

**Exit criteria:** `inspect_chunk.py` runs on a real chunk, all CRCs show OK, frame count matches written count.

---

## Phase 4 — Metadata Service (Day 2 afternoon, ~3 hours)

Goal: Every written frame gets a PostgreSQL row with chunk + byte offset.

### Task 4.1 — Write `ingestion/metadata_service.py`

`MetadataService` wraps an `asyncpg` connection pool.

`init_db()`: Creates the `frames` table if not exists (run at startup).

```python
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS frames (
    internal_frame_id  BIGINT       PRIMARY KEY,
    camera_id          SMALLINT     NOT NULL,
    camera_frame_id    BIGINT       NOT NULL,
    hw_timestamp_us    BIGINT       NOT NULL,
    chunk_id           INT          NOT NULL,
    byte_offset        BIGINT       NOT NULL,
    payload_size       INT          NOT NULL,
    width              SMALLINT     NOT NULL,
    height             SMALLINT     NOT NULL,
    pixel_format       VARCHAR(16)  NOT NULL,
    ingested_at        TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_frames_camera_ts ON frames (camera_id, hw_timestamp_us);
CREATE INDEX IF NOT EXISTS idx_frames_chunk     ON frames (chunk_id, byte_offset);
"""
```

`enqueue(pkt, chunk_id, byte_offset)`: Adds a dict to an internal `asyncio.Queue`.

`_flush_loop()`: Async background coroutine. Accumulates 100 records OR 200 ms, whichever comes first → calls `conn.executemany(INSERT_SQL, records)` → resets batch.

INSERT SQL:
```sql
INSERT INTO frames
  (internal_frame_id, camera_id, camera_frame_id, hw_timestamp_us,
   chunk_id, byte_offset, payload_size, width, height, pixel_format)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
ON CONFLICT DO NOTHING
```

### Task 4.2 — Integration test for metadata

File: `ingestion/test_metadata_integration.py`

Requires running postgres container.

Test:
- Start `MetadataService`
- Enqueue 500 fake `FramePacket`s
- Wait 2 seconds
- `SELECT COUNT(*) FROM frames` → assert `== 500`
- `SELECT byte_offset FROM frames WHERE internal_frame_id = 42` → assert matches enqueued value

Run: `docker compose up postgres -d && python -m pytest ingestion/test_metadata_integration.py -v`

### Task 4.3 — Wire metadata into `ChunkWriter`

In `ChunkWriter.on_frame_written()`:
```python
asyncio.run_coroutine_threadsafe(
    self.metadata_service.enqueue(pkt, chunk_id, byte_offset),
    self.event_loop
)
```

The `MetadataService` runs its own asyncio event loop in a daemon thread.

**Exit criteria:** After 1 minute of ingestion, `SELECT COUNT(*) FROM frames` equals the terminal's total frame count exactly.

---

## Phase 5 — Frame Fetching Service (Day 3, ~4 hours)

Goal: `GET /frames/{id}` returns a valid PNG of the reconstructed colour frame.

### Task 5.1 — Write `frame_fetcher/metadata_client.py`

```python
async def get_frame_meta(internal_frame_id: int) -> dict | None:
    # SELECT chunk_id, byte_offset, payload_size, width, height, pixel_format
    # FROM frames WHERE internal_frame_id = $1
    # Returns dict or None if not found
```

Uses a module-level `asyncpg` pool (initialised on FastAPI startup).

### Task 5.2 — Write `frame_fetcher/chunk_reader.py`

```python
def read_frame_bytes(chunk_id: int, byte_offset: int, expected_size: int) -> bytes:
    path = f"{CHUNK_DIR}/chunk_{chunk_id:06d}.bin"
    with open(path, "rb") as f:
        f.seek(byte_offset)
        raw_header = f.read(FRAME_HEADER_SIZE)      # 64 bytes
        hdr = unpack_frame_header(raw_header)
        assert hdr["magic"] == FRAME_MAGIC, "corrupt chunk: bad magic"
        payload = f.read(hdr["payload_size"])
        actual_crc = zlib.crc32(payload) & 0xFFFFFFFF
        assert actual_crc == hdr["crc32"], f"CRC mismatch frame {hdr['internal_frame_id']}"
    return payload, hdr

def bayer_to_rgb(payload: bytes, width: int, height: int) -> np.ndarray:
    raw = np.frombuffer(payload, dtype=np.uint8).reshape(height, width)
    return cv2.cvtColor(raw, cv2.COLOR_BayerRG2RGB)

def encode_png(rgb: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", rgb)
    assert ok
    return buf.tobytes()
```

### Task 5.3 — Write `frame_fetcher/server.py`

```python
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
import asyncio

app = FastAPI(title="DAQ Frame Fetcher")

@app.get("/frames/{frame_id}")
async def get_frame(frame_id: int, resize: str | None = None):
    meta = await get_frame_meta(frame_id)
    if meta is None:
        raise HTTPException(404, f"frame {frame_id} not found")
    payload, hdr = await asyncio.to_thread(
        read_frame_bytes, meta["chunk_id"], meta["byte_offset"], meta["payload_size"]
    )
    rgb = await asyncio.to_thread(bayer_to_rgb, payload, meta["width"], meta["height"])
    if resize:
        w, h = map(int, resize.split("x"))
        rgb = cv2.resize(rgb, (w, h))
    png = await asyncio.to_thread(encode_png, rgb)
    return Response(content=png, media_type="image/png")

@app.get("/frames/{frame_id}/raw")
async def get_frame_raw(frame_id: int):
    meta = await get_frame_meta(frame_id)
    if meta is None:
        raise HTTPException(404)
    payload, _ = await asyncio.to_thread(
        read_frame_bytes, meta["chunk_id"], meta["byte_offset"], meta["payload_size"]
    )
    return Response(content=payload, media_type="application/octet-stream")

@app.get("/health")
async def health():
    return {"status": "ok"}
```

### Task 5.4 — End-to-end retrieval test

File: `frame_fetcher/test_retrieval_e2e.py`

Steps (scripted, not interactive):
1. Start a `ChunkWriter` in a thread, write exactly 1,000 frames to a temp dir
2. Insert all metadata into test postgres
3. Start `TestClient(app)` from FastAPI
4. `GET /frames/0` → assert HTTP 200, content-type `image/png`, PNG header `\x89PNG`
5. `GET /frames/500` → same assertions
6. `GET /frames/999` → same assertions
7. `GET /frames/1000` → assert HTTP 404

### Task 5.5 — Verify demosaic output is visually correct

Write `frame_fetcher/verify_visual.py`:
```bash
# Run ingestion for 5 seconds, then retrieve frame 100
python frame_fetcher/verify_visual.py --frame-id 100 --output /tmp/frame100.png
```
Opens the PNG. The image should show a colour gradient pattern (the simulator's watermarked pattern, demosaiced). Verify no green-only or single-channel artefacts.

**Exit criteria:** `curl http://localhost:8000/frames/100 --output test.png && file test.png` prints `PNG image data, 1456 x 1088`.

---

## Phase 6 — NATS + Prometheus + Grafana (Day 4, ~4 hours)

Goal: Chunk rotation fires NATS events; all metrics visible in Grafana.

### Task 6.1 — Write `ingestion/chunk_publisher.py`

```python
import nats, json

class ChunkPublisher:
    async def connect(self, url: str):
        self.nc = await nats.connect(url)

    async def publish_chunk_ready(self, chunk_id: int, path: str, frame_count: int):
        payload = json.dumps({
            "chunk_id": chunk_id,
            "path": path,
            "frame_count": frame_count,
            "timestamp_us": time.time_ns() // 1000
        }).encode()
        await self.nc.publish("chunk.ready", payload)
```

Wire into `ChunkWriter.on_chunk_closed()`:
```python
asyncio.run_coroutine_threadsafe(
    self.publisher.publish_chunk_ready(chunk_id, path, frame_count),
    self.event_loop
)
```

### Task 6.2 — Write `ingestion/metrics.py`

```python
from prometheus_client import Counter, Gauge, Histogram, start_http_server

frames_received   = Counter("daq_frames_received_total",   "Frames received", ["camera_id"])
frames_written    = Counter("daq_frames_written_total",    "Frames written to chunk")
frames_dropped    = Counter("daq_frames_dropped_total",    "Frames dropped by ring buffer")
buffer_fill       = Gauge  ("daq_buffer_fill_ratio",       "Ring buffer fill 0.0–1.0")
chunks_written    = Counter("daq_chunks_written_total",    "Completed chunk files")
bytes_written     = Counter("daq_bytes_written_total",     "Bytes written to NVMe")
metadata_inserts  = Counter("daq_metadata_inserts_total",  "PG rows inserted")
write_latency     = Histogram("daq_chunk_write_latency_seconds", "Per-frame write latency",
                              buckets=[.0001, .0005, .001, .005, .01, .05])
throughput_mbps   = Gauge  ("daq_throughput_mbps",         "Rolling 1-second MB/s")

def start_metrics_server(port: int = 9100):
    start_http_server(port)
```

Update `ChunkWriter.write_frame()` to call:
```python
t0 = time.perf_counter()
# ... write ...
write_latency.observe(time.perf_counter() - t0)
frames_written.inc()
bytes_written.inc(FRAME_HEADER_SIZE + len(pkt.payload))
```

Update ring buffer `push()` to call `frames_dropped.inc()` on drop.

### Task 6.3 — Write `infra/prometheus.yml`

```yaml
global:
  scrape_interval: 2s

scrape_configs:
  - job_name: daq_ingestion
    static_configs:
      - targets: ["ingestion:9100"]

  - job_name: daq_fetcher
    static_configs:
      - targets: ["frame_fetcher:9100"]
```

### Task 6.4 — Write `infra/grafana_dashboard.json`

8 panels:

| Panel | Type | Metric |
|---|---|---|
| Throughput (MB/s) | Time series | `daq_throughput_mbps` |
| Frames/sec per camera | Time series | `rate(daq_frames_received_total[5s])` |
| Ring buffer fill % | Gauge | `daq_buffer_fill_ratio * 100` |
| Dropped frames | Stat (big red) | `daq_frames_dropped_total` |
| Total frames written | Stat | `daq_frames_written_total` |
| Chunks completed | Stat | `daq_chunks_written_total` |
| Write latency p99 | Stat | `histogram_quantile(0.99, daq_chunk_write_latency_seconds)` |
| Metadata inserts/sec | Time series | `rate(daq_metadata_inserts_total[5s])` |

Set Grafana datasource to Prometheus at `http://prometheus:9090`.

### Task 6.5 — Verify NATS messages arrive

```bash
nats sub "chunk.ready" --server nats://localhost:4222
# should print JSON within ~0.5 seconds of a chunk rotation
```

**Exit criteria:** Grafana dashboard loads all 8 panels with live data. NATS sub receives `chunk.ready` messages.

---

## Phase 7 — Docker Compose + Full Stack (Day 5, ~3 hours)

Goal: `docker compose up` starts everything; no manual steps.

### Task 7.1 — Write `docker-compose.yml`

```yaml
version: "3.9"

x-common: &common
  restart: unless-stopped
  platform: linux/arm64

services:
  postgres:
    <<: *common
    image: postgres:16
    environment:
      POSTGRES_USER:     ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB:       ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "${POSTGRES_USER}"]
      interval: 3s
      retries: 10

  nats:
    <<: *common
    image: nats:2.10-alpine
    ports: ["4222:4222", "8222:8222"]

  prometheus:
    <<: *common
    image: prom/prometheus:latest
    volumes:
      - ./infra/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    ports: ["9090:9090"]

  grafana:
    <<: *common
    image: grafana/grafana:latest
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_AUTH_ANONYMOUS_ENABLED: "true"
    volumes:
      - ./infra/grafana_dashboard.json:/var/lib/grafana/dashboards/daq.json:ro
      - grafana_data:/var/lib/grafana
    ports: ["3000:3000"]
    depends_on: [prometheus]

  ingestion:
    <<: *common
    build:
      context: ./ingestion
      dockerfile: Dockerfile
    env_file: .env
    volumes:
      - /data/chunks:/data/chunks
    ports: ["9100:9100"]
    depends_on:
      postgres:
        condition: service_healthy
      nats:
        condition: service_started

  frame_fetcher:
    <<: *common
    build:
      context: ./frame_fetcher
      dockerfile: Dockerfile
    env_file: .env
    volumes:
      - /data/chunks:/data/chunks
    ports:
      - "8000:8000"
      - "9101:9100"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
  grafana_data:
```

### Task 7.2 — Write `ingestion/Dockerfile`

```dockerfile
FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Copy core/ from parent
COPY ../core /app/core
CMD ["python", "pipeline.py"]
```

### Task 7.3 — Write `frame_fetcher/Dockerfile`

```dockerfile
FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
COPY ../core /app/core
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Task 7.4 — Write `ingestion/pipeline.py`

Wires all components in one entry point:

```python
def main():
    # 1. Start metrics HTTP server (port 9100)
    # 2. Connect asyncpg pool + run init_db()
    # 3. Connect NATS publisher
    # 4. Create BoundedFrameBuffer(capacity=2048)
    # 5. Create MetadataService(pool)
    # 6. Create ChunkPublisher(nats)
    # 7. Create ChunkWriter(buffer, metadata_service, chunk_publisher, CHUNK_DIR)
    # 8. Start 8 IdsSimulatorSource threads
    #    - cams 0-3: GV-5040CP (1456×1088, 80 FPS, BayerRG8)
    #    - cams 4-7: GV-50C0CP (1936×1216, 54 FPS, BayerRG8)
    # 9. Start ChunkWriter thread
    # 10. Start StatsThread (prints FPS to terminal every 1s)
    # 11. Block on threading.Event (runs until SIGTERM)
```

### Task 7.5 — Smoke test the full compose stack

```bash
docker compose up -d
sleep 30
docker compose ps        # all 6 services: Up
curl http://localhost:8000/health          # {"status":"ok"}
curl http://localhost:9100/metrics         # Prometheus text format
curl http://localhost:3000                 # Grafana login page
```

**Exit criteria:** All 6 containers healthy, no restarts, metrics endpoint returns data.

---

## Phase 8 — Demo Run Script (Day 5 afternoon, ~2 hours)

Goal: One script that runs the demo, waits, then retrieves 3 frames and prints results.

### Task 8.1 — Write `demo_run.py`

```python
#!/usr/bin/env python3
"""
DAQ Demo Runner
Run: python demo_run.py
"""
import time, requests, subprocess, sys

FETCHER = "http://localhost:8000"
DEMO_DURATION_S = 120   # 2-minute ingestion session

def wait_for_service(url, timeout=60):
    for _ in range(timeout):
        try:
            if requests.get(f"{url}/health").status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(1)
    return False

def main():
    print("=== DAQ Demo ===")
    print("Starting docker compose stack...")
    subprocess.run(["docker", "compose", "up", "-d"], check=True)

    print("Waiting for services...")
    assert wait_for_service(FETCHER), "frame_fetcher did not start"
    print("Services ready.")

    print(f"Ingestion running for {DEMO_DURATION_S}s — watch Grafana at http://localhost:3000")
    time.sleep(DEMO_DURATION_S)

    # Retrieve specific frames
    for frame_id in [1, 500, 1000]:
        resp = requests.get(f"{FETCHER}/frames/{frame_id}")
        if resp.status_code == 200:
            out = f"/tmp/demo_frame_{frame_id}.png"
            with open(out, "wb") as f:
                f.write(resp.content)
            print(f"[OK] Frame {frame_id:6d} → {out}  ({len(resp.content):,} bytes)")
        else:
            print(f"[!!] Frame {frame_id} → HTTP {resp.status_code}")

    print("\n=== Demo complete ===")
    print("Open /tmp/demo_frame_*.png to inspect retrieved frames.")
    print("Grafana: http://localhost:3000  (user: admin  pass: admin)")

if __name__ == "__main__":
    main()
```

### Task 8.2 — Final checklist before demo

Run this checklist in order before showing to anyone:

```
[ ] docker compose up → all 6 containers Up, no restarts
[ ] Terminal shows: ~963 MB/s, 0 dropped frames for 30 seconds
[ ] Grafana: all 8 panels populated, throughput curve visible
[ ] curl /frames/1    → HTTP 200, PNG, size > 500 KB
[ ] curl /frames/500  → HTTP 200, PNG, valid image
[ ] curl /frames/9999 → HTTP 200 (if ingested) or 404 (expected if not yet written)
[ ] nats sub chunk.ready → JSON messages arriving ~every 0.5s
[ ] SELECT COUNT(*) FROM frames; → matches daq_frames_written_total metric
[ ] docker compose down && docker compose up → everything recovers cleanly
```

**Exit criteria:** All 9 checklist items pass.

---

## Phase 9 — Real Camera Swap (Future, ~1 day when camera arrives)

This phase requires no architectural changes. Only `simulator.py` is replaced.

### Task 9.1 — Install IDS Peak SDK on DGX Spark

```bash
# Download IDS Peak for ARM64 Linux from IDS website
sudo dpkg -i ids-peak_*.deb
# Verify: ids_devicemanager   (should detect cameras on 10GbE NIC)
```

### Task 9.2 — Write `ingestion/ids_peak_source.py`

```python
from ids_peak import ids_peak
from ids_peak_ipl import ids_peak_ipl   # image processing library

class IdsPeakSource:
    def __init__(self, camera_id: int, device_index: int, frame_numberer):
        # Open device by index
        # Configure AcquisitionFrameRate, ExposureTime, PixelFormat=BayerRG8
        # Start acquisition

    def read(self) -> FramePacket:
        # ids_peak buffer → extract payload bytes + BlockID + Timestamp
        # Return FramePacket with camera_frame_id = BlockID, hw_timestamp_us from camera
```

### Task 9.3 — Swap in `pipeline.py`

```python
# Change this one line per camera:
source = IdsSimulatorSource(camera_id=i, ...)
# to:
source = IdsPeakSource(camera_id=i, device_index=i, ...)
```

Everything downstream (ring buffer, chunk writer, metadata, retrieval) is unchanged.

---

## Summary Table

| Phase | What it delivers | When | Demo-critical? |
|---|---|---|---|
| 0 — Bootstrap | DGX ready, Docker running, NVMe mounted | Day 0 | Yes |
| 1 — Core structs | `FramePacket` + binary format, unit-tested | Day 1 AM | Yes |
| 2 — Simulator | 8 cameras emitting frames at ~963 MB/s | Day 1 PM | Yes |
| 3 — Chunk writer | Frames on disk as `.bin`, CRC validated | Day 2 AM | Yes |
| 4 — Metadata | Every frame indexed in PostgreSQL | Day 2 PM | Yes |
| 5 — Frame fetcher | `GET /frames/{id}` returns PNG | Day 3 | Yes |
| 6 — NATS + metrics | Grafana live dashboard, chunk events | Day 4 | Yes |
| 7 — Docker Compose | One command starts full stack | Day 5 AM | Yes |
| 8 — Demo script | `python demo_run.py` runs end-to-end | Day 5 PM | Yes |
| 9 — Real camera | Swap simulator for IDS Peak SDK | After camera arrives | No (future) |

**Minimum viable demo (fastest path):** Phases 0 → 2 → 3 → 5 → 7 → 8 (skip NATS + Grafana for first pass). This gives ingestion + retrieval proof in ~3 days.
