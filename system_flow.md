# VandeInspect AI — System Flow

**Machine Vision-based Inspection System (MVIS) for Vande Bharat trains**
A client-facing guide to how data moves through the system: modules, pages, and input → output at every step.

---

## 1. What the System Does (in one line)

A Vande Bharat train passes an inspection zone → multi-camera video is captured → AI reads coach numbers, maps frames to coaches, detects defects and missing parts → an audit-ready report is generated → operators monitor and sign off through a web dashboard.

**Mental model:**

```
Network  →  Station  →  Train Passage  →  Coach  →  Camera  →  Frame  →  Defect  →  Report
```

---

## 2. High-Level Data Flow (one pass, end to end)

```
 [Cameras / Uploaded Video]
            │  raw video (OCR cam + component cams)
            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  BACKEND API (Node + Fastify + Prisma)  — port 8001          │
 │  receives upload, creates session, queues pipeline stages    │
 └─────────────────────────────────────────────────────────────┘
            │ job queue (Redis Streams) — one stage hands off to next
            ▼
 1. Frame Extraction  ──►  2. OCR (coach #)  ──►  3. Synchronization  ──►
 4. Component + Defect Detection  ──►  5. Defect Analysis  ──►  6. Report (manual sign-off)
            │
            │  every stage broadcasts live status over WebSocket
            ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  FRONTEND (React + Vite)  — port 5173/5174                   │
 │  operator watches pipeline live, reviews defects, signs report│
 └─────────────────────────────────────────────────────────────┘
            │
            ▼
 [PostgreSQL: results]   +   [Cloudinary: frames / annotated images / PDF]
```

**Key design facts (so the client understands reliability):**

| Fact | Why it matters to the client |
|---|---|
| Stages run on a **resumable queue** (Redis Streams), not in-memory | If a worker crashes mid-job, the work is not lost — another worker resumes it |
| Cross-camera sync uses a **`trigger_id` key**, not timestamps | Cameras stay aligned even if clocks drift |
| **Report generation is a deliberate manual step**, not auto | A human signs off — compliance/audit requirement, not a bug |
| Live updates pushed over **WebSocket** | Operators see progress in real time, no page refresh |

---

## 3. Modules / Services — Input → Output

Each AI stage is an independent service. The backend orchestrates them through the queue.

| # | Module / Service | Tech | Port | Input | Output |
|---|---|---|---|---|---|
| — | **Backend API** | Node.js + Fastify + Prisma | 8001 | Video upload, page requests | Session records, queued jobs, WebSocket events |
| 1 | **Frame Extractor** | Python + OpenCV | 5003 | Raw video + frames-per-second setting | Extracted frames → uploaded to Cloudinary, rows in DB |
| 2 | **OCR Worker** | Python + PaddleOCR (YOLO-first ROI) | 5000 | OCR-camera frames | Detected coach numbers per frame |
| 3 | **Sync Engine** | Python + gap-detection logic | 5004 | All frames for a session | Frames grouped/mapped into coaches (`coaches_created`) |
| 4 | **Correlation Engine** | Python + YOLOv8 + manifest check | 5005 | One coach at a time | Detected components, defects, missing parts, health score |
| 5 | **Report Generator** | Python + fpdf2 | 5006 | Completed session | PDF + JSON inspection report → Cloudinary |
| — | **Database** | PostgreSQL (Neon) | — | Writes from every stage | Single source of truth for all pages |
| — | **Storage** | Cloudinary | — | Frames, annotated images, PDFs | Hosted URLs shown in UI / report |
| — | **Real-time gateway** | WebSocket (Fastify) | 8001/ws | Stage events from orchestrator | Live push to all open dashboards |

---

## 4. The AI Pipeline — Stage by Stage (Input → Process → Output)

These six stages run in order. Stages 1–5 are automatic; stage 6 is operator-triggered.

| Stage | Input | What happens | Output | Live signal to UI |
|---|---|---|---|---|
| **1. Frame Extraction** | Uploaded videos + FPS | Video split into frames at chosen rate, uploaded to storage | Frame rows + image URLs | `extraction` running → completed |
| **2. OCR Detection** | OCR-camera frames | Reads the coach-number placard on each frame (4 frames at a time) | Coach numbers, count of valid reads | `ocr_detection` progress % |
| **3. Synchronization** | All frames (by `trigger_id`) | Gap detection groups frames into individual coaches | Coaches created + total coach count | `coaches_mapped` event |
| **4. Component Detection** | Each coach | YOLO detects components present per coach | Component list per coach | `component_detection` |
| **5. Defect Analysis** | Detected components vs. manifest | Flags defects, missing parts, severity, health score | Defect records, critical count, health % | `defects_found`, `session_completed` |
| **6. Report Generation** | Completed session | Builds audit PDF + JSON, uploads to storage | PDF + JSON report URL | `report_generation` |

**Session status progression:** `extracting → analysing → completed` (or `failed` at any stage).

---

## 5. Pages — Organized by Journey Layer

Pages are grouped by **how often a user touches them** — daily on top, specialist at the bottom. Same pages, clearer order.

### Layer 1 — Monitor (start of every shift)

| Page | Purpose | Input (what user sees) | Output (what user does) |
|---|---|---|---|
| **Command Center** (Home) | "What needs me now" — active runs, critical defects, offline cameras | Live KPIs | Click a tile → jump into golden path |
| **Stations Map** | All inspection stations + camera health | Station cards | Pick a station → Station Workspace |
| **Dashboard** | Live wallboard — KPIs + animated rake | Live session data | Watch; open active session |

### Layer 2 — Inspect (the core golden path)

| Step | Page | Input | Output |
|---|---|---|---|
| 1 | **Station Workspace** | Selected station (tabs: Inspections / Defects / Reports / History) | Start or open an inspection |
| 2 | **New Inspection** (in Sessions) | OCR cam video + 1–6 component videos + FPS | Upload → pipeline starts |
| 3 | **Live Pipeline** (Sessions row) | Live stage tracker + log stream | Watch AI run in real time |
| 4 | **Train Workspace** (`/train/:id`) | Coaches, defects, synced camera feeds | Inspect coach-by-coach |
| 5 | **Defect Verification** | AI-flagged defects | Approve / reject each |
| 6 | **Reports** | Completed session | Generate → sign → export PDF |

Supporting drill-ins (reached from Train Workspace, not the main menu): **Train Movement Timeline**, **OCR / Coach-# Log**, **Coach Search**, image preview.

### Layer 3 — Analyze (after the run)

| Page | Purpose | Output |
|---|---|---|
| **Analytics** | Defect trends and charts | Patterns over time |
| **Root Cause Analysis** | Why defects cluster | RCA insight |
| **Train Passage History** | Past runs + their reports | Historical lookup |
| **AI Performance Analytics** | Model precision / recall / F1 | Confidence in the AI |

### Layer 4 — Manage (admin / specialist, role-gated)

| Group | Pages | Purpose |
|---|---|---|
| **System Health** | Camera Health, Infrastructure, Data Sync Hub, Railway Asset Management, Image Archive | Keep the hardware + data healthy |
| **AI Lab** | AI Inference, Datasets, AI Training Workbench | Manage and improve the models |
| **Admin** | Audit & Compliance, Settings / User Management | Governance, accounts, roles |

---

## 6. Page → Data Source Mapping

What feeds each key page, so the client sees nothing is "magic".

| Page | Reads from | Updated by |
|---|---|---|
| Command Center / Dashboard | Sessions, defects, camera health | Live WebSocket + polling |
| Stations Map / Workspace | Stations, camera setups, recent sessions | Pipeline results |
| New Inspection | Pipeline config (default FPS) | Backend config |
| Live Pipeline | Pipeline stage records | Each stage as it runs |
| Train Workspace | Coaches, frames, defects for one session | Sync + correlation stages |
| Defect Verification | Defect records | Stage 5 output |
| Reports | Generated PDF / JSON | Stage 6 |
| Analytics / RCA / AI Performance | Aggregated historical results | All completed sessions |

---

## 7. End-to-End Walkthrough (a single inspection, input → output)

| Step | Actor | Action | System Response |
|---|---|---|---|
| 1 | Operator | Logs in | Role decides which pages are visible |
| 2 | Operator | Opens Command Center → picks a station | Station Workspace opens |
| 3 | Operator | Clicks **+ Start Inspection**, uploads 1 OCR video + component videos, sets FPS | Session created, status `extracting` |
| 4 | System | Stage 1–2 run | Frames extracted, coach numbers read — live % shown |
| 5 | System | Stage 3 runs | Coaches mapped (e.g. "16 coaches mapped") |
| 6 | System | Stage 4–5 run per coach | Defects + missing parts flagged, health score computed |
| 7 | System | Session marked `completed` | Operator notified (toast + WebSocket) |
| 8 | Operator | Opens **Train Workspace** | Reviews coaches, defects, camera feeds |
| 9 | Operator | **Verifies** flagged defects | Approves / rejects |
| 10 | Operator | **Generates report**, signs with PIN | Audit PDF + JSON produced and stored |
| — | Output | — | Permanent record + downloadable report; data flows into Analytics & History |

---

## 8. Core Data Entities

| Entity | Holds | Created by |
|---|---|---|
| **Station / Camera Setup** | Physical inspection site + its fixed cameras | Setup / seed |
| **Inspection Session** | One train passage (train #, status, health, critical count) | Upload |
| **Pipeline Stage** | Status of each of the 6 stages for a session | Orchestrator |
| **Frame** | One extracted image + its `trigger_id` and URL | Stage 1 |
| **Coach** | A mapped coach within a session | Stage 3 |
| **Defect** | A detected fault (type, severity, location, image) | Stage 5 |
| **Report** | Final PDF + JSON | Stage 6 |

---

## 9. Roles (who sees what)

| Role | Can do |
|---|---|
| **Field Staff** | View dashboards, inspections, defects (least privilege) |
| **RDSO Inspector** | All of the above + verify defects, sign reports |
| **ZR Officer** | Monitoring + analytics across stations |
| **Admin** | Everything + System Health, AI Lab, Audit, User Management |

Pages are filtered by role in the navigation **and** guarded at the route level — hiding a menu item is not the only protection.

---

## 10. Quick Reference — Ports

| Service | Port |
|---|---|
| Frontend (web UI) | 5173 / 5174 |
| Backend API + WebSocket | 8001 |
| OCR Worker | 5000 |
| YOLO Worker | 5002 |
| Frame Extractor | 5003 |
| Sync Engine | 5004 |
| Correlation Engine | 5005 |
| Report Generator | 5006 |

---

*This document describes the intended end-to-end flow. The golden path (Section 5, Layer 2) is the primary workflow a client should follow to go from raw video to a signed inspection report.*
