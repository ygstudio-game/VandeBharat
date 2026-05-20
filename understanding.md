# VandeInspect AI — System Understanding & Deployment Plan

**Date:** 2026-05-20  
**Status:** Pre-deployment planning  
**Author:** Derived from all architecture docs + POC findings

---

## 1. What This System Is

VandeInspect AI is an **industrial AI-powered train inspection platform** for Indian Railways. When a Vande Bharat train passes through an inspection zone, the system:

1. Captures synchronized multi-camera footage
2. Extracts frames and identifies coaches via OCR
3. Maps every frame to the correct coach (synchronization)
4. Runs YOLOv8 component detection + defect detection via GPU
5. Validates missing components against a known manifest
6. Generates an audit-ready inspection report

The user-facing mental model is always: **Train → Coach → Camera → Frame → Component → Defect → Report**. Every screen in the UI revolves around this hierarchy.

---

## 2. What Was Proved in the POC

The `POC/` folder validated the following concepts:

### 2.1 OCR Pipeline (PROVED) — Correct Architecture

The OCR pipeline is a **YOLO-first ROI pipeline**, NOT direct full-frame OCR. This is the critical design that reduces latency.

#### Full pipeline flow (implemented in `POC/backend/OCR/server.py` + `POC/backend/YOLO/server.py`):

```
Full Camera Frame
        ↓
YOLO Service  (port 5002)  —  train_num_detector.pt on GPU
    Endpoint: POST /api/yolo/predict_train_number
    Detects the "Boogie" (bogie) region = area where coach/train number is painted
    Returns: [{ bbox_xyxy, confidence, class_id, label }]
        ↓
ROI Extraction (inside OCR server)
    Priority: "Boogie" class boxes (case-insensitive match)
    Apply 15% dynamic padding on all 4 sides (prevents edge clipping of digits)
    Crop = frame[y1_pad:y2_pad, x1_pad:x2_pad]
        ↓
PaddleOCR  (port 5000)  —  GPU
    Pass 1: PaddleOCR on raw BGR crop
            (preserves sub-pixel chromatic boundaries and natural contrast)
    Pass 2: Only if Pass 1 returns nothing →
            grayscale → 2× upscale → sharpen → CLAHE → Gaussian blur → PaddleOCR
        ↓
Filter: regex  ^\d{5,6}$  + confidence ≥ 0.4
    Also: extract digit-only substrings as secondary fallback
        ↓
VoteManager: accumulates candidates across multiple video frames
    A train number must appear ≥ 5 times before it is accepted
    Prevents false positives from station boards, ads, paint codes
        ↓
Best train number (most voted, above threshold)
```

#### Full-frame fallback (triggered when YOLO finds no boxes OR crop OCR fails):
```
preprocess_frame(full_frame):
    → grayscale → 2× upscale → sharpen kernel → CLAHE → Gaussian blur
    → PaddleOCR on full preprocessed frame
    → same filter + vote logic
```

#### Two YOLO models on one service (port 5002):
| Model | Endpoint | Purpose |
|---|---|---|
| `best.pt` | `/api/yolo/predict` | Defect detection (crack, rust, leakage, deformation, missing_part...) |
| `train_num_detector.pt` | `/api/yolo/predict_train_number` | Detects the bogie ROI region containing the coach/train number |

#### Why ROI first, not full-frame OCR:
- Full-frame OCR on a high-resolution camera image is slow and noisy (picks up background text, ads, other labels)
- YOLO locates the exact region in <20ms on GPU
- PaddleOCR then runs on a small crop (~200×100px) instead of a 5MP frame
- Result: order-of-magnitude latency reduction + dramatically higher OCR accuracy

#### Key implementation files:
- `POC/backend/YOLO/server.py` — loads both models at startup, warm-up pass, two endpoints
- `POC/backend/OCR/server.py` — orchestrates the full pipeline, calls YOLO via HTTP loopback
- `POC/backend/OCR/src/ocr/ocr_engine.py` — PaddleOCR singleton (GPU → CPU fallback), handles both PaddleX v3 dict format and classic nested list format
- `POC/backend/OCR/src/preprocess/preprocess.py` — grayscale + upscale + sharpen + CLAHE + denoise
- `POC/backend/OCR/src/filtering/train_number_filter.py` — `^\d{5,6}$` regex, confidence ≥ 0.4
- `POC/backend/OCR/src/voting/vote_manager.py` — cross-frame voting, threshold = 5 hits

#### Process isolation (why separate processes, not one app):
- PyTorch (YOLO) and PaddlePaddle each load their own CUDA runtime
- On Windows, loading both in the same process causes `0xC0000005` DLL access violation
- Solution: two separate Python processes (Flask apps) communicating over `localhost` HTTP
- No performance penalty — GPU is separate hardware, both models run on `cuda:0` simultaneously

### 2.2 YOLO Defect Detection (PARTIALLY PROVED)
- **Model:** YOLOv8n pretrained base (`yolov8n.pt`) — fine-tuning on merged dataset not yet complete.
- **Strategy decided:** Binary classification (`defect=0` / `normal=1`) across all 12 labeled datasets.
- **Rationale:** Naming conflicts across datasets (e.g., `Battery` vs `Battery box` vs `Battery Box`) make class-level merge risky. Binary approach maximizes recall — the critical safety metric.
- **Next step:** Run `merge_datasets.py` → train → evaluate (`recall > 0.85` target).

### 2.3 Video Stream Integration (PROVED)
- Multi-camera video stream ingestion works.
- React frontend can receive and display annotated frames in real-time.

### 2.4 Frontend Shell (PROVED)
- Vite + React + Tailwind CSS stack is solid.
- All 7 main pages are scaffolded and built with mock data:
  - Dashboard, Sessions, LiveQueue, TrainWorkspace, Reports, Analytics, Infrastructure, Settings.
- Phases 1–6 of the frontend development plan are COMPLETED.
- Phase 7 (Reports / sign-off) is IN PROGRESS.
- Phase 8 (Polish + API integration) is pending.

---

## 3. Full Production Architecture (Target)

### 3.1 Data Flow

```
Camera Hardware Trigger (synchronized)
        ↓
Edge PC (On-Site Firmware)
  - camera-driver (Python/C++)
  - frame-extractor → JPEG frames + metadata
  - local SQLite buffer
  - uploader → MinIO Object Storage
        ↓
MinIO / S3-Compatible Object Storage
  - raw-frames bucket
  - raw-video bucket
  - reports bucket
        ↓
Backend Orchestrator VPS (Node.js + Fastify)
  - Ingestion API
  - Session Manager
  - RabbitMQ queue publisher
  - WebSocket Gateway → Frontend
        ↓
OCR Worker (GPU — Rented Cloud)
  - PaddleOCR on side-camera frames
  - Returns coach mapping + confidence
        ↓
Sync Engine (CPU — Backend VPS, Python)
  - Consumes OCR results + timestamps
  - Gap detection → assigns frames to coaches
  - Writes coach_frame_map → PostgreSQL
        ↓
Detection Worker (GPU — Rented Cloud)
  - YOLOv8 component detection (batched per coach)
  - Binary defect classification
  - Returns bounding boxes → API
        ↓
Correlation Engine (CPU — Backend VPS, Python)
  - Expected vs detected manifest validation
  - Missing component flags
  - Severity scoring
        ↓
Report Generator (CPU — Backend VPS, Python)
  - Train-level PDF + JSON report
  - Stored in MinIO reports bucket
        ↓
Frontend VPS (React / Next.js)
  - Operator dashboard, workspace, reports
```

### 3.2 Deployment Topology

| Layer | Hosting | Tech |
|---|---|---|
| Frontend | VPS (Hostinger / Nginx) | Vite + React (currently), Next.js (target) |
| Backend API | VPS | Node.js + Fastify + RabbitMQ + Redis |
| OCR Worker | Rented GPU VPS | Python + PaddleOCR + CUDA |
| Detection Worker | Rented GPU VPS | Python + YOLOv8 + PyTorch + TensorRT |
| Storage | MinIO VPS or cloud S3 | S3-compatible object storage |
| Database | PostgreSQL (on Backend VPS) | Sessions, coach maps, audit logs |
| Metadata | MongoDB (on Backend VPS) | AI outputs, flexible detection schema |
| Monitoring | Prometheus + Grafana | GPU, queue, camera health telemetry |

### 3.3 Camera Setup

| Camera | Purpose |
|---|---|
| Side OCR Camera | Train/coach number extraction |
| Side Component Cameras (L+R) | Component inspection |
| Bottom Camera | Underbody inspection |
| Suspension Camera | Suspension assembly |
| Wheel Camera | Wheel and brake |
| Overview Camera | Full-train reference |

Spec: 2–5MP, 60–120 FPS, Global Shutter, GigE/CoaXPress, hardware trigger.

---

## 4. Current Build State

### 4.1 Frontend (`Main/frontend/`)

**Stack:** Vite + React + Tailwind CSS + React Router + Lucide Icons + shadcn/ui  
**Theme:** White/Off-White (Vande Bharat branding), Deep Blue text, status color system  
**State:** Mock data only — not yet connected to any backend API  

**Pages completed:**
- `/dashboard` — KPI strip, live train queue, pipeline health
- `/sessions` — inspection sessions table with filtering
- `/live-queue` — real-time queue view
- `/train/:sessionId` — full train workspace (header, pipeline timeline, hierarchy panel, evidence viewer, intelligence panel, bottom frame strip)
- `/reports` — audit reports (Phase 7 in progress)
- `/analytics`, `/infrastructure`, `/settings` — scaffolded

**Not yet done:**
- Phase 7: Reports page sign-off flow
- Phase 8: Loaders, microinteractions, error states polish
- Real API integration (all data is mock)
- WebSocket live pipeline updates
- Canvas/WebGL frame rendering with bounding boxes

### 4.2 Backend (`Main/backend/`)

**Status:** Architecture fully designed in DOC. No code implemented yet.

**Services to build:**
- `api-server` (Node.js + Fastify) — REST + WebSocket
- `session-manager` — train inspection session lifecycle
- `sync-engine` (Python) — OCR consumer, gap detection, coach mapping
- `correlation-engine` (Python) — manifest validation
- `report-generator` (Python) — PDF + JSON assembly
- `queue-publisher` — RabbitMQ job dispatch
- `storage-proxy` — signed URL generation

**Database schema:** Designed (PostgreSQL for relational + MongoDB for AI metadata)

### 4.3 POC (`POC/`)

**Status:** Functional proof-of-concept running.  
**Start command:** `npm run start` from `POC/` root (starts all 4 microservices concurrently).

**What works:**
- YOLOv8 server (port 5002) — loads `best.pt` + `train_num_detector.pt` on GPU
- PaddleOCR server (port 5000) — 2-pass OCR with CLAHE fallback
- FastAPI backend (port 8000) — video ingestion, frame management
- React UI (port 5173) — live OCR display with zoom modal

**What needs to move to Main:**
- The microservice pattern (OCR + YOLO as isolated GPU services)
- The double-pass OCR logic
- The YOLOv8 inference pipeline
- The edge firmware concept for on-site frame extraction

---

## 5. What Needs to Be Done for Deployment

### Priority 1 — Complete Frontend (No new infrastructure needed)
- [ ] Phase 7: Finish `/reports` page with sign-off dialog
- [ ] Phase 8: Add loading states, microinteractions, error handling
- [ ] Deploy frontend to Hostinger VPS under Nginx

### Priority 2 — Backend API Server
- [ ] Scaffold Node.js + Fastify project in `Main/backend/`
- [ ] Implement PostgreSQL schema (sessions, frames, coach map, defects, reports)
- [ ] Implement REST endpoints matching frontend mock data structures
- [ ] Implement WebSocket gateway for live pipeline updates
- [ ] Wire frontend to real API (swap mock data)

### Priority 3 — GPU Worker Services
- [ ] Port OCR pipeline from POC → production OCR worker service
- [ ] Port YOLO pipeline from POC → production detection worker service
- [ ] Connect workers to RabbitMQ job queues
- [ ] Train final `best.pt` (merge 12 datasets, binary defect model, target recall > 0.85)

### Priority 4 — Sync & Correlation Engines
- [ ] Build Python sync engine (gap detection, frame-to-coach mapping)
- [ ] Build correlation engine (expected vs detected component manifest)
- [ ] Build report generator (train-level PDF + JSON)

### Priority 5 — Storage & Infrastructure
- [ ] Set up MinIO (or S3) object storage
- [ ] Configure RabbitMQ message queue
- [ ] Set up Prometheus + Grafana monitoring
- [ ] Set up Edge PC firmware (camera driver + uploader)

---

## 6. Key Architectural Decisions Already Made

| Decision | Choice | Reason |
|---|---|---|
| Defect detection strategy | Binary: defect/normal | Naming conflicts across 12 datasets; maximizes recall; upgradeable to multi-class v2 |
| OCR engine | PaddleOCR v5 (GPU) | Best accuracy on Indian Railways text; GPU accelerated |
| OCR–YOLO isolation | Separate processes (ports 5000/5002) | Windows CUDA DLL conflict between PyTorch and PaddlePaddle |
| Train number validation | `^\d{5,6}$` regex | Eliminates background text, serial codes, logos |
| Frontend framework | Vite + React (MVP) → Next.js (production) | React is already scaffolded and Phases 1-6 complete |
| UI theme | White/Off-White (not dark) | Vande Bharat + Indian Railways branding |
| Queue system | RabbitMQ | Reliable, decoupled AI pipelines |
| Database | PostgreSQL + MongoDB | Relational for sessions/audit; flexible schema for AI outputs |
| Storage | MinIO (S3-compatible) | Self-hosted, cost-effective, audit-safe |

---

## 7. Critical Concept: Synchronization Is Not Timestamp Alignment

The synchronization engine is the heart of the platform. It does NOT merely align timestamps across cameras. It is the stage where raw frames become structured train intelligence:

```
OCR identifies coach markers in side-camera frames
        ↓
Gap detection finds inter-coach boundaries (by gap in OCR detections)
        ↓
Frames between Gap A and Gap B → assigned to Coach B2
        ↓
All cameras' frames for that time window → also assigned to Coach B2
        ↓
Result: Train → Coach → Camera → Frames hierarchy
```

Without this, defects lose context, evidence becomes untraceable, and reports are unreliable.

---

## 8. Immediate Next Action

The frontend is the most complete piece. The logical next step is:

1. **Finish Phase 7 + 8 of frontend** (reports page + polish)
2. **Deploy frontend to Hostinger VPS** (static Nginx deploy)
3. **Scaffold backend API** with mock-compatible endpoints so frontend can be wired up
4. **Port OCR + YOLO workers** from POC to production-grade services

This gives a demonstrable, deployed product while the AI pipeline is completed in parallel.
