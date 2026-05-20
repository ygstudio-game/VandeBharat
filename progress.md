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

## Phase 2 — OCR Pipeline + Coach Mapping ⬜

**Goal:** OCR runs on side-camera frames → coach numbers identified → coaches table populated → hierarchy endpoint returns real data

### Sync key: trigger_id

The orchestrator and sync engine work entirely on `trigger_id`, not timestamps or sequence_number.

```
For each frame (side-camera only, is_ocr_candidate=true):
    call POST /ocr { frame_url, frame_id, trigger_id, session_id }
        ↓
OCR service pipeline (YOLO-first ROI):
    1. Download frame from Cloudinary URL
    2. POST /api/yolo/predict_train_number → get Boogie bbox
    3. Crop with 15% dynamic padding on all 4 sides
    4. Pass 1: PaddleOCR on raw BGR crop
    5. Pass 2 (if Pass 1 empty): grayscale→2×upscale→sharpen→CLAHE→blur → PaddleOCR
    6. Full-frame fallback (if YOLO found no boxes OR both passes empty)
    7. Filter: ^\d{5,6}$ + confidence ≥ 0.4
    8. Return { coach_number, confidence, trigger_id, pass_used, roi_used }
    9. Write ocr_results row
        ↓
VoteManager (in orchestrator, per session):
    Accumulate { coach_number → vote_count } across trigger_ids
    Accept coach_number only after ≥ 5 votes
        ↓
POST /sync { session_id }
Sync engine reads ocr_results ordered by trigger_id:
    Gap detection on trigger_id axis:
        Consistent coach_number for N consecutive trigger_ids → one coach segment
        trigger_id gap (OCR silent) → inter-coach boundary
    Creates coaches rows (coach_number, coach_index, ocr_confidence)
    Sets frames.coach_id for all trigger_ids in each coach's range
    Creates coach_frame_map rows (assignment_method: OCR_DIRECT or GAP_INTERPOLATION)
    Creates timeline_events: OCR_ANCHOR (where OCR fired) + COACH_GAP (boundaries)
```

**Python OCR service (port 5000):**
- [ ] `POST /ocr` — full YOLO-ROI pipeline above
- [ ] Returns `{ coach_number, confidence, trigger_id, pass_used, roi_used, bbox }`
- [ ] Writes `ocr_results` row per call
- [ ] Port core logic from `POC/backend/OCR/server.py` + `ocr_engine.py` + `preprocess.py` + `train_number_filter.py`

**Python YOLO service (port 5002) — partial (OCR ROI endpoint only):**
- [ ] Load `train_num_detector.pt` at startup
- [ ] `POST /api/yolo/predict_train_number` — returns Boogie class bboxes
- [ ] Port from `POC/backend/YOLO/server.py`

**Python sync_engine (port 5004):**
- [ ] `POST /sync` — receives `{ session_id }`
- [ ] Reads `ocr_results` ordered by `trigger_id` for the session
- [ ] Gap detection algorithm on trigger_id axis
- [ ] Creates `coaches` rows
- [ ] Updates `frames.coach_id` for all frames in each trigger_id window
- [ ] Creates `coach_frame_map` rows (OCR_DIRECT + GAP_INTERPOLATION)
- [ ] Creates `timeline_events`
- [ ] Updates `pipeline_stages.status` = `completed` for `synchronization`
- [ ] Updates `inspection_sessions.status` = `analysing`

**Node.js backend — orchestrator additions:**
- [ ] After frame_extraction stage completes → mark `is_ocr_candidate=true` on side-camera frames
- [ ] `pipelineOrchestrator.js`: iterate OCR candidate frames → call OCR service → accumulate votes → after all frames: call sync engine
- [ ] `GET /api/sessions/:id/hierarchy` — Train → Coach → Camera → Frames (real data)
- [ ] `GET /api/sessions/:id/timeline-events` — OCR_ANCHOR + COACH_GAP events

**Done when:** `GET /api/sessions/:id/hierarchy` returns real coaches mapped from the video.

---

## Phase 3 — YOLO Detection + Defect Intelligence ⬜

**Goal:** Defects detected per coach → intelligence panel shows real data with bounding boxes

**Python YOLO service (port 5002) — defect endpoint:**
- [ ] Load `best.pt` at startup (alongside `train_num_detector.pt`)
- [ ] `POST /api/yolo/predict` — receives `{ frame_url }`, runs `best.pt`
- [ ] Returns `{ boxes: [{label, confidence, bbox_xyxy, severity}] }`
  - Severity: `crack/leakage → CRITICAL`, `broken/rust/deformation → HIGH`, `missing_part → MEDIUM`, `loose → LOW`
- [ ] Writes `component_detections` rows

**Python correlation service (port 5005):**
- [ ] `POST /correlate` — receives `{ session_id, coach_id }`
- [ ] Loads manifest from `manifests/vande_bharat.json`
- [ ] Compares expected vs detected components
- [ ] Creates `defects` rows + `missing_components` rows
- [ ] Updates `coaches.critical_defects`, `coaches.missing_components`, `coaches.health_score`

**Node.js backend:**
- [ ] After sync complete: for each coach → batch its frames → call YOLO per frame → call correlation
- [ ] `GET /api/sessions/:id/coaches/:coachId/intelligence` → real components + defects

**Done when:** Intelligence panel shows real defects with bounding box data.

---

## Phase 4 — Report Generation ⬜

**Goal:** Click "Generate Report" → real PDF downloads

**Python report_generator (port 5006):**
- [ ] `POST /generate` — receives `{ session_id }`
- [ ] Reads full session data from PostgreSQL
- [ ] Builds PDF with `fpdf2`: train summary + coach breakdown + annotated defect images
- [ ] Uploads PDF + JSON to Cloudinary
- [ ] Writes `reports` row, sets session status → `completed`

**Node.js backend:**
- [ ] `POST /api/sessions/:id/report` → calls report generator
- [ ] `GET /api/sessions/:id/report/download` → returns Cloudinary PDF URL

**Done when:** Real PDF downloads with train number, coach list, annotated defect evidence.

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
| 2 | OCR + Coach mapping | ⬜ Next | trigger_id design confirmed, ready to implement |
| 3 | YOLO Detection + Defect intelligence | ⬜ Not started | |
| 4 | Report generation (PDF) | ⬜ Not started | |
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
