# DAQ Pipeline — Full Project Context

> **Purpose of this file:** Hand off to a new Claude Code session for debugging.  
> Read this entirely before touching any code.

---

## What This System Is

A **Railway Inspection Data Acquisition (DAQ) pipeline** that simulates 8 GigE Vision industrial cameras, writes their raw frames to NVMe storage as binary chunk files, indexes every frame in PostgreSQL for O(1) retrieval, publishes chunk-ready events over NATS, and exposes a REST API to retrieve any frame as a demosaiced PNG.

**Target hardware:** NVIDIA DGX Spark (ARM64, 128 GB unified RAM, 1 TB NVMe).  
**Deployed user:** `omronix@edgexpert-d8f3` (no sudo access — Docker works without it).  
**Remote access:** Via Tailscale. No public ports. SSH tunnel required to see web UIs.  
**Repo on DGX:** `~/MVIS_Software/test/MVIS/` (cloned from `https://github.com/RohitHuge/MVIS.git`).

---

## Architecture — Data Flow

```
8 Simulator Cameras (threads)
  cam0–3: GV-5040CP  1456×1088  ~98.5 FPS  (BayerRG8)
  cam4–7: GV-50C0CP  1936×1216  ~66.5 FPS  (BayerRG8)
          │
          │  FramePacket (raw bytes in memory)
          ▼
  BoundedFrameBuffer  (ring buffer, 2048 frames, drop-oldest on overflow)
          │
          ▼
  ChunkWriter  (single consumer thread)
  ├── Writes binary .bin files to NVMe (512 MB per chunk, rotates automatically)
  ├── Calls on_frame_written callback → MetadataService
  └── Calls on_chunk_closed callback → ChunkPublisher
          │                                    │
          ▼                                    ▼
  MetadataService                      ChunkPublisher
  (asyncpg → PostgreSQL)               (NATS "chunk.ready" subject)
  Batch INSERT 100 rows / 200 ms

  PostgreSQL: frames table
  (internal_frame_id → chunk_id + byte_offset + width + height + timestamp)

                                   ┌──────────────────────┐
  Client request ─────────────────▶│  Frame Fetcher API   │
  GET /frames/{id}?format=png      │  (FastAPI, port 8000) │
                                   │  1. Query PostgreSQL  │
                                   │  2. Seek .bin file    │
                                   │  3. BayerRG8 → RGB    │
                                   │  4. Return PNG/JPEG   │
                                   └──────────────────────┘
```

**Throughput at 10 GbE target:** ~1,250 MB/s, 0 dropped frames, buffer fill <1%.

---

## File Structure

```
frameinput/
├── core/
│   ├── frame.py            ← FramePacket dataclass + GlobalFrameNumberer
│   └── chunk_format.py     ← Binary .bin file format (ChunkHeader + FrameHeader)
│
├── ingestion/
│   ├── pipeline.py         ← MAIN ENTRY POINT — wires all components, starts everything
│   ├── simulator.py        ← IdsSimulatorSource (fake camera) + CameraRig (all 8 cameras)
│   ├── ring_buffer.py      ← BoundedFrameBuffer (drop-oldest ring buffer)
│   ├── chunk_writer.py     ← ChunkWriter (writes .bin files, rotates at 512 MB)
│   ├── metadata_service.py ← MetadataService (asyncpg batch INSERT to PostgreSQL)
│   ├── chunk_publisher.py  ← ChunkPublisher (NATS "chunk.ready" events)
│   ├── metrics.py          ← Prometheus counters/gauges + ThroughputTracker
│   ├── stats.py            ← StatsThread (prints live DAQ stats to terminal every 1s)
│   └── Dockerfile
│
├── frame_fetcher/
│   ├── server.py           ← FastAPI: GET /frames/{id}, /stats, /health, /metrics
│   ├── chunk_reader.py     ← Read binary .bin, BayerRG8→RGB demosaic (OpenCV)
│   ├── metadata_client.py  ← asyncpg queries (get_frame_meta, total_frame_count)
│   └── Dockerfile
│
├── dashboard/
│   ├── server.py           ← FastAPI + embedded HTML dashboard (port 5000)
│   └── Dockerfile
│
├── infra/
│   ├── prometheus.yml      ← Scrape config (ingestion:9100, frame_fetcher:9100)
│   ├── grafana/
│   │   └── provisioning/   ← Auto-provision Prometheus datasource + dashboard
│   └── grafana_dashboard.json
│
├── docker-compose.yml      ← All 7 services wired together
├── .env                    ← NOT committed — created on DGX manually
├── .env.example            ← Template — commit this, copy to .env on each machine
└── demo_run.py             ← End-to-end smoke test script (run on laptop, not in Docker)
```

---

## The Binary Chunk Format (.bin files)

Every `.bin` file written to NVMe has this structure:

```
ChunkHeader (32 bytes)
  magic:      b"DAQCHUNK"
  version:    uint32 = 1
  chunk_id:   uint64
  created_at: uint64 (microseconds epoch)
  reserved:   8 bytes

[ repeated for each frame: ]
FrameHeader (64 bytes)
  magic:             b"DAQFRAME"
  internal_frame_id: uint64
  camera_id:         uint32
  camera_frame_id:   uint64
  hw_timestamp_us:   uint64
  width:             uint32
  height:            uint32
  pixel_format:      16 bytes (null-padded string)
  payload_bytes:     uint32
  crc32:             uint32
  reserved:          4 bytes
Payload (width × height bytes for BayerRG8)
```

**O(1) retrieval:** PostgreSQL stores `byte_offset` per frame → seek directly into the file, no scan.

---

## Docker Services (7 total)

| Service | Image | Port(s) | Role |
|---|---|---|---|
| `postgres` | postgres:16 | 5432 | Frame index (chunk_id + byte_offset per frame) |
| `nats` | nats:2.10-alpine | 4222, 8222 | Chunk-ready event bus |
| `prometheus` | prom/prometheus | 9090 | Scrapes metrics from ingestion + frame_fetcher |
| `grafana` | grafana/grafana | 3000 | Dashboard panels (auto-provisioned) |
| `ingestion` | mvis-ingestion | 9100 | Pipeline — cameras → buffer → writer → postgres |
| `frame_fetcher` | mvis-frame_fetcher | 8000, 9101 | REST API for frame retrieval |
| `dashboard` | mvis-dashboard | 5000 | Custom control dashboard (start/stop/metrics) |

**Startup order:**
1. postgres → (health check passes)
2. nats → (started)
3. ingestion starts (depends on postgres healthy + nats started)
4. frame_fetcher starts (depends on postgres healthy)
5. prometheus starts (depends on ingestion + frame_fetcher)
6. grafana starts (depends on prometheus)
7. dashboard starts (depends on prometheus)

**Key:** `ingestion` has `restart: on-failure` (not `unless-stopped`) so it does NOT auto-restart when it exits cleanly (e.g. after `DEMO_DURATION_S` timer fires).

---

## Environment Variables (.env)

```env
# PostgreSQL
POSTGRES_USER=daq
POSTGRES_PASSWORD=daq
POSTGRES_DB=daq
POSTGRES_DSN=postgresql://daq:daq@postgres:5432/daq

# NATS
NATS_URL=nats://nats:4222

# Storage — CRITICAL
HOST_CHUNK_DIR=/home/omronix/chunks   # folder on the DGX HOST machine
CHUNK_DIR=/data/chunks                # path INSIDE every container (bind-mounted)
CHUNK_MAX_BYTES=536870912             # 512 MB per .bin file

# Ports
METRICS_PORT=9100
FETCHER_PORT=8000
DASHBOARD_PORT=5000

# Ring buffer
RING_CAPACITY=2048

# Bandwidth target (scales camera FPS)
# 1 GbE = 125 MB/s | 10 GbE = 1,250 MB/s | 25 GbE = 3,125 MB/s
BANDWIDTH_GBE=10

# Auto-stop guards
DEMO_DURATION_S=120       # stop after 2 minutes (0 = run forever)
MIN_FREE_DISK_GB=50       # stop if free disk drops below 50 GB
```

The `.env` file lives at `~/MVIS_Software/test/MVIS/.env` on the DGX. It is gitignored — never committed.

---

## Key Component: Bandwidth Scaling

`BANDWIDTH_GBE` controls how fast the simulator runs. The formula:

```
base_throughput = sum(width × height × fps × count) for all camera specs
                ≈ 1015.8 MB/s  (at default FPS values)

fps_scale = (BANDWIDTH_GBE × 125 MB/s) / base_throughput
scaled_fps_per_camera = base_fps × fps_scale
```

At `BANDWIDTH_GBE=10`: cameras run at ~98.5 FPS (type A) and ~66.5 FPS (type B) → ~1,250 MB/s.  
At `BANDWIDTH_GBE=25`: cameras run at ~246 FPS and ~166 FPS → ~3,125 MB/s.

The dashboard can change this at runtime:
1. Writes new value to `CHUNK_DIR/.daq_bandwidth_gbe` (shared volume)
2. Restarts the ingestion container via Docker socket API
3. Pipeline reads the file at startup and applies the new FPS scale

---

## Key Component: Auto-Stop Guards

Pipeline (`ingestion/pipeline.py`) has a watchdog thread checking every 5 seconds:

1. **`DEMO_DURATION_S`** — if > 0, stops after N seconds of running
2. **`MIN_FREE_DISK_GB`** — stops if free space on `CHUNK_DIR` drops below threshold

On stop: cameras halt → chunk writer drains remaining buffer → metadata flushed to PostgreSQL → clean exit (code 0). Because `restart: on-failure`, Docker does NOT restart on clean exit.

---

## Key Component: Dashboard (PORT 5000)

**File:** `dashboard/server.py` — FastAPI backend + full HTML/JS embedded as a Python string.

**API endpoints:**
```
GET  /                      → serves the HTML dashboard page
GET  /health                → liveness probe
GET  /api/status            → container status + prometheus metrics + disk stats
GET  /api/bandwidth         → current BANDWIDTH_GBE setting
POST /api/bandwidth         → change bandwidth + restart ingestion
GET  /api/logs?lines=25     → last N lines from ingestion container logs
POST /api/ingestion/start   → docker start the ingestion container
POST /api/ingestion/stop    → docker stop the ingestion container (graceful, 30s timeout)
DELETE /api/chunks          → delete all .bin files from CHUNK_DIR
```

**Docker socket:** The dashboard mounts `/var/run/docker.sock` to control sibling containers. It finds the ingestion container by label: `com.docker.compose.service=ingestion`.

**Prometheus queries** (proxied from `http://prometheus:9090`):
- `daq_throughput_mbps` → live MB/s gauge
- `sum(daq_frames_written_total)` → total frames written to disk
- `sum(daq_bytes_written_total)` → total bytes written
- `sum(daq_frames_dropped_total)` → dropped frame count
- `sum(daq_chunks_written_total)` → .bin files closed
- `daq_buffer_fill_ratio` → ring buffer utilization (0.0–1.0)

**Dashboard features:**
- Live metrics grid (updates every 2s)
- GbE equivalent display (MB/s ÷ 125)
- Bandwidth target selector: 1 / 5 / 10 / 15 / 25 GbE buttons
- Disk usage bar with .bin file count and size
- Start / Stop ingestion buttons
- Delete All Chunks with confirm modal
- Live log tail from ingestion container (updates every 5s)

---

## Frame Fetcher API (PORT 8000)

```
GET /health                          → {"status":"ok","postgres":true}
GET /stats                           → {"total_frames_indexed": 45000, ...}
GET /frames/{id}?format=png          → PNG image (demosaiced BayerRG8 → RGB)
GET /frames/{id}?format=jpeg         → JPEG image
GET /frames/{id}?format=png&resize=640x480  → resized PNG
GET /frames/{id}/raw                 → raw BayerRG8 bytes (application/octet-stream)
GET /docs                            → Swagger UI
GET /metrics                         → Prometheus scrape endpoint
```

**Retrieval path:**
1. Query PostgreSQL: `SELECT chunk_id, byte_offset, width, height FROM frames WHERE internal_frame_id = ?`
2. Open `CHUNK_DIR/chunk_{chunk_id:06d}.bin`
3. Seek to `byte_offset`, read FrameHeader + payload
4. Validate CRC32
5. `cv2.cvtColor(payload, cv2.COLOR_BayerRG2RGB)` → demosaic
6. Encode PNG/JPEG and return

---

## Access URLs (all require SSH tunnel from laptop)

```bash
# Open ONE terminal on your laptop and run this — keeps the tunnel alive:
ssh -L 5000:localhost:5000 \
    -L 3000:localhost:3000 \
    -L 8000:localhost:8000 \
    -L 9090:localhost:9090 \
    omronix@edgexpert-d8f3 -N
```

Then in browser:

| URL | What you see |
|---|---|
| `http://localhost:5000` | **Custom control dashboard** (start/stop/metrics/delete) |
| `http://localhost:3000` | Grafana (admin / admin) — graph panels |
| `http://localhost:8000/docs` | Frame Fetcher Swagger UI |
| `http://localhost:8000/frames/1?format=png` | Retrieve frame #1 as PNG |
| `http://localhost:9090` | Prometheus raw query UI |
| `http://localhost:9090/api/v1/query?query=daq_throughput_mbps` | Raw metric value |

---

## What Is Working (confirmed in logs)

- **All 7 containers start correctly** and reach healthy state
- **Ingestion pipeline runs** at exactly 10 GbE target = ~1,250 MB/s
- **0 dropped frames** — ring buffer never fills (buf: 0–6 / 2048)
- **Chunk files created** every ~1 second (chunk_000000.bin, chunk_000001.bin, ...)
- **PostgreSQL metadata indexed** — MetadataService batch-inserts frame metadata
- **NATS chunk.ready events** published for each closed chunk
- **Frame Fetcher** starts successfully (Uvicorn running on port 8000)
- **Grafana** starts and is accessible
- **Dashboard HTML page** loads (returns 200 OK)
- **Auto-stop guards** implemented (DEMO_DURATION_S + MIN_FREE_DISK_GB watchdog)
- **Bandwidth scaling** works (BANDWIDTH_GBE env var scales camera FPS)

---

## What Is NOT Working — The Bug To Debug

### Problem: Dashboard `/api/status` not returning live data

**Symptom:** The dashboard HTML page loads at `http://localhost:5000` but the metrics cards show "—" and the status shows "CONNECTING" or "connection error". The controls (Start/Stop/Delete) may also not work.

**What we know:**
- Dashboard container IS running (confirmed `200 OK` for `GET /`)
- No `/api/status` or `/api/logs` requests visible in `docker logs mvis-dashboard-1`
  - This is suspicious — suggests fetch() calls may not be reaching the server OR are erroring silently on the JS side

**Likely root causes (check in this order):**

#### 1. No SSH tunnel set up
The most likely cause. The dashboard runs on the DGX at port 5000. Without a tunnel, `http://localhost:5000` on the laptop connects to the laptop's own port 5000 (nothing there), not the DGX.

**Test:** From the DGX terminal directly:
```bash
curl -s http://localhost:5000/api/status
```
If this returns JSON, the server works and the issue is purely the missing SSH tunnel.

#### 2. Docker socket permission denied
The dashboard container tries to access `/var/run/docker.sock` to find/control the ingestion container. If the socket is not accessible, `/api/status` returns `"container_status": "error"` but the page still loads.

**Test:**
```bash
docker exec mvis-dashboard-1 python3 -c "
import docker
c = docker.from_env()
print([x.name + ' = ' + x.status for x in c.containers.list(all=True)])
"
```
If this throws `Permission denied`, the socket has wrong permissions.

**Fix:** Add the socket group to the dashboard container or run with `--user root`. Or check socket permissions:
```bash
ls -la /var/run/docker.sock
# Expected: srw-rw---- 1 root docker
```
If the dashboard container user isn't in the `docker` group, add to docker-compose.yml:
```yaml
dashboard:
  user: root
```
Or:
```yaml
dashboard:
  group_add:
    - docker
```

#### 3. Prometheus not scraping yet / metrics return null
At startup, Prometheus needs ~15s before it scrapes ingestion metrics. During this window, all metric values are `null` and the dashboard shows "—". This is expected and resolves on its own.

**Test:**
```bash
curl -s "http://localhost:9090/api/v1/query?query=daq_throughput_mbps" | python3 -m json.tool
```
Look for non-empty `result` array.

#### 4. CHUNK_DIR doesn't exist in dashboard container
The dashboard tries `shutil.disk_usage("/data/chunks")`. If the bind mount failed, this errors and the disk section shows nothing.

**Test:**
```bash
docker exec mvis-dashboard-1 ls /data/chunks
```
Should show `.bin` files and possibly `.daq_bandwidth_gbe`.

#### 5. `ingestion` container not found by label
The dashboard looks for a container with label `com.docker.compose.service=ingestion`. If the compose project name doesn't match what's expected, it finds nothing.

**Test:**
```bash
docker inspect mvis-ingestion-1 | python3 -m json.tool | grep "com.docker.compose"
```
Should show:
```json
"com.docker.compose.service": "ingestion",
"com.docker.compose.project": "mvis"
```
Our filter only uses `service=ingestion` (not project), so this should work regardless of project name.

---

## Quick Diagnostic Sequence

Run these from the DGX terminal in order:

```bash
# 1. Is the API responding at all?
curl -s http://localhost:5000/api/status | python3 -m json.tool

# 2. Can dashboard reach Docker?
docker exec mvis-dashboard-1 python3 -c "import docker; c=docker.from_env(); print('OK:', [x.name for x in c.containers.list()])"

# 3. Can dashboard reach Prometheus?
docker exec mvis-dashboard-1 curl -s "http://prometheus:9090/api/v1/query?query=up"

# 4. Does the chunk dir exist in dashboard container?
docker exec mvis-dashboard-1 ls -la /data/chunks | head -5

# 5. Full dashboard logs
docker logs mvis-dashboard-1 --tail 50

# 6. Full dashboard logs including stderr
docker logs mvis-dashboard-1 --tail 50 2>&1
```

---

## Commands Reference

### On DGX — daily use
```bash
cd ~/MVIS_Software/test/MVIS

# Start everything
docker compose up -d

# Watch live logs
docker compose logs -f

# Watch only ingestion
docker compose logs -f ingestion

# Watch only dashboard
docker compose logs -f dashboard

# Stop everything
docker compose down

# Full clean restart (keeps .env and chunk files)
docker compose down && docker compose build --no-cache && docker compose up -d

# Nuclear option (deletes all data)
docker compose down -v && rm -f ~/chunks/*.bin && docker compose build --no-cache && docker compose up -d

# Check disk usage
du -sh ~/chunks/
df -h ~/chunks/

# Delete chunk files manually
rm ~/chunks/*.bin
```

### On Laptop — SSH tunnel
```bash
# Open tunnel (keep this terminal open while using browser)
ssh -L 5000:localhost:5000 -L 3000:localhost:3000 -L 8000:localhost:8000 -L 9090:localhost:9090 omronix@edgexpert-d8f3 -N
```

---

## Git Repos

| Repo | URL | Branch | What's in it |
|---|---|---|---|
| Main | `https://github.com/ygstudio-game/VandeBharat.git` | `dev30` | Full repo including `frameinput/` subdirectory |
| MVIS | `https://github.com/RohitHuge/MVIS.git` | `main` | Just the `frameinput/` contents (git subtree push) |

The DGX clones from the MVIS repo (`git clone https://github.com/RohitHuge/MVIS.git`).

To push changes from the main repo to both:
```bash
git push origin dev30                            # main repo
git subtree push --prefix=frameinput mvis main   # MVIS repo (run from repo root)
```

---

## Prometheus Metrics Reference

All metric names as stored in the Prometheus registry (prometheus-client 0.20+ appends `_total` in text output for counters):

| Metric | Type | Labels | What it measures |
|---|---|---|---|
| `daq_frames_received_total` | Counter | `camera_id` | Frames pushed by each camera |
| `daq_frames_written_total` | Counter | — | Frames successfully written to .bin |
| `daq_frames_dropped_total` | Counter | — | Frames dropped due to ring buffer overflow |
| `daq_chunks_written_total` | Counter | — | .bin chunk files closed/rotated |
| `daq_bytes_written_total` | Counter | — | Raw bytes written to NVMe |
| `daq_metadata_inserts_total` | Counter | — | PostgreSQL rows inserted |
| `daq_throughput_mbps` | Gauge | — | EMA-smoothed write throughput in MB/s |
| `daq_buffer_fill_ratio` | Gauge | — | Ring buffer utilization (0.0 = empty, 1.0 = full) |
| `daq_chunk_write_latency_seconds` | Histogram | — | Time to write one chunk |
| `daq_frame_retrieval_latency_seconds` | Histogram | — | Frame Fetcher API response time |

---

## demo_run.py — What It Is

`demo_run.py` is a **smoke test script** run on the laptop (not inside Docker). It:
1. Optionally runs `docker compose up -d --build`
2. Polls `http://localhost:8000/health` until frame_fetcher is ready
3. Waits N seconds while ingestion runs and indexes frames
4. Calls `GET /frames/{id}?format=png` for frame #1, a middle frame, and a late frame
5. Saves each as a PNG to `/tmp/daq_demo_frame_*.png`
6. Prints pass/fail report

It does **not** control the pipeline — it only observes and validates end-to-end retrieval.

Usage (requires SSH tunnel to be active):
```bash
python demo_run.py --no-start --duration 60
```

---

## Notes for the Debugging Session

1. **The pipeline itself is confirmed working.** The ingestion logs show clean operation at 1,250 MB/s. Focus on the dashboard connectivity issue only.

2. **`docker logs mvis-dashboard-1 2>&1`** is your first tool. Look for Python tracebacks, `Permission denied`, or `Connection refused` errors.

3. **`curl http://localhost:5000/api/status`** from the DGX terminal is the fastest test. If it returns valid JSON with container/metrics/disk data, the backend is fine and the issue is the SSH tunnel.

4. **If Docker socket is the issue**, the simplest fix is adding `user: root` to the dashboard service in `docker-compose.yml` (the Python base image defaults to root anyway, but compose may override this).

5. **The `.daq_bandwidth_gbe` config file** lives inside `~/chunks/` on the DGX. If you delete `~/chunks/*.bin`, this file gets deleted too — that's fine, the pipeline falls back to the `BANDWIDTH_GBE` env var (default 10).

6. **Never edit `.env` in the repo** — it's gitignored but present on the DGX. Changes there take effect on next `docker compose up`.
