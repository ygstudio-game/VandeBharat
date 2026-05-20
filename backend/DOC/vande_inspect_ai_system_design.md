# Vande Inspect AI — Complete System Design
### Backend Architecture · Storage Strategy · Service Map · Firmware · Deployment

---

## 0. How to Read This Document

This document covers every layer of the platform:

1. **Service map** — what services exist and why
2. **Data flow** — exactly how data moves from camera to report
3. **PostgreSQL schema** — all tables, relationships, rationale for what goes in Postgres vs object storage
4. **Storage strategy** — hot/warm/cold tiers, estimated volumes, retention policy
5. **Edge firmware** — what the on-site PC does and how it is built
6. **GPU worker design** — rented cloud GPU, model hosting, job dispatch
7. **Deployment topology** — which VPS hosts what, how they talk

---

## 1. Full Pipeline Flow (Refined)

```
Camera Trigger (hardware sync)
        ↓
Edge Machine (on-site PC)
  - Frame extraction from camera SDK
  - JPEG encoding
  - Local metadata DB (SQLite)
  - Upload frames + metadata → Object Storage
        ↓
Object Storage (MinIO / S3-compatible)
  - Raw frames bucket
  - Raw video bucket
  - Reports bucket
        ↓
Backend Orchestrator (VPS)
  - Ingestion API receives upload webhooks
  - Writes session/frame metadata → PostgreSQL
  - Publishes jobs → Message Queue (RabbitMQ)
        ↓
OCR Worker (GPU — rented)
  - Pulls from ocr_queue
  - PaddleOCR on side-camera frames
  - Returns coach/bogie mapping → API
        ↓
Synchronization Engine (CPU — Backend VPS)
  - Consumes OCR results + timestamps
  - Gap detection → assigns frames to coaches
  - Updates coach_frame_map in PostgreSQL
        ↓
Detection Worker (GPU — rented)
  - Pulls from detection_queue (batched per coach)
  - YOLOv8 component detection
  - Defect classification
  - Returns bounding boxes + confidence → API
        ↓
Correlation Engine (CPU — Backend VPS)
  - Builds expected vs detected component manifest
  - Flags missing components
  - Assigns severity scores
        ↓
Report Generator (CPU — Backend VPS)
  - Assembles train-level PDF + JSON report
  - Stores in Object Storage (reports bucket)
  - Updates report_ready status in PostgreSQL
        ↓
Frontend (Next.js VPS)
  - Operator views dashboard, workspace, report
  - WebSocket receives live pipeline status updates
```

---

## 2. Services Required

### 2.1 Edge Services (On-Site PC firmware)

| Service | Language | Role |
|---|---|---|
| `camera-driver` | Python / C++ | GigE/CoaXPress SDK wrapper, hardware trigger listener |
| `frame-extractor` | Python | Decode video stream → JPEG frames, attach metadata |
| `local-db` | SQLite | Buffer frame metadata before upload |
| `uploader` | Python | Upload frames + metadata to object storage, retry logic |
| `health-beacon` | Python | Heartbeat to Backend VPS every 30s |

### 2.2 Backend VPS Services

| Service | Language | Role |
|---|---|---|
| `api-server` | Node.js (Fastify) | REST + WebSocket API for frontend and edge |
| `session-manager` | Node.js | Creates/manages train inspection sessions |
| `queue-publisher` | Node.js | Publishes jobs to RabbitMQ |
| `sync-engine` | Python | OCR result consumer, gap detection, coach mapping |
| `correlation-engine` | Python | Component manifest validation, missing detection |
| `report-generator` | Python | PDF + JSON assembly, stores to object storage |
| `websocket-gateway` | Node.js | Pushes live pipeline status to frontend |
| `storage-proxy` | Node.js | Signed URL generation for frontend frame access |

### 2.3 GPU Worker Services (Rented Cloud GPU — separate VPS)

| Service | Language | Role |
|---|---|---|
| `ocr-worker` | Python | Consumes ocr_queue, runs PaddleOCR, returns results |
| `detection-worker` | Python | Consumes detection_queue, runs YOLOv8, returns results |
| `model-manager` | Python | Loads/hot-swaps models, watches for new best.pt |
| `gpu-health-reporter` | Python | Reports GPU utilization, VRAM, queue depth to Backend VPS |

### 2.4 Infrastructure Services (co-located on Backend VPS)

| Service | Role |
|---|---|
| PostgreSQL 16 | Relational metadata (sessions, frames, coaches, defects, components) |
| RabbitMQ | Message queue — ocr_queue, detection_queue, report_queue |
| Redis | Session cache, WebSocket state, rate limiting |
| MinIO | S3-compatible object storage — frames, videos, reports |
| Nginx | Reverse proxy for API and frontend |
| Prometheus + Grafana | GPU + system metrics |

---

## 3. PostgreSQL Schema

All structured, relational, audit-critical data lives in Postgres.
Unstructured blobs (frame images, video files, PDF reports) live in object storage — only their URLs are stored in Postgres.

### 3.1 Core Tables

```sql
-- A physical inspection event. One per train pass.
CREATE TABLE inspection_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  train_number    VARCHAR(50) NOT NULL,
  station_code    VARCHAR(20) NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ,
  status          VARCHAR(30) NOT NULL DEFAULT 'queued',
  -- queued | extracting | ocr_running | synchronizing
  -- analysing | correlating | review_ready | completed | failed
  total_coaches   INT,
  total_frames    INT,
  critical_defects INT DEFAULT 0,
  health_score    NUMERIC(5,2),       -- 0–100 overall
  camera_setup_id UUID REFERENCES camera_setups(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- One per physical camera at a station
CREATE TABLE cameras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_setup_id UUID REFERENCES camera_setups(id),
  camera_code     VARCHAR(20) NOT NULL,   -- e.g. CAM_OCR_LEFT
  camera_type     VARCHAR(30) NOT NULL,   -- ocr | component_left | component_right | bottom | wheel
  position_label  VARCHAR(50),
  is_active       BOOLEAN DEFAULT true
);

-- Groups cameras belonging to one monitoring station
CREATE TABLE camera_setups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_name    VARCHAR(100),
  station_code    VARCHAR(20) UNIQUE,
  installed_at    TIMESTAMPTZ,
  edge_machine_id UUID REFERENCES edge_machines(id)
);

CREATE TABLE edge_machines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname        VARCHAR(100),
  ip_address      VARCHAR(45),
  last_heartbeat  TIMESTAMPTZ,
  firmware_version VARCHAR(20),
  status          VARCHAR(20) DEFAULT 'online'  -- online | offline | error
);

-- One per extracted frame — the core evidence unit
CREATE TABLE frames (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES inspection_sessions(id),
  camera_id       UUID NOT NULL REFERENCES cameras(id),
  sequence_number INT NOT NULL,
  captured_at     TIMESTAMPTZ NOT NULL,   -- hardware trigger timestamp
  storage_path    TEXT NOT NULL,          -- s3://bucket/session/cam/frame_001.jpg
  thumbnail_path  TEXT,                   -- smaller version for UI
  width_px        INT,
  height_px       INT,
  file_size_bytes INT,
  is_ocr_candidate BOOLEAN DEFAULT false,
  is_defect_flagged BOOLEAN DEFAULT false,
  coach_id        UUID REFERENCES coaches(id),  -- NULL until sync stage
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Created by synchronization engine after OCR + gap detection
CREATE TABLE coaches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES inspection_sessions(id),
  coach_number    VARCHAR(30) NOT NULL,   -- from OCR, e.g. "B2"
  coach_index     INT,                    -- physical order in train
  ocr_confidence  NUMERIC(4,3),           -- 0.000–1.000
  ocr_frame_id    UUID REFERENCES frames(id),  -- best OCR frame used
  frame_count     INT,
  sync_confidence NUMERIC(4,3),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- OCR results per frame (one frame may have multiple text detections)
CREATE TABLE ocr_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_id        UUID NOT NULL REFERENCES frames(id),
  session_id      UUID NOT NULL REFERENCES inspection_sessions(id),
  detected_text   VARCHAR(100),
  confidence      NUMERIC(4,3),
  bbox_x          INT, bbox_y INT, bbox_w INT, bbox_h INT,
  mapped_coach_id UUID REFERENCES coaches(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- What components are expected on each coach type
CREATE TABLE component_manifests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_type      VARCHAR(50) NOT NULL,   -- e.g. LHB_SLEEPER
  component_name  VARCHAR(100) NOT NULL,
  component_code  VARCHAR(50) NOT NULL,
  quantity        INT NOT NULL DEFAULT 1,
  is_critical     BOOLEAN DEFAULT false
);

-- One per component detection result
CREATE TABLE component_detections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES inspection_sessions(id),
  coach_id        UUID NOT NULL REFERENCES coaches(id),
  frame_id        UUID NOT NULL REFERENCES frames(id),
  component_code  VARCHAR(50) NOT NULL,
  component_name  VARCHAR(100),
  confidence      NUMERIC(4,3),
  bbox_x          INT, bbox_y INT, bbox_w INT, bbox_h INT,
  is_expected     BOOLEAN DEFAULT true,
  status          VARCHAR(20) NOT NULL,   -- detected | missing | defective
  model_version   VARCHAR(30),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- One per identified defect
CREATE TABLE defects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES inspection_sessions(id),
  coach_id        UUID NOT NULL REFERENCES coaches(id),
  frame_id        UUID NOT NULL REFERENCES frames(id),
  component_detection_id UUID REFERENCES component_detections(id),
  defect_type     VARCHAR(80) NOT NULL,   -- crack | missing_bolt | corrosion | deformation
  severity        VARCHAR(20) NOT NULL,   -- minor | moderate | critical
  confidence      NUMERIC(4,3),
  bbox_x          INT, bbox_y INT, bbox_w INT, bbox_h INT,
  annotated_frame_path TEXT,              -- URL to annotated frame overlay
  ai_notes        TEXT,                   -- model-generated explanation
  review_status   VARCHAR(20) DEFAULT 'pending',  -- pending | approved | rejected | escalated
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Pipeline stage tracking per session (visible to UI as status steps)
CREATE TABLE pipeline_stages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES inspection_sessions(id),
  stage           VARCHAR(40) NOT NULL,
  -- frame_extraction | ocr | synchronization | component_detection
  -- defect_detection | correlation | report_generation
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending | running | completed | failed
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  progress_pct    INT DEFAULT 0,          -- 0–100
  detail_message  TEXT,                   -- user-visible, no backend jargon
  error_message   TEXT,
  UNIQUE(session_id, stage)
);

-- Final report metadata
CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES inspection_sessions(id) UNIQUE,
  pdf_path        TEXT,                   -- s3://bucket/reports/...
  json_path       TEXT,
  generated_at    TIMESTAMPTZ,
  total_defects   INT,
  critical_defects INT,
  overall_health  NUMERIC(5,2),
  is_signed       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(200) UNIQUE NOT NULL,
  role            VARCHAR(30) NOT NULL,   -- admin | operator | viewer
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  action          VARCHAR(100) NOT NULL,
  resource_type   VARCHAR(50),
  resource_id     UUID,
  ip_address      VARCHAR(45),
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 3.2 Critical Indexes

```sql
-- Frame lookups are extremely frequent
CREATE INDEX idx_frames_session    ON frames(session_id);
CREATE INDEX idx_frames_camera     ON frames(camera_id);
CREATE INDEX idx_frames_coach      ON frames(coach_id);
CREATE INDEX idx_frames_flagged    ON frames(session_id, is_defect_flagged) WHERE is_defect_flagged = true;
CREATE INDEX idx_frames_ocr        ON frames(session_id, is_ocr_candidate) WHERE is_ocr_candidate = true;

-- Coach + defect lookups
CREATE INDEX idx_coaches_session   ON coaches(session_id);
CREATE INDEX idx_defects_session   ON defects(session_id);
CREATE INDEX idx_defects_coach     ON defects(coach_id);
CREATE INDEX idx_defects_severity  ON defects(session_id, severity);
CREATE INDEX idx_defects_review    ON defects(review_status) WHERE review_status = 'pending';

-- Pipeline status polling
CREATE INDEX idx_pipeline_session  ON pipeline_stages(session_id);
CREATE INDEX idx_sessions_status   ON inspection_sessions(status, started_at DESC);
```

### 3.3 What Goes in Postgres vs Object Storage

| Data | Location | Reason |
|---|---|---|
| Frame JPEG images | MinIO (object storage) | Binary blobs — not relational |
| Raw video files | MinIO | Very large, sequential access |
| Frame metadata (timestamp, camera, coach) | PostgreSQL | Relational, heavily queried |
| OCR results | PostgreSQL | Joined with frames and coaches |
| Component detections | PostgreSQL | Aggregated per coach per session |
| Defects | PostgreSQL | Joined, filtered, audited |
| Bounding box data | PostgreSQL | Small, queried with frames |
| Annotated frame overlays | MinIO | Image blobs |
| PDF reports | MinIO | Binary, served by URL |
| Session/pipeline state | PostgreSQL + Redis | Redis for live polling, Postgres for durable state |
| AI model weights (.pt files) | MinIO | Large binary, versioned |
| Audit logs | PostgreSQL | Compliance, queryable |

---

## 4. Storage Architecture & Volumes

### 4.1 Estimated Storage Per Inspection

| Metric | Value |
|---|---|
| Cameras | 6 |
| FPS | 100 |
| Inspection duration | ~2 minutes |
| Frames per camera | 12,000 |
| Total frames per train | 72,000 |
| Frame size (JPEG, compressed) | ~150 KB |
| Total frame storage per train | ~10.8 GB |
| Raw video per train (6 cams × 2min × 5MB/s) | ~3.6 GB |
| **Total per train** | **~14.4 GB** |

### 4.2 Daily and Monthly Volumes (50 trains/day)

| Period | Volume |
|---|---|
| Per day | ~700 GB |
| Per week | ~4.9 TB |
| Per month | ~21 TB |
| Per year | ~250 TB |

### 4.3 Storage Tiers

```
HOT STORAGE (NVMe SSD — MinIO, same server as Backend VPS)
  - Last 7 days of frames: ~5 TB
  - Active session frames (being processed): immediate access
  - Why: GPU workers need fast random reads per frame
  - Cost lever: can shrink to 3 days if GPU processes quickly

WARM STORAGE (HDD block storage — cheaper S3-compatible)
  - Days 8–30: frames still accessible from UI
  - ~15 TB
  - Served via signed URLs; small latency acceptable

COLD ARCHIVE (Object storage — Backblaze B2 / Wasabi)
  - Videos + full frame sets beyond 30 days
  - Kept 1–2 years for audit and model retraining
  - ~100 TB per year
  - Lifecycle policy: compress, deduplicate, retain flagged defect frames permanently

PERMANENT RETENTION (Object storage, immutable)
  - Defect evidence frames (annotated)
  - Signed PDF reports
  - Audit logs
  - These must NEVER be purged
```

### 4.4 Retention Policy

| Data | Retention | Action after expiry |
|---|---|---|
| Raw frames (normal, no defect) | 30 days hot | Move to cold, delete after 1 year |
| Raw frames (defect-flagged) | 2 years | Archive permanently |
| Raw video | 14 days | Delete after upload verified |
| Annotated defect frames | Permanent | Never delete |
| PDF reports | Permanent | Never delete |
| PostgreSQL metadata | Permanent | Partition by year after 2 years |
| Model weights | Keep last 10 versions | Archive older ones |

### 4.5 PostgreSQL Storage Estimate

| Data | Size/year |
|---|---|
| Frame metadata rows (72,000 × 50 trains × 365 days × 500 bytes) | ~657 GB |
| Defects, components, OCR | ~50 GB |
| Audit logs | ~10 GB |
| **Total Postgres/year** | **~720 GB** |

Use PostgreSQL table partitioning on `frames` by `created_at` (monthly partitions). Archive partitions older than 6 months to read-only tablespaces.

---

## 5. Edge Firmware Design (On-Site PC)

### 5.1 Architecture

The edge machine is intentionally dumb. It has ONE job: reliably capture frames and upload them. No AI runs here.

```
Hardware Camera (GigE / CoaXPress)
        ↓ Camera SDK (Basler Pylon / Allied Vision Vimba)
camera-driver (Python)
        ↓ raw frames in memory
frame-extractor (Python)
        ↓ JPEG-encoded frames + metadata dict
local-buffer (SQLite + /tmp/frames/)
        ↓ batched upload
uploader (Python)
        ↓ HTTPS multipart to MinIO
health-beacon (Python) → Backend VPS heartbeat API
```

### 5.2 camera-driver Service

```python
# Pseudocode — actual SDK calls depend on camera vendor
class CameraDriver:
    def __init__(self, config):
        self.cameras = [Camera(c) for c in config.cameras]
        self.trigger = HardwareTriggerListener(config.trigger_pin)

    def on_trigger(self, trigger_event):
        # All cameras fire simultaneously via hardware
        frames = [cam.grab_frame() for cam in self.cameras]
        # Pass to frame extractor with shared trigger timestamp
        self.extractor.process(frames, trigger_event.timestamp)
```

Key design decisions:
- Hardware trigger timestamp is the canonical time — never use `datetime.now()`
- Frame grab is synchronous within one trigger event (all cameras)
- Drop frame if grab takes >50ms (log the drop, never block)

### 5.3 frame-extractor Service

```python
def process_frames(raw_frames, trigger_ts, session_id):
    for raw_frame, camera_id in zip(raw_frames, camera_ids):
        # Encode to JPEG
        jpeg_bytes = cv2.imencode('.jpg', raw_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])[1]
        
        metadata = {
            "session_id": session_id,
            "camera_id": camera_id,
            "captured_at": trigger_ts.isoformat(),
            "sequence_number": next_seq(),
            "file_size_bytes": len(jpeg_bytes),
            "width_px": raw_frame.shape[1],
            "height_px": raw_frame.shape[0],
        }
        
        # Write to local buffer
        path = f"/tmp/frames/{session_id}/{camera_id}/{metadata['sequence_number']:06d}.jpg"
        write_to_disk(path, jpeg_bytes)
        sqlite_db.insert("pending_uploads", metadata | {"local_path": path})
```

### 5.4 uploader Service

```python
# Runs as background thread, flushes pending_uploads table
def upload_worker():
    while True:
        pending = sqlite_db.fetch("SELECT * FROM pending_uploads LIMIT 50")
        for row in pending:
            try:
                s3_path = f"sessions/{row.session_id}/{row.camera_id}/{row.sequence_number:06d}.jpg"
                minio_client.fput_object(BUCKET, s3_path, row.local_path)
                
                # Notify backend
                api_client.post("/api/frames/uploaded", {**row, "storage_path": s3_path})
                
                sqlite_db.delete("pending_uploads", row.id)
                os.remove(row.local_path)  # only after confirmed upload
            except Exception as e:
                sqlite_db.update("pending_uploads", row.id, retry_count=row.retry_count+1)
                log.error(f"Upload failed: {e}")
        
        time.sleep(0.1)  # tight loop — frames must upload fast
```

Key design decisions:
- Never delete local frame until backend confirms receipt
- SQLite local buffer survives network outages
- Retry with backoff up to 10 times, then escalate alert
- Upload parallelism: 4 concurrent workers (one per camera pair)

### 5.5 Session Management at Edge

When a train passes:
1. Train proximity sensor (IR sensor or track sensor) fires
2. `camera-driver` registers new session with Backend VPS (`POST /api/sessions`)
3. Backend returns `session_id`
4. All frames for this train are tagged with that `session_id`
5. When train fully passes (sensor off), edge sends `POST /api/sessions/{id}/capture_complete`

### 5.6 Edge Hardware Spec (Confirmed)

| Component | Spec | Notes |
|---|---|---|
| CPU | 4 vCPU (Intel i5/i7) | No AI — pure I/O bound |
| RAM | 8 GB | Monitor under 6-camera load |
| Storage | 512 GB NVMe | 7-day local buffer (~5TB capacity needed — use cloud for overflow) |
| Network | 100 Mbps broadband | ~700 GB/day = ~65 Mbps avg — tight, use compression |
| OS | Ubuntu 22.04 LTS | Headless, auto-start systemd services |
| Camera interface | PCIe GigE card or CoaXPress frame grabber | Vendor-specific |

**Network concern:** At 700 GB/day, sustained upload is 65 Mbps — very close to the 100 Mbps limit. Recommend: JPEG quality 80 (saves ~20%), burst uploads between trains (trains don't arrive every second), and a 200 Mbps line for multi-train sites.

---

## 6. GPU Worker Design (Rented Cloud GPU)

### 6.1 Why Rented GPU

- Inspection is bursty — a train takes 2 min to pass, then there's idle time
- On-site RTX 3080 (per the Railway Monitoring doc) is fine for MVP
- For production scale, rent an RTX 4090 or A40 on vast.ai / Lambda Labs / RunPod
- The backend treats GPU workers as stateless consumers — easily replaced or scaled

### 6.2 GPU VPS Spec

| Option | GPU | VRAM | Use case |
|---|---|---|---|
| MVP | RTX 3080 (on-site) | 12 GB | Single station, low volume |
| Production | RTX 4090 (rented) | 24 GB | Multi-camera, batched inference |
| Scale-out | A40 / A100 (cloud) | 48 GB | Multiple simultaneous trains |

VRAM budget per inference pass:
- YOLOv8-L: ~4 GB
- PaddleOCR: ~2 GB  
- Batch overhead: ~2 GB
- **Total: ~8 GB** — fits RTX 3080 with room for batching

### 6.3 Model Hosting

```
/models/
  /yolov8/
    component_detection_v3.pt    (best.pt from training)
    defect_classification_v2.pt
  /ocr/
    paddleocr_det/               (text detection model)
    paddleocr_rec/               (text recognition model)
  /roi/
    region_of_interest_v1.pt     (custom ROI selector)
```

Models are downloaded from MinIO on worker startup. `model-manager` watches for new versions and hot-swaps without downtime.

### 6.4 OCR Worker

```python
class OCRWorker:
    def __init__(self):
        self.ocr = PaddleOCR(use_angle_cls=True, lang='en', use_gpu=True)
        self.channel = rabbitmq.connect().channel()
        self.channel.basic_consume(queue='ocr_queue', on_message_callback=self.process)

    def process(self, ch, method, props, body):
        job = json.loads(body)
        # Fetch frame from MinIO (signed URL → download to /tmp)
        frame = download_frame(job['storage_path'])
        
        # Enhance for OCR
        enhanced = enhance_for_ocr(frame)  # contrast, deblur
        
        # Run OCR
        results = self.ocr.ocr(enhanced, cls=True)
        
        # Parse coach numbers from detected text
        coach_hits = [parse_coach_number(r) for r in results if r]
        
        # Return results to backend
        api_post('/api/ocr/results', {
            'frame_id': job['frame_id'],
            'session_id': job['session_id'],
            'results': coach_hits,
        })
        
        ch.basic_ack(delivery_tag=method.delivery_tag)
```

### 6.5 Detection Worker

```python
class DetectionWorker:
    def __init__(self):
        self.roi_model = YOLO('/models/roi/region_of_interest_v1.pt')
        self.component_model = YOLO('/models/yolov8/component_detection_v3.pt')
        self.defect_model = YOLO('/models/yolov8/defect_classification_v2.pt')

    def process(self, job):
        # Job contains a batch of frame paths for ONE coach
        frames = [download_frame(p) for p in job['frame_paths']]
        
        all_detections = []
        for frame, frame_id in zip(frames, job['frame_ids']):
            # Stage 1: ROI — find component regions
            roi_results = self.roi_model(frame)
            
            for roi in roi_results:
                cropped = crop(frame, roi.bbox)
                
                # Stage 2: Component detection
                comp_result = self.component_model(cropped)
                
                # Stage 3: Defect classification on detected component
                defect_result = self.defect_model(cropped)
                
                all_detections.append({
                    'frame_id': frame_id,
                    'component': comp_result.label,
                    'component_confidence': comp_result.confidence,
                    'bbox': roi.bbox,
                    'defect_type': defect_result.label if defect_result.confidence > 0.5 else None,
                    'defect_confidence': defect_result.confidence,
                })
        
        # Temporal fusion — aggregate across frames for same component
        fused = temporal_fusion(all_detections)
        
        api_post('/api/detections/results', {
            'session_id': job['session_id'],
            'coach_id': job['coach_id'],
            'detections': fused,
        })
```

### 6.6 Queue Design

```
RabbitMQ Exchanges and Queues:

Exchange: vande_inspect (topic)
  ├── Routing key: ocr.frame       → Queue: ocr_queue
  │     Message: { session_id, frame_id, storage_path, camera_id }
  │     Consumer: OCR Worker (GPU)
  │
  ├── Routing key: detection.coach → Queue: detection_queue
  │     Message: { session_id, coach_id, frame_ids[], storage_paths[] }
  │     Consumer: Detection Worker (GPU)
  │
  ├── Routing key: report.session  → Queue: report_queue
  │     Message: { session_id }
  │     Consumer: Report Generator (CPU, Backend VPS)
  │
  └── Routing key: status.update   → Queue: status_queue (fanout)
        Message: { session_id, stage, status, progress, message }
        Consumer: WebSocket Gateway → Frontend
```

Dead letter queues for all three — failed jobs go to `*_dlq` for manual inspection.

---

## 7. Deployment Topology

### 7.1 Complete Deployment Map

```
┌─────────────────────────────────────────────────────────────────┐
│  MONITORING SITE (Physical)                                      │
│                                                                  │
│  ┌──────────────┐    GigE/CoaXPress    ┌─────────────────────┐  │
│  │  6× Cameras  │ ─────────────────→   │   Edge PC           │  │
│  │  (High-speed)│                      │   - camera-driver   │  │
│  └──────────────┘                      │   - frame-extractor │  │
│                                        │   - uploader        │  │
│                                        │   - local SQLite    │  │
│                                        └────────┬────────────┘  │
│                                                 │ 100 Mbps      │
└─────────────────────────────────────────────────│───────────────┘
                                                  │ HTTPS upload
                                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND VPS (e.g. Hetzner CX52 — 16 vCPU / 32 GB)             │
│                                                                  │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │  api-server    │  │  RabbitMQ       │  │  PostgreSQL 16   │  │
│  │  (Fastify)     │  │  (queues)       │  │  (metadata DB)   │  │
│  └────────────────┘  └─────────────────┘  └──────────────────┘  │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │  sync-engine   │  │  Redis          │  │  MinIO           │  │
│  │  (Python)      │  │  (cache/WS)     │  │  (object store)  │  │
│  └────────────────┘  └─────────────────┘  └──────────────────┘  │
│  ┌────────────────┐  ┌─────────────────┐                         │
│  │  correlation   │  │  report-gen     │                         │
│  │  -engine       │  │  (Python)       │                         │
│  └────────────────┘  └─────────────────┘                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Nginx reverse proxy — routes /api/* and /ws/*             │  │
│  └────────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────┘
                                 │ Internal private network
                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│  GPU VPS (e.g. vast.ai RTX 4090 — 24 GB VRAM)                  │
│                                                                  │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │  ocr-worker    │  │  detection-     │  │  model-manager   │  │
│  │  (PaddleOCR)   │  │  worker (YOLO)  │  │  (hot-swap)      │  │
│  └────────────────┘  └─────────────────┘  └──────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  CUDA 12 + PyTorch 2 + TensorRT (Docker container)         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Training window: 12:00 AM–4:00 AM (off-peak)                   │
│  best.pt pushed to MinIO on completion                          │
└─────────────────────────────────────────────────────────────────┘
                                 ↑
                                 │ CDN + Nginx
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND VPS (e.g. Hetzner CX21 — 4 vCPU / 8 GB)              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Next.js 14 App (SSR + static)                             │  │
│  │  - Dashboard, Train Workspace, Reports                     │  │
│  │  - WebSocket client for live pipeline status               │  │
│  └────────────────────────────────────────────────────────────┘  │
│  Nginx + Let's Encrypt SSL                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 VPS Sizing (Production)

| Server | Provider Suggestion | Spec | Monthly Cost (est.) |
|---|---|---|---|
| Backend VPS | Hetzner CX52 | 16 vCPU / 32 GB / 2 TB NVMe | ~€65 |
| Frontend VPS | Hetzner CX21 | 4 vCPU / 8 GB | ~€10 |
| GPU (inference) | vast.ai RTX 4090 | 24 GB VRAM, on-demand | ~$1–3/hr (pay as used) |
| GPU (training) | RunPod A40 | 48 GB VRAM | ~$0.80/hr (scheduled window) |
| Object Storage | Backblaze B2 | Per-TB pricing | ~$6/TB/month |

**GPU cost optimization:** GPU is only rented during active processing. A 2-minute train inspection takes roughly 10–15 min of GPU processing. At 50 trains/day, that's ~12 GPU-hours/day = ~$4–6/day at RTX 4090 rates.

### 7.3 Networking Between Services

- Edge → MinIO: HTTPS, direct object upload
- Edge → API: HTTPS REST (frame upload notification)
- Backend VPS internal services: Docker network, no public exposure
- Backend → GPU: RabbitMQ over private VPN (WireGuard tunnel)
- GPU → Backend API (results): HTTPS REST
- GPU → MinIO (frame download): HTTPS, signed URLs
- Frontend → Backend: HTTPS REST + WebSocket
- Frontend → MinIO (frame serving): HTTPS signed URLs (1-hour expiry)

---

## 8. API Design Summary

### Core Endpoints

```
POST   /api/sessions                    Create inspection session
GET    /api/sessions                    List sessions (dashboard)
GET    /api/sessions/:id                Session detail + pipeline status
POST   /api/sessions/:id/capture_complete  Edge signals capture done

POST   /api/frames/uploaded             Edge notifies frame upload complete
GET    /api/sessions/:id/frames         List frames (paginated, filterable)
GET    /api/frames/:id/signed-url       Get 1-hr signed URL for frame image

GET    /api/sessions/:id/coaches        List coaches with frame counts
GET    /api/coaches/:id/frames          Frames for one coach (by camera)
GET    /api/coaches/:id/components      Component manifest + detection results
GET    /api/coaches/:id/defects         Defects for one coach

POST   /api/ocr/results                 OCR worker posts results
POST   /api/detections/results          Detection worker posts results

GET    /api/reports/:sessionId          Get report metadata + PDF URL
POST   /api/defects/:id/review          Operator reviews a defect

WS     /ws/sessions/:id/status          Live pipeline status stream
```

---

## 9. Real-Time Status Updates (WebSocket)

The frontend subscribes to `WS /ws/sessions/:id/status`. 

When any pipeline stage changes, the `status-queue` consumer (WebSocket Gateway) pushes:

```json
{
  "session_id": "uuid",
  "stage": "synchronization",
  "status": "completed",
  "progress": 100,
  "message": "14 coaches identified and mapped",
  "timestamp": "2025-01-10T12:00:03Z"
}
```

The frontend translates this to user-visible language per the UI architecture doc — never exposing "OCR" or "YOLO" in the interface.

---

## 10. Monitoring Stack

| Tool | Role | Hosted |
|---|---|---|
| Prometheus | Scrapes metrics from all services | Backend VPS |
| Grafana | Dashboards for GPU util, queue depth, frame throughput | Backend VPS |
| Loki | Log aggregation | Backend VPS |
| NVIDIA DCGM | GPU telemetry (VRAM, util, temp) | GPU VPS |
| Uptime Kuma | Edge machine heartbeat monitoring | Backend VPS |

Alert rules:
- Queue depth > 500 → notify (GPU can't keep up)
- OCR confidence < 0.7 on >20% of frames → flag session for manual review
- Edge heartbeat missing > 2 min → alert
- GPU VRAM > 90% → throttle detection batch size

---

## 11. Security

| Layer | Control |
|---|---|
| API | JWT authentication (short-lived access + refresh tokens) |
| MinIO | Signed URLs with 1-hour expiry — frontend never gets direct bucket access |
| GPU ↔ Backend | WireGuard VPN, no public ports on GPU VPS |
| Database | PostgreSQL not exposed to internet — only accessible from Backend VPS |
| Audit | Every defect review, report export, and login written to audit_logs |
| Reports | PDF signed with server key — tamper-evident |
| Edge | Edge machine uses API key (not JWT) — rotated monthly |

---

## 12. Build Order Recommendation

**Phase 1 — Foundation (4–6 weeks)**
1. PostgreSQL schema + migrations (Prisma or Flyway)
2. Backend API server (Fastify) — sessions, frames, coaches endpoints
3. MinIO setup + signed URL generation
4. Edge firmware — camera-driver + frame-extractor + uploader
5. Basic Next.js frontend — dashboard + session list

**Phase 2 — AI Pipeline (4–6 weeks)**
6. RabbitMQ setup + queue publisher
7. OCR worker (PaddleOCR) on GPU VPS
8. Synchronization engine (Python)
9. Detection worker (YOLOv8) on GPU VPS
10. Correlation engine + component manifest validation

**Phase 3 — Intelligence + Reports (3–4 weeks)**
11. Report generator (PDF via WeasyPrint / ReportLab)
12. Defect review workflow
13. WebSocket live status
14. Monitoring stack (Prometheus + Grafana)

**Phase 4 — Production Hardening (2–3 weeks)**
15. Dead letter queues + retry logic
16. Automated model retraining pipeline
17. Storage lifecycle policy automation
18. Security audit, signed reports, audit logs
