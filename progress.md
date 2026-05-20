# VandeInspect AI — Backend Build Progress

**Goal:** 2 videos in → inspection report visible in UI  
**Updated:** 2026-05-20

---

## Correct Service Architecture

The system is NOT all-Node. It is a multi-language, multi-service platform.
Each service has one job and is written in the language the architecture docs specify.

```
Frontend (React + Vite) ── port 5173
        │
        ▼
Backend API  (Node.js + Fastify) ── port 8001
  ├── REST routes (sessions, coaches, frames, defects, reports)
  ├── WebSocket gateway (live pipeline status → frontend)
  ├── Session manager (lifecycle: QUEUED → COMPLETED)
  ├── Queue publisher (dispatches jobs to Python services via HTTP)
  └── Storage proxy (Cloudinary signed URLs)
        │
        ├──────────────────────────────────────┐
        ▼                                      ▼
GPU/ocr/  (Python FastAPI) ── port 5000    GPU/yolo/ (Python FastAPI) ── port 5002
  PaddleOCR GPU inference                   YOLOv8 GPU inference
  2-pass self-healing OCR                   Component + defect detection
  5-6 digit train number validation         Returns bounding boxes + labels
        │                                      │
        └──────────────┬───────────────────────┘
                       ▼
             services/sync_engine/  (Python FastAPI) ── port 5004
               OCR results + gap detection → coach mapping
               Writes coach_frame_map → PostgreSQL
                       │
                       ▼
             services/correlation/  (Python FastAPI) ── port 5005
               Expected vs detected component manifest
               Flags missing components, assigns severity
                       │
                       ▼
             services/report_generator/  (Python FastAPI) ── port 5006
               PDF + JSON report assembly
               Uploads report → Cloudinary
               Updates reports table in PostgreSQL

       Frame extraction happens BEFORE all the above:
             services/frame_extractor/  (Python FastAPI) ── port 5003
               OpenCV: video → JPEG frames
               Uploads each frame → Cloudinary
               Writes frames table → PostgreSQL
```

---

## Storage: Cloudinary

All binary assets (frames, annotated frames, report PDFs) go to Cloudinary.
PostgreSQL stores only the URLs + public_ids.

| Asset | Cloudinary Folder | Stored in Postgres as |
|---|---|---|
| Extracted frame JPEG | `vande/{session_id}/{camera_id}/` | `cloudinary_url`, `cloudinary_public_id` |
| Annotated defect frame | `vande/{session_id}/annotated/` | `annotated_frame_url` |
| Report PDF | `vande/{session_id}/reports/` | `pdf_url` |
| Report JSON | `vande/{session_id}/reports/` | `json_url` |

---

## Full Folder Structure

```
Main/
├── backend/                          # Node.js + Fastify — API orchestrator
│   ├── src/
│   │   ├── app.js                    # Fastify setup, CORS, plugin registration
│   │   ├── config.js                 # ENV vars: DB conn string, Cloudinary keys, service ports
│   │   ├── routes/
│   │   │   ├── sessions.js           # Upload, create, list, get session
│   │   │   ├── coaches.js            # Hierarchy: session → coach → camera → frames
│   │   │   ├── frames.js             # Frame detail + serve Cloudinary URL
│   │   │   ├── intelligence.js       # Components + defects per coach
│   │   │   ├── reports.js            # Generate + download report
│   │   │   └── dashboard.js          # KPIs + live queue
│   │   ├── services/
│   │   │   ├── pipelineOrchestrator.js  # Calls Python services in sequence, updates stages
│   │   │   ├── cloudinaryService.js     # Upload helper, signed URL generation
│   │   │   └── wsGateway.js             # WebSocket: broadcast pipeline stage updates
│   │   └── db/
│   │       ├── client.js             # postgres (pg) connection pool
│   │       └── queries/              # One file per domain: sessions.js, coaches.js, etc.
│   ├── schema.sql                    # Full production PostgreSQL schema (run once)
│   ├── package.json
│   └── run.js                        # Start Fastify on port 8001
│
├── GPU/                              # Python — GPU inference microservices
│   ├── ocr/
│   │   ├── server.py                 # FastAPI app — port 5000
│   │   ├── ocr_engine.py             # PaddleOCR singleton, GPU→CPU fallback, Win CUDA DLL injection
│   │   ├── preprocess.py             # grayscale → 2× upscale → sharpen → CLAHE → Gaussian blur
│   │   ├── train_number_filter.py    # ^\d{5,6}$ regex + confidence ≥ 0.4
│   │   ├── vote_manager.py           # Cross-frame voting; threshold = 5 hits before accepting number
│   │   └── requirements.txt
│   ├── yolo/
│   │   ├── server.py                 # FastAPI app — port 5002; loads BOTH models at startup
│   │   │                             #   best.pt              → POST /api/yolo/predict          (defect detection)
│   │   │                             #   train_num_detector.pt → POST /api/yolo/predict_train_number (bogie ROI)
│   │   ├── inference.py              # YOLOv8 load + run on frame for both endpoints
│   │   ├── model_manager.py          # Load both models, warm-up pass, hot-swap on update
│   │   └── requirements.txt
│   └── shared/
│       ├── cloudinary_client.py      # Cloudinary upload/transform helpers
│       └── db_client.py              # psycopg2 connection for writing results
│
├── services/                         # Python — CPU pipeline workers (same VPS as backend)
│   ├── frame_extractor/
│   │   ├── server.py                 # FastAPI app — port 5003
│   │   ├── extractor.py              # OpenCV video → JPEG + Cloudinary upload
│   │   └── requirements.txt
│   ├── sync_engine/
│   │   ├── server.py                 # FastAPI app — port 5004
│   │   ├── engine.py                 # Gap detection + frame-to-coach assignment
│   │   └── requirements.txt
│   ├── correlation/
│   │   ├── server.py                 # FastAPI app — port 5005
│   │   ├── engine.py                 # Component manifest validation + severity scoring
│   │   ├── manifests/
│   │   │   └── vande_bharat.json     # Expected components per coach type
│   │   └── requirements.txt
│   └── report_generator/
│       ├── server.py                 # FastAPI app — port 5006
│       ├── builder.py                # PDF (fpdf2) + JSON assembly + Cloudinary upload
│       └── requirements.txt
│
├── frontend/                         # React + Vite (already built — Phases 1-6 done)
│
├── schema.sql                        # Symlink / copy of backend/schema.sql
├── progress.md
└── understanding.md
```

---

## Port Reference

| Port | Service | Language | Role |
|---|---|---|---|
| 5173 | Frontend | React | UI |
| 8001 | Backend API | Node.js | REST + WebSocket orchestrator |
| 5000 | OCR Service | Python | PaddleOCR GPU inference |
| 5002 | YOLO Service | Python | YOLOv8 GPU inference |
| 5003 | Frame Extractor | Python | OpenCV → Cloudinary |
| 5004 | Sync Engine | Python | Coach mapping |
| 5005 | Correlation | Python | Component manifest validation |
| 5006 | Report Generator | Python | PDF + JSON |

---

## Phase 0 — PostgreSQL Schema + Project Scaffolding ⬜

**Goal:** Database schema exists. All service folders exist. Configs ready.

- [ ] Run `schema.sql` against PostgreSQL when connection string is received
- [ ] Create `backend/` folder structure, `package.json` with fastify, pg, cloudinary, dotenv
- [ ] Create `GPU/ocr/`, `GPU/yolo/`, `GPU/shared/` folders + requirements.txt
- [ ] Create `services/frame_extractor/`, `sync_engine/`, `correlation/`, `report_generator/` folders
- [ ] Create `.env` template: `DATABASE_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- [ ] Write `backend/src/db/client.js` — postgres connection pool
- [ ] Write `backend/src/config.js` — reads all env vars
- [ ] Start backend: `GET /health` returns `{ status: "ok", db: "connected" }`

**Done when:** `node run.js` → health check confirms DB connected.

---

## Phase 1 — Video Upload + Frame Extraction + Cloudinary ⬜

**Goal:** POST 2 videos → frames appear in Cloudinary → frame rows in PostgreSQL

**Node.js backend:**
- [ ] `POST /api/sessions/upload` — accepts `multipart/form-data` with `video_files[]` + `train_number`
  - Creates `inspection_sessions` row (status=`queued`)
  - Creates `cameras` rows (one per video)
  - Creates `pipeline_stages` rows (all stages, status=`pending`)
  - Calls frame extractor service via HTTP: `POST http://localhost:5003/extract`
  - Returns `{ session_id, status }`
- [ ] `GET /api/sessions` — reads from `inspection_sessions`, returns list matching frontend mock shape
- [ ] `GET /api/sessions/:id` — returns session + all pipeline stage statuses

**Python frame_extractor service (port 5003):**
- [ ] Receives `{ session_id, video_path, camera_id }` from backend
- [ ] Opens video with OpenCV, extracts every Nth frame (configurable, e.g. every 5th frame)
- [ ] For each frame: upload to Cloudinary → get `secure_url` + `public_id`
- [ ] Writes `frames` row per frame (cloudinary_url, camera_id, session_id, sequence_number, timestamp_ms)
- [ ] Updates `pipeline_stages.status` = `completed` for `frame_extraction`
- [ ] Updates `inspection_sessions.total_frames`, `status` = `ocr_running`
- [ ] Notifies backend via callback URL

**Done when:** Upload 2 videos → Cloudinary has frames organized in `vande/{session_id}/` → `frames` table populated.

---

## Phase 2 — OCR Pipeline + Coach Mapping ⬜

**Goal:** OCR runs on extracted frames → coaches identified → hierarchy endpoint returns real data

**Python OCR service (port 5000) — port from POC (YOLO-first ROI pipeline):**

The OCR service does NOT run PaddleOCR on the full frame. It follows this pipeline:

```
Download frame from Cloudinary URL
        ↓
POST http://localhost:5002/api/yolo/predict_train_number
    → Detects "Boogie" class boxes (bogie region where coach number is painted)
    → Returns [{ bbox_xyxy, confidence, class_id, label }]
        ↓
ROI Extraction (if YOLO returns Boogie boxes):
    Select highest-confidence Boogie box
    Apply 15% dynamic padding on all 4 sides:
        pad_w = int(box_w * 0.15), pad_h = int(box_h * 0.15)
    Crop = frame[y1_pad:y2_pad, x1_pad:x2_pad]
        ↓
Pass 1 — PaddleOCR on raw BGR crop
    (preserves sub-pixel chromatic boundaries and natural contrast)
        ↓
Pass 2 — Only if Pass 1 returns no result:
    grayscale → 2× upscale (INTER_LINEAR) → sharpen kernel → CLAHE (clipLimit=2.0) → Gaussian blur (3×3)
    PaddleOCR on preprocessed crop
        ↓
Full-frame fallback — Only if YOLO returns no boxes OR both passes fail:
    Apply same preprocessing to full frame → PaddleOCR
        ↓
Filter: regex ^\d{5,6}$ + confidence ≥ 0.4
    Secondary: extract digit-only substrings as fallback
```

- [ ] `POST /ocr` — receives `{ frame_url, session_id, frame_id }`, executes full pipeline above
- [ ] Returns `{ detected_text, coach_number, confidence, bbox, pass_used, roi_used }`
- [ ] Writes `ocr_results` row (detected_text, confidence, bbox coords, frame_id)
- [ ] VoteManager is maintained **per session in the orchestrator** (not inside the OCR service) — each OCR result is a vote; a coach number is accepted only after ≥ 5 hits across frames

**Python sync_engine service (port 5004):**
- [ ] `POST /sync` — receives `{ session_id }`
- [ ] Reads all accepted coach number votes for session from PostgreSQL
- [ ] Gap detection: find frame sequences where OCR consistently fires the same number → marks inter-coach boundaries where number changes or OCR goes silent
- [ ] Creates `coaches` rows (coach_number from OCR, coach_index, ocr_confidence)
- [ ] Updates `frames.coach_id` for all frames in each coach's time window
- [ ] Updates `pipeline_stages` for `synchronization`

**Node.js backend — orchestrator:**
- [ ] `pipelineOrchestrator.js`: after frame extraction completes →
  - For each side-camera frame: call `POST /ocr` on OCR service
  - Accumulate vote counts per coach number per session (VoteManager logic)
  - After all frames processed: call `POST /sync` on sync engine
- [ ] `GET /api/sessions/:id/hierarchy` — returns Train → Coach → Camera → Frames tree
- [ ] `GET /api/sessions/:id/timeline-events` — OCR_ANCHOR + COACH_GAP events

**Done when:** Call `/hierarchy` → real coaches from the video, real frame URLs from Cloudinary.

---

## Phase 3 — YOLO Detection + Defect Intelligence ⬜

**Goal:** Defects detected per coach → intelligence panel shows real data with bounding boxes

**Python YOLO service (port 5002) — port from POC:**

Two models are loaded at startup. Phase 3 uses only the **defect detection** endpoint:

- [ ] `POST /api/yolo/predict` — receives `{ frame_url }`, downloads from Cloudinary, runs `best.pt`
- [ ] Returns `{ boxes: [{label, confidence, bbox_xyxy, severity}] }`
  - Severity map: `crack/leakage → CRITICAL`, `broken/rust/deformation → HIGH`, `missing_part → MEDIUM`, `loose → LOW`
- [ ] Writes `component_detections` rows
- [ ] (The second endpoint `POST /api/yolo/predict_train_number` is used only in Phase 2 OCR pipeline — not here)

**Python correlation service (port 5005):**
- [ ] `POST /correlate` — receives `{ session_id, coach_id }`
- [ ] Loads component manifest for coach type from `services/correlation/manifests/vande_bharat.json`
- [ ] Compares expected vs detected components
- [ ] Creates `defects` rows (severity, ai_notes, annotated_frame_url)
- [ ] Updates `coaches.critical_defects`, `coaches.missing_components`, `coaches.health_score`

**Node.js backend — orchestrator:**
- [ ] After sync complete: batch frames per coach → call YOLO for each frame
- [ ] After YOLO: call correlation service per coach
- [ ] `GET /api/sessions/:id/coaches/:coachId/intelligence` → components + defects (real data)
- [ ] Frame images served directly via Cloudinary URLs (no proxy needed)

**Done when:** Intelligence panel in the UI shows real defects with bounding box data from your video.

---

## Phase 4 — Report Generation ⬜

**Goal:** Click "Generate Report" → real PDF with train summary + defect evidence downloads

**Python report_generator service (port 5006):**
- [ ] `POST /generate` — receives `{ session_id }`
- [ ] Reads full session: coaches + component_detections + defects from PostgreSQL
- [ ] Builds train-level summary: health score, total defects, coach breakdown
- [ ] For each defect: embed annotated frame image (Cloudinary URL → download → embed in PDF)
- [ ] Generate PDF with `fpdf2`
- [ ] Upload PDF to Cloudinary → get `pdf_url`
- [ ] Generate JSON report
- [ ] Upload JSON to Cloudinary → get `json_url`
- [ ] Writes `reports` row (pdf_url, json_url, generated_at)
- [ ] Updates `inspection_sessions.status` = `completed`

**Node.js backend:**
- [ ] `POST /api/sessions/:id/report` → calls report generator service
- [ ] `GET /api/sessions/:id/report/download` → returns Cloudinary PDF URL (redirect or signed URL)
- [ ] `GET /api/dashboard/kpis` → aggregated stats from inspection_sessions
- [ ] `GET /api/dashboard/live-queue` → sessions with status != completed

**Done when:** A real PDF downloads with train number, coach list, annotated defect images.

---

## Phase 5 — Frontend Wire-Up ⬜

**Goal:** UI runs on real data, not mock data

- [ ] Add `VITE_API_BASE_URL=http://localhost:8001` to `frontend/.env`
- [ ] Replace mock sessions data → `GET /api/sessions`
- [ ] Replace mock session detail → `GET /api/sessions/:id`
- [ ] Replace mock hierarchy → `GET /api/sessions/:id/hierarchy`
- [ ] Replace mock intelligence → `GET /api/sessions/:id/coaches/:coachId/intelligence`
- [ ] Frame image `src` → use Cloudinary URLs from API response directly
- [ ] Add upload flow: video upload form → `POST /api/sessions/upload` → redirect to workspace
- [ ] Add "Process" trigger button → `POST /api/sessions/:id/process`
- [ ] Pipeline status: polling `GET /api/sessions/:id` every 3s while processing
- [ ] Wire "Generate Report" → `POST /api/sessions/:id/report`
- [ ] Wire "Download Report" → open Cloudinary PDF URL
- [ ] Dashboard KPIs → `GET /api/dashboard/kpis`
- [ ] Live queue → `GET /api/dashboard/live-queue`

**Done when:** Full flow works end-to-end through the UI with real video input.

---

## Phase 6 — WebSocket Live Status ⬜

**Goal:** Pipeline stage updates appear in real-time in the Pipeline Timeline component

- [ ] Node.js WebSocket gateway: emit stage change events as Python services complete
- [ ] `GET /api/ws/sessions/:id` — WebSocket endpoint
- [ ] Frontend: replace polling with WebSocket subscription in TrainWorkspace
- [ ] Pipeline Timeline component: stage transitions animate live
- [ ] Toast notifications: "Synchronization completed. 14 coaches mapped."
- [ ] Error state handling: OCR confidence too low → yellow warning badge on stage

**Done when:** Open workspace → watch stage chips flip from grey → cyan → green in real-time.

---

## Status Tracker

| Phase | Name | Status | Notes |
|---|---|---|---|
| 0 | Schema + Scaffolding | ⬜ Waiting for PG conn string | |
| 1 | Video upload + Frame extraction + Cloudinary | ⬜ Not started | |
| 2 | OCR + Coach mapping | ⬜ Not started | |
| 3 | YOLO Detection + Defect intelligence | ⬜ Not started | |
| 4 | Report generation (PDF) | ⬜ Not started | |
| 5 | Frontend wire-up | ⬜ Not started | |
| 6 | WebSocket live status | ⬜ Not started | |

**Legend:** ⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

---

## Running Everything (Development)

```bash
# 1. GPU Services (need CUDA + GPU)
cd Main/GPU/yolo   && python server.py   # port 5002
cd Main/GPU/ocr    && python server.py   # port 5000

# 2. CPU Pipeline Services
cd Main/services/frame_extractor   && python server.py   # port 5003
cd Main/services/sync_engine       && python server.py   # port 5004
cd Main/services/correlation       && python server.py   # port 5005
cd Main/services/report_generator  && python server.py   # port 5006

# 3. Backend API
cd Main/backend   && node run.js   # port 8001

# 4. Frontend
cd Main/frontend  && npm run dev   # port 5173
```

---

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| API server | Node.js + Fastify | Architecture doc specifies this explicitly |
| GPU workers | Python FastAPI | PaddleOCR + PyTorch are Python-only |
| CPU workers | Python FastAPI | Sync engine + correlation + report are Python in arch doc |
| Frame storage | Cloudinary | User requirement — no MinIO for MVP |
| Database | PostgreSQL | Full schema defined in arch doc; user providing conn string |
| Queue | HTTP calls between services | No RabbitMQ for MVP; orchestrator calls services directly |
| PDF | fpdf2 | Lightweight, no system deps, works on Windows |
| Frame sampling | Every Nth frame | 72,000 frames/train is too many to process all; sample smart |
| Binary YOLO model | defect=0 / normal=1 | Decided in POC — maximizes recall |
| OCR approach | YOLO-first ROI, not full-frame | YOLO detects bogie region in <20ms; PaddleOCR runs on ~200×100px crop instead of full 5MP frame — order-of-magnitude latency reduction + higher accuracy |
| OCR–YOLO isolation | Separate processes (5000/5002) | PyTorch + PaddlePaddle in same process → `0xC0000005` CUDA DLL crash on Windows |
| VoteManager threshold | 5 hits across frames | Eliminates false positives from station boards, ads, serial codes painted near the bogie |
| OCR Pass 2 preprocessing | grayscale → 2× upscale → sharpen → CLAHE → Gaussian blur | Self-healing fallback when raw crop contrast is too low for Pass 1 |
