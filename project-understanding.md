# VandeInspect AI — Project Understanding

**Date:** 2026-06-20
**Author:** Planning phase analysis

---

## 1. What the Project Does

VandeInspect AI is an industrial AI-powered train inspection platform for Indian Railways (Vande Bharat trains). When a Vande Bharat train passes through an inspection zone, the system:

1. Captures synchronized multi-camera footage (up to 8 cameras)
2. Extracts frames at configurable intervals via OpenCV
3. Identifies coaches via OCR (YOLO-first ROI → PaddleOCR pipeline)
4. Maps every frame to the correct coach using `trigger_id` sync key
5. Runs YOLOv8 binary defect detection (defect/normal) on GPU
6. Validates missing components against a known manifest
7. Generates audit-ready PDF + JSON inspection reports
8. Displays real-time results on a React operator dashboard via WebSocket

User-facing mental model: **Train → Coach → Camera → Frame → Component → Defect → Report**

---

## 2. Technical Stack

| Layer | Technology | Port |
|---|---|---|
| Frontend | Vite + React + Tailwind CSS + shadcn/ui + Recharts | 5173 |
| Backend API | Node.js + Fastify + Prisma ORM | 8001 |
| Database | PostgreSQL (Neon hosted) + Prisma | - |
| OCR Worker | Python FastAPI + PaddleOCR + GPU | 5000 |
| YOLO Worker | Python FastAPI + YOLOv8 + PyTorch + GPU | 5002 |
| Frame Extractor | Python FastAPI + OpenCV | 5003 |
| Sync Engine | Python FastAPI + gap detection logic | 5004 |
| Correlation Engine | Python FastAPI + manifest validation | 5005 |
| Report Generator | Python FastAPI + fpdf2 | 5006 |
| Storage | Cloudinary (frames, annotated frames, PDFs) | - |
| Real-time | WebSocket (Fastify @fastify/websocket) | 8001/ws |

---

## 3. Current Modules and Status

| # | Module | Status | Notes |
|---|---|---|---|
| 1 | Live Train Monitor | ~95% | Phase 6 animated rake diagram on Dashboard pending |
| 2 | Defect Alert Console | DONE | Standalone page + embedded on Dashboard |
| 3 | Virtual Train Inspection Portal | DONE | 3D skipped by design decision |
| 4 | Coach Search | DONE | Search by coach/train number |
| 5 | OCR Results Log | DONE | Paginated, filterable, exportable |
| 6 | Defect Analytics | DONE | 4 Recharts charts, export |
| 7 | Camera Health Monitor | DONE | Real DB data, uptime %, alerts |
| 8 | System Health Dashboard | DONE | Simulated GPU/CPU/SSD/UPS metrics |
| 9 | Historical Reports | DONE | Periodic reports (shift/day/week), FP/FN log |
| 10 | User Management | 40% | Frontend UI only; backend auth/RBAC/2FA deferred |
| 11 | AI Inference Management | NOT STARTED | Model registry, FPS/latency monitoring |
| 12 | Defect Verification Console | NOT STARTED | Human approve/reject, retraining dataset |
| 13 | Train Movement Timeline | NOT STARTED | Event timeline, playback |
| 14 | Image Archive Management | NOT STARTED | Long-term storage, retention policy |
| 15 | Train Passage History | NOT STARTED | Historical train runs dashboard |
| 16 | AI Performance Analytics | NOT STARTED | Precision/Recall/F1/mAP metrics |
| 17 | Operations Command Center | NOT STARTED | Unified single-screen ops view |
| 18 | Data Synchronization Hub | 30% | HTTP direct calls; no RabbitMQ/Kafka yet |
| 19 | Audit & Compliance | 30% | Backend deferred; frontend preview only |
| 20 | Railway Asset Management | NOT STARTED | Maintenance schedule, asset lifecycle |
| 21 | Station Monitoring Dashboard | NOT STARTED | Multi-station view |
| 22 | Dataset Management Portal | NOT STARTED | Training dataset registry, upload, versioning |
| 23 | Root Cause Analysis Dashboard | NOT STARTED | Defect correlation, RCA reports |
| 24 | AI Model Training Workbench | NOT STARTED | Full training pipeline UI |

---

## 4. What Is Completed

**Core AI Pipeline (production-ready flow):**
- Video upload → Frame extraction → OCR coach identification → Coach mapping (sync engine) → YOLO defect detection → Component correlation → PDF/JSON report generation
- WebSocket gateway for real-time pipeline stage broadcasts
- `trigger_id` based cross-camera synchronization (not timestamp-based)
- Two-pass PaddleOCR with YOLO-first ROI (dramatically better accuracy/speed)
- Binary defect model (defect/normal) on YOLOv8n

**Frontend (12 pages, all wired to real API):**
- Dashboard / Live Train Monitor
- Sessions (upload + list)
- TrainWorkspace / Virtual Inspection Portal
- Defect Analytics
- Camera Health Monitor
- Coach Search
- OCR Results Log
- Defect Alert Console
- System Health Dashboard
- Historical Reports
- Settings / User Management (UI preview)
- Live Queue

**Backend (17 route files):**
- sessions, coaches, intelligence, analytics, cameraHealth, ocrResults, periodicReports, reports, users, reviewLog (global), modelVersions, trainingExport, auditLog, dashboard, health, auth, config

**Dashboard Modules Progress:** Phases 0–5 complete (Coach Search, OCR Log, Defect Alert Console, Defect Analytics, Camera Health, System Health, User Management UI, Historical Reports).

---

## 5. What Is Incomplete

### High Priority Gaps
1. **Live Train Monitor Phase 6** — animated rake visualization on Dashboard not yet surfaced
2. **User Management backend** — RBAC enforcement, 2FA TOTP, user migration, audit log wiring
3. **AI Inference Management** — model registry, FPS/latency/GPU monitoring panel
4. **Defect Verification Console** — human-in-the-loop approve/reject + retraining dataset builder
5. **Train Movement Timeline** — timeline UI, event collection service, playback feature
6. **AI Performance Analytics** — precision/recall/F1/mAP tracking across model versions
7. **Data Synchronization Hub** — RabbitMQ/Kafka integration (currently plain HTTP)

### Medium Priority Gaps
8. **Audit & Compliance** — backend activity tracking, real audit log
9. **Train Passage History** — historical train runs dashboard with filtering
10. **Image Archive Management** — retention policy, long-term storage, retrieval optimization
11. **Operations Command Center** — unified single-screen view with incident tracking

### Lower Priority Gaps
12. **Root Cause Analysis Dashboard** — defect correlation engine, RCA reports
13. **AI Model Training Workbench** — full training lifecycle UI
14. **Dataset Management Portal** — training dataset upload/versioning
15. **Station Monitoring Dashboard** — multi-station aggregation
16. **Railway Asset Management** — maintenance schedule tracking

---

## 6. Major Risks

| Risk | Impact | Mitigation |
|---|---|---|
| No physical GPU/Jetson available | System Health Dashboard returns simulated data | Add `simulated: true` flag; plan hardware swap |
| `best.pt` model not finalized | YOLO correlation skips coaches (503 fallback) | Build merge_datasets pipeline; train binary model |
| Cloudinary dependency | PDFs/frames require paid account | Local MinIO fallback path in report_generator |
| PostgreSQL Neon free tier limits | Concurrent sessions may hit connection caps | Add connection pooling (PgBouncer or Prisma pool) |
| RabbitMQ not implemented | Data sync is brittle HTTP; no retry on failure | Implement proper queue for production hardening |
| Backend RBAC not enforced | All routes accessible without auth | Auth middleware must be added before production |
| No real hardware camera integration | Frame extraction only tested with video files | Edge PC firmware design already planned |

---

## 7. Suggested Execution Approach

### Week 1 (Days 1–5): High-impact incomplete modules
- Day 1: Finish Live Train Monitor (rake animation) + User Management backend
- Day 2: AI Inference Management (model registry + monitoring)
- Day 3: Defect Verification Console (human-in-the-loop)
- Day 4: Train Movement Timeline + AI Performance Analytics
- Day 5: Data Synchronization Hub (RabbitMQ) + Audit & Compliance

### Week 2 (Days 6–10): Remaining + QA
- Day 6: Train Passage History + Image Archive Management
- Day 7: Operations Command Center + Station Monitoring Dashboard
- Day 8: Root Cause Analysis Dashboard
- Day 9: AI Model Training Workbench + Dataset Management Portal + Railway Asset Management
- Day 10: QA, regression testing, deployment readiness, documentation

### Key Principles
- One module at a time; test before moving on
- Reuse existing patterns (Recharts for charts, existing route structure, existing Prisma models)
- Backend routes first → Frontend wiring → QA
- Do not break existing working pipeline phases (0–6)
