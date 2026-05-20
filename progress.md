# VandeInspect AI — Backend Build Progress

**Goal:** 2 videos in → inspection report visible in UI  
**Updated:** 2026-05-20

---

## Correct Service Architecture

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
  YOLO-first ROI 2-pass OCR                 Two models loaded at startup:
  5-6 digit train number validation           best.pt              → /api/yolo/predict
  Writes ocr_results rows                     train_num_detector.pt → /api/yolo/predict_train_number
        │                                      │
        └──────────────┬───────────────────────┘
                       ▼
             services/sync_engine/  (Python FastAPI) ── port 5004
               trigger_id-based gap detection → coach mapping
               Writes coaches + coach_frame_map → PostgreSQL
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

       Frame extraction happens BEFORE all the above:
             services/frame_extractor/  (Python FastAPI) ── port 5003
               OpenCV: video → JPEG frames (every Nth frame)
               Sets trigger_id = raw video frame_number
               Uploads each frame → Cloudinary
               Writes frames table → PostgreSQL
```

---

## Synchronization: trigger_id (NOT timestamps)

Timestamps are unreliable for cross-camera sync (clock drift, capture latency).
The system uses `trigger_id` as the sync key across all cameras.

| Mode | trigger_id source |
|---|---|
| Production (hardware) | Camera trigger pulse ID from edge firmware — all cameras fire at same pulse |
| Test (video upload) | Raw video `frame_number` — frame #500 in cam 1 = frame #500 in cam 2 (recorded simultaneously) |

**Critical:** `trigger_id` is the raw video frame position (`frame_number`), NOT the extracted sequence number.
- If interval=5: frames extracted are frame_numbers 0, 5, 10, 15...
- All cameras share the same frame_numbers → same trigger_ids
- `sequence_number` (0, 1, 2, 3...) is just the DB row ordering — never used for sync

The sync engine always joins on `trigger_id`. Never on timestamps. Never on sequence_number.

---

## Storage: Cloudinary

All binary assets (frames, annotated frames, report PDFs) go to Cloudinary.
PostgreSQL stores only the URLs + public_ids.

| Asset | Cloudinary Folder | Stored in Postgres as |
|---|---|---|
| Extracted frame JPEG | `vande/{session_id}/{session_camera_id}/` | `cloudinary_url`, `cloudinary_public_id` |
| Annotated defect frame | `vande/{session_id}/annotated/` | `annotated_frame_url` |
| Report PDF | `vande/{session_id}/reports/` | `pdf_url` |
| Report JSON | `vande/{session_id}/reports/` | `json_url` |

---

## Full Folder Structure

```
Main/
├── backend/                          # Node.js + Fastify — API orchestrator
│   ├── src/
│   │   ├── app.js                    # Fastify setup, CORS, multipart, plugin registration
│   │   ├── config.js                 # ENV vars: DB conn string, Cloudinary keys, service ports
│   │   ├── routes/
│   │   │   ├── sessions.js           # Upload, create, list, get session, hierarchy
│   │   │   ├── coaches.js            # Coach detail + frames (Phase 2)
│   │   │   ├── intelligence.js       # Components + defects per coach (Phase 3)
│   │   │   ├── reports.js            # Generate + download report (Phase 4)
│   │   │   └── dashboard.js          # KPIs + live queue
│   │   ├── services/
│   │   │   ├── pipelineOrchestrator.js  # Calls Python services in sequence, updates stages
│   │   │   ├── cloudinaryService.js     # Upload helper, signed URL generation
│   │   │   └── wsGateway.js             # WebSocket: broadcast pipeline stage updates
│   │   └── db/
│   │       └── client.js             # Prisma client singleton
│   ├── prisma/
│   │   ├── schema.prisma             # Full production schema (19 models, pushed to Neon)
│   │   └── seed.js                   # TEST01 camera setup + 14 component manifests
│   ├── uploads/                      # Temp video storage (git-ignored)
│   ├── .env                          # Real credentials (git-ignored)
│   ├── .env.example
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
│   │   │                             #   best.pt              → POST /api/yolo/predict
│   │   │                             #   train_num_detector.pt → POST /api/yolo/predict_train_number
│   │   ├── inference.py              # YOLOv8 load + run on frame for both endpoints
│   │   ├── model_manager.py          # Load both models, warm-up pass, hot-swap on update
│   │   └── requirements.txt
│   └── shared/
│       ├── cloudinary_client.py      # Cloudinary upload/transform helpers
│       └── db_client.py              # psycopg2 connection for writing results
│
├── services/                         # Python — CPU pipeline workers
│   ├── frame_extractor/
│   │   ├── server.py                 # FastAPI app — port 5003 ✅ IMPLEMENTED
│   │   ├── .env                      # DB URL + Cloudinary creds (fill before running)
│   │   └── requirements.txt
│   ├── sync_engine/
│   │   ├── server.py                 # FastAPI app — port 5004
│   │   ├── engine.py                 # trigger_id gap detection + frame-to-coach assignment
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
├── frontend/                         # React + Vite (Phases 1-6 scaffolded)
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
| 5002 | YOLO Service | Python | YOLOv8 GPU inference (2 models) |
| 5003 | Frame Extractor | Python | OpenCV → Cloudinary |
| 5004 | Sync Engine | Python | trigger_id gap detection → coach mapping |
| 5005 | Correlation | Python | Component manifest validation |
| 5006 | Report Generator | Python | PDF + JSON |

---

## Phase 0 — PostgreSQL Schema + Project Scaffolding ✅

**Done:** Neon PostgreSQL live. All 19 tables pushed via Prisma. Seed data applied (TEST01 + 14 manifests).
`GET http://localhost:8001/health` → `{ status: "ok", db: "connected" }`

---

## Phase 1 — Video Upload + Frame Extraction + Cloudinary ✅

**Done:** Code complete. Awaiting Cloudinary credentials to run end-to-end.

**What was built:**

**Node.js backend (`POST /api/sessions/upload`):**
- Accepts `multipart/form-data`: `train_number` + `video_files[]` + optional `frame_interval` (default 5)
- Saves videos to `backend/uploads/{session_id}/cam_N.mp4`
- Creates: `inspection_sessions` → `cameras` → `session_cameras` → all 6 `pipeline_stages`
- Fire-and-forgets to frame extractor per camera (parallel)
- Returns `202 { session_id, session_code, status: "extracting" }`

**Python frame_extractor (port 5003):**
- Returns immediately, runs extraction as FastAPI background task
- OpenCV → every Nth frame → encode JPEG → upload to `vande/{session_id}/{cam_id}/frame_N.jpg`
- **Sets `trigger_id = frame_number`** (raw video position — sync key across all cameras)
- Bulk-inserts all frame rows via `execute_values` after video ends
- Tracks per-camera `frame_count`, increments session `total_frames`
- When ALL cameras done → marks `frame_extraction` completed → session status → `ocr_running`

**To run frame extractor:**
```bash
cd Main/services/frame_extractor
# Fill CLOUDINARY_* in .env first
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 5003
```

---

## Phase 2 — OCR Pipeline + Coach Mapping ✅

**Done:** Full end-to-end OCR → gap detection → coach mapping pipeline implemented.

### What was built

**Python YOLO service (port 5002):**
- `POST /api/yolo/predict_train_number` — loads `train_num_detector.pt`, returns Boogie bbox list
- `POST /api/yolo/predict` — loads `best.pt`, defect detection (Phase 3 ready)
- Graceful: starts cleanly even if model files not yet present
- Severity map: `crack/leakage/smoke_emission → CRITICAL`, `broken/rust/deformation → HIGH`, `missing_part → MEDIUM`, `loose → LOW`

**Python OCR service (port 5000):**
- `POST /ocr { frame_url, frame_id, trigger_id, session_id }`
- Full YOLO-ROI pipeline: download → YOLO bbox → 15% padded crop → Pass 1 raw BGR → Pass 2 preprocessed → digit substring → full-frame fallback
- Writes `ocr_results` row, returns `{ coach_number, confidence, trigger_id, pass_used, roi_used, is_valid }`

**Python sync_engine (port 5004):**
- `POST /sync { session_id }` — gap detection on trigger_id axis
- MIN_VOTES=5, MAX_TRIGGER_GAP=150
- Creates `coaches` rows with `start_trigger_id`, `end_trigger_id`, `ocr_confidence`
- Bulk-updates `frames.coach_id` (OCR_DIRECT inside segment, GAP_INTERPOLATION for gaps ≤ 3× max_gap)
- Creates `coach_frame_map` rows + `timeline_events` (OCR_ANCHOR + COACH_GAP)

**Node.js backend:**
- `pipelineOrchestrator.js`: `runOcrPipeline(sessionId)` — OCR_CONCURRENCY=4 parallel requests, periodic DB progress updates, calls sync engine on completion
- `POST /api/sessions/:id/process` — triggers OCR pipeline as fire-and-forget, returns 202
- `GET /api/sessions/:id/hierarchy` — real coaches from DB with trigger ranges, frame counts, defect counts

**Run order:**
```bash
# Terminal 1 — YOLO service
cd Main/GPU/yolo && uvicorn server:app --host 0.0.0.0 --port 5002

# Terminal 2 — OCR service (GPU)
cd Main/GPU/ocr && uvicorn server:app --host 0.0.0.0 --port 5000

# Terminal 3 — Sync engine
cd Main/services/sync_engine && uvicorn server:app --host 0.0.0.0 --port 5004

# After frame extraction completes, trigger OCR pipeline:
curl -X POST http://localhost:8001/api/sessions/{session_id}/process
# Poll for progress:
curl http://localhost:8001/api/sessions/{session_id}
# View coaches:
curl http://localhost:8001/api/sessions/{session_id}/hierarchy
```

**Done when:** `GET /api/sessions/:id/hierarchy` returns real coaches mapped from the video.

---

## Phase 3 — YOLO Detection + Defect Intelligence ✅

**Done:** Full defect detection + component correlation + intelligence API implemented.

### What was built

**Python YOLO service (port 5002) — already done in Phase 2, defect endpoint was already wired:**
- `POST /api/yolo/predict` — runs `best.pt`, returns `{detections: [{label, confidence, bbox_xyxy, severity, defect}]}`
- Severity map: `crack/leakage/smoke_emission → CRITICAL`, `broken/rust/deformation/hole → HIGH`, `missing_part/puncture/hanging → MEDIUM`, `loose → LOW`

**Python correlation service (port 5005):**
- `POST /correlate { session_id, coach_id }` — samples every 3rd frame (configurable `CORRELATION_SAMPLE_N`), POSTs to YOLO
- Writes `defects` rows (with bbox, severity, confidence)
- Writes `component_detections` rows (when YOLO label maps to a component code)
- Compares against manifest → writes `missing_components` for any undetected expected component
- Health score: `100 - (CRITICAL×15 + HIGH×8 + MEDIUM×4 + LOW×1 + missing_critical×20 + missing_other×5)`, clamped to [0,100]
- Updates `coaches.critical_defects`, `coaches.missing_components`, `coaches.health_score`

**Node.js orchestrator additions:**
- After sync engine: iterates coaches sequentially, calls `POST /correlate` per coach (5 min timeout each)
- Aggregates `total_defects`, `critical_defects`, `missing_components_count`, `health_score` (average) onto session
- Marks `component_detection` + `defect_analysis` pipeline stages completed
- Sets session `status = 'completed'`, `progress_pct = 100`

**Node.js routes (`/api/sessions`):**
- `GET /:id/coaches/:coachId/intelligence` — returns defects (with frame URL + bbox), component detections, missing components, per-severity summary
- `GET /:id/coaches/:coachId/frames?page=1&limit=50` — paginated frame list with OCR result + assignment method
- `GET /:id/timeline-events` — OCR_ANCHOR + COACH_GAP events in trigger order

**Run order:**
```bash
# Terminal 4 — Correlation service
cd Main/services/correlation
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 5005

# After OCR + sync complete, the orchestrator calls correlation automatically.
# Or test a single coach manually:
curl -X POST http://localhost:5005/correlate \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<id>", "coach_id": "<id>"}'

# Intelligence panel data:
curl http://localhost:8001/api/sessions/<id>/coaches/<coach_id>/intelligence
```

**Note:** Requires `best.pt` in `GPU/yolo/models/` for real defect detection. Without it, YOLO returns 503 and correlation skips that coach (session still completes).

---

## Phase 4 — Report Generation ✅

**Done:** PDF + JSON report generation with Cloudinary upload.

### What was built

**Python report_generator (port 5006):**
- `POST /generate { session_id }` — reads all session data, builds PDF + JSON, uploads to Cloudinary, writes `reports` row
- `GET /report/{session_id}` — returns report metadata

**PDF layout (fpdf2):**
- Cover: train number, session code, date, health score banner (colour-coded green/amber/red)
- Summary KPI table: coaches, frames, defects, critical, missing components
- Per-coach section: defect table (type / severity / confidence / notes), missing components list
- Header + footer on every page

**JSON report:** Full structured dump — session metadata, per-coach defects + missing components — suitable for downstream systems.

**Node.js routes:**
- `POST /api/sessions/:id/report` — triggers generation as fire-and-forget (202), marks `report_generation` stage running
- `GET /api/sessions/:id/report` — returns `{ report_ready, pdf_url, json_url, overall_health, ... }` or 202 with stage status if not ready yet

**Run:**
```bash
cd Main/services/report_generator
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 5006

# Trigger report (session must be in 'analysing' or 'completed'):
curl -X POST http://localhost:8001/api/sessions/<id>/report

# Poll for PDF URL:
curl http://localhost:8001/api/sessions/<id>/report
# → { report_ready: true, pdf_url: "https://res.cloudinary.com/...", ... }
```

**Note:** Cloudinary must be configured in `.env` for upload. Without credentials the PDF is built but URLs will be null — add `CLOUDINARY_*` to `services/report_generator/.env`.

---

## Phase 5 — Frontend Wire-Up ⬜

**Goal:** UI runs on real data, not mock data

- [ ] `frontend/.env` → `VITE_API_BASE_URL=http://localhost:8001`
- [ ] Replace mock sessions → `GET /api/sessions`
- [ ] Replace mock hierarchy → `GET /api/sessions/:id/hierarchy`
- [ ] Replace mock intelligence → `GET /api/sessions/:id/coaches/:coachId/intelligence`
- [ ] Add video upload form → `POST /api/sessions/upload`
- [ ] Pipeline polling every 3s → `GET /api/sessions/:id`
- [ ] Wire report flow → `POST /api/sessions/:id/report` + Cloudinary URL download
- [ ] Dashboard KPIs + live queue → real endpoints

**Done when:** Full flow works end-to-end in the browser with real video.

---

## Phase 6 — WebSocket Live Status ⬜

**Goal:** Pipeline stage updates appear in real-time (no polling)

- [ ] Node.js WebSocket gateway: emit stage events as Python services complete
- [ ] Frontend replaces polling with WebSocket subscription
- [ ] Pipeline Timeline chips animate live: grey → cyan → green
- [ ] Toast: "Synchronization complete. 14 coaches mapped."

---

## Status Tracker

| Phase | Name | Status | Notes |
|---|---|---|---|
| 0 | Schema + Scaffolding | ✅ Done | Neon PG live, 19 tables, health check OK |
| 1 | Video upload + Frame extraction | ✅ Done | Needs Cloudinary creds in `frame_extractor/.env` to run |
| 2 | OCR + Coach mapping | ✅ Done | Sync engine, orchestrator, hierarchy endpoint |
| 3 | YOLO Detection + Defect intelligence | ✅ Done | Needs best.pt model file to run |
| 4 | Report generation (PDF) | ✅ Done | Needs Cloudinary creds for upload |
| 5 | Frontend wire-up | ⬜ Not started | |
| 6 | WebSocket live status | ⬜ Not started | |

**Legend:** ⬜ Not started · 🔄 In progress · ✅ Done · ❌ Blocked

---

## Running Everything (Development)

```bash
# 1. GPU Services (need CUDA + GPU)
cd Main/GPU/yolo  && uvicorn server:app --port 5002   # load best.pt + train_num_detector.pt
cd Main/GPU/ocr   && uvicorn server:app --port 5000   # PaddleOCR

# 2. CPU Pipeline Services
cd Main/services/frame_extractor  && uvicorn server:app --port 5003
cd Main/services/sync_engine      && uvicorn server:app --port 5004
cd Main/services/correlation      && uvicorn server:app --port 5005
cd Main/services/report_generator && uvicorn server:app --port 5006

# 3. Backend API
cd Main/backend && node run.js    # port 8001

# 4. Frontend
cd Main/frontend && npm run dev   # port 5173
```

---

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| API server | Node.js + Fastify | Architecture doc specifies this |
| GPU workers | Python FastAPI | PaddleOCR + PyTorch are Python-only |
| CPU workers | Python FastAPI | Sync engine + correlation + report are Python per arch doc |
| Frame storage | Cloudinary | User requirement — no MinIO for MVP |
| Database | PostgreSQL (Neon) + Prisma | Full schema via Prisma; Neon is the hosted instance |
| Queue | HTTP calls (no RabbitMQ) | Direct orchestrator → service calls for MVP |
| PDF | fpdf2 | Lightweight, no system deps, works on Windows |
| Frame sampling | Every Nth frame (configurable, default 5) | 72,000 frames/train is too many to process all |
| Binary YOLO model | defect=0 / normal=1 | Decided in POC — maximizes recall |
| OCR approach | YOLO-first ROI, not full-frame | YOLO detects bogie in <20ms; PaddleOCR on ~200×100px crop only |
| OCR–YOLO isolation | Separate processes (5000/5002) | PyTorch + PaddlePaddle in same process → CUDA DLL crash on Windows |
| Sync key | trigger_id (NOT timestamps) | Timestamps unreliable; trigger_id = hardware pulse (prod) or raw frame_number (test) |
| VoteManager threshold | 5 hits across trigger_ids | Eliminates false positives from background text |
