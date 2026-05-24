<!-- converted from VandeBharat_TechDoc.docx -->

VandeBharat Inspect
AI-Powered Train Coach Inspection System

Technical Documentation  ·  May 2026

# 1. Project Overview
VandeBharat Inspect is a real-time, multi-camera AI pipeline that automatically inspects Vande Bharat train coaches as they pass through a station. The system captures video from multiple fixed cameras, extracts frames, reads coach numbers using OCR, detects bogie gaps using YOLO, correlates all camera feeds, and produces a structured inspection report — all without manual intervention.

## 1.1  System Architecture
Eight independent microservices communicate over HTTP:
- YOLO Service (:5002) — Detects Boogie, Car Type, Engine, and Gap bounding boxes
- OCR Service (:5000) — Downloads frame, calls YOLO for ROI, runs PaddleOCR, writes results to DB
- Frame Extractor (:5003) — Pulls frames from video at configured FPS, uploads to Cloudinary
- Sync Engine (:5004) — Groups frames into coach segments using gap detections or OCR voting
- Correlation Engine (:5005) — Cross-links detections across camera feeds
- Report Generator (:5006) — Produces final inspection report per session
- Backend (Node.js) (:8001) — REST API, Prisma ORM, Neon PostgreSQL
- Frontend (Vite/React) (:5173) — Train Workspace UI, HierarchyTree, Timeline

## 1.2  Database
Hosted on Neon (serverless PostgreSQL). Key tables:
- inspection_sessions — one row per train pass
- frames             — every extracted frame (all cameras)
- ocr_results        — PaddleOCR output per frame
- gap_detections     — YOLO 'gap' class hits per frame
- coaches            — one row per detected bogie/coach
- coach_frame_map    — many-to-one: frame → coach assignment
- timeline_events    — OCR_ANCHOR and GAP_BOUNDARY markers
- component_detections — YOLO component hits (Boogie, Car Type, Engine)

# 2. Development Phases
## Phase 1 — Basic Video Streaming & Frame Extraction
The first milestone was establishing a live video stream from an IP camera and extracting frames at a configurable rate. The Frame Extractor service was built as a standalone FastAPI server. Frames were stored locally, then later migrated to Cloudinary for CDN delivery to the OCR and YOLO workers.
Key deliverables:
- Frame Extractor service (port 5003)
- Cloudinary upload integration
- Trigger-ID concept introduced — all cameras share the same monotonically increasing trigger counter so frames captured at the same instant share a trigger_id
- PostgreSQL schema for sessions + frames

## Phase 2 — OCR Pipeline (PaddleOCR, no ROI)
Initial OCR ran PaddleOCR on the full frame. Results were filtered with a regex ^\d{5,6}$ to accept only valid 5–6 digit coach numbers above a 0.4 confidence threshold. This worked but was slow and noisy on cluttered frames.
Problems encountered:
- High false-positive rate from background text
- GPU memory spikes when multiple frames processed concurrently
- PaddleOCR angle classifier (use_angle_cls=True) caused thread-unsafe crashes under concurrent requests (RuntimeError: Tensor holds no memory)
Fix:
- Angle classifier disabled (use_angle_cls=False) — train numbers are always horizontal so accuracy was unaffected
- OCR concurrency limited to 1 in config.json (ocr_concurrency: 1)

## Phase 3 — YOLO ROI Detection (Boogie Class)
A YOLOv8 model was trained to detect the Boogie (bogie number plate) region. The OCR service was updated to call YOLO first, crop the detected region with 15% padding, then pass only the crop to PaddleOCR. This dramatically reduced false positives and improved recognition speed.
Two-pass OCR strategy:
- Pass 1 — raw BGR crop → PaddleOCR
- Pass 2 — preprocessed (denoised, contrast-enhanced) crop → PaddleOCR
- Digit substring fallback — extract any 5–6 digit run from detected text
- Full-frame fallback — if YOLO finds no boxes, run on whole frame
OCR pipeline return tuple (7 values):
(coach_number, confidence, pass_used, roi_used, bbox, raw_ocr, all_yolo_boxes)

## Phase 4 — Multi-Class YOLO (Boogie, Car Type, Engine, Gap)
The YOLO model was retrained to detect four classes. The Gap class was the critical addition — the physical gap between bogies is a reliable, camera-visible boundary that can replace OCR-number voting as the primary synchronisation signal.
- Boogie  — coach number plate region
- Car Type — car type label
- Engine  — locomotive unit
- Gap     — inter-bogie gap (NEW — used for sync)
All four classes are returned in the OCR service response under yolo_boxes, and Gap detections are written to the gap_detections table on every OCR call.

## Phase 5 — Gap-Boundary Synchronisation & Multi-Camera Correlation
This phase replaced the fragile OCR-voting sync with a physically-grounded algorithm driven by gap detections. Details are covered in Section 4.
- Sync Engine rewritten with gap-boundary primary path and OCR-voting fallback
- ocr_frame_count column added to coaches table and populated by sync engine
- HierarchyTree OCR Anchors count fixed to read real ocr_frame_count from API
- Component frame filtering added to timeline (click Component Frames node)
- DevLab testing tool built alongside production services

# 3. OCR Pipeline — Detailed Walkthrough
Every extracted frame triggers a POST /ocr request to the OCR service. The request carries frame_url (Cloudinary), frame_id, trigger_id, and session_id.
## 3.1  Step-by-Step Flow
- Frame downloaded from Cloudinary URL via requests.get()
- Frame sent to YOLO service as a multipart JPEG — returns bounding boxes for all classes
- If a Boogie box exists, crop it with 15% padding on all sides
- Pass 1: run_ocr(crop) — PaddleOCR on raw BGR crop
- If no valid 5-6 digit number found: Pass 2: run_ocr(preprocess_frame(crop))
- If still nothing: digit_substring fallback extracts any 5-6 digit run from OCR text
- If YOLO found no boxes at all: full-frame fallback with preprocessing
- Result written to ocr_results table
- All Gap boxes written to gap_detections table
- Response returned including yolo_boxes list (all classes)

## 3.2  Preprocessing Pipeline
preprocess_frame() applies the following in sequence:
- Grayscale conversion
- CLAHE (contrast-limited adaptive histogram equalisation) for uneven lighting
- Gaussian blur to reduce sensor noise
- Otsu thresholding to binarise
- Morphological dilation to thicken digits
- Converted back to 3-channel for PaddleOCR input compatibility

## 3.3  Train Number Filter
filter_train_numbers() accepts raw PaddleOCR output and returns only candidates matching ^\d{5,6}$ with confidence >= 0.4. The best candidate (highest confidence) is selected as the coach_number for that frame.

## 3.4  Database Writes
On every OCR call two DB operations happen inside a single transaction:
- INSERT into ocr_results (one row per frame) — stores coach_number, confidence, pass_used, is_valid, bbox, raw JSON response
- INSERT into gap_detections (one row per Gap box detected by YOLO) — stores trigger_id, confidence, bbox

# 4. Synchronisation — Problem & Solution
## 4.1  The Problem
A train inspection uses multiple cameras simultaneously. Each camera sees a different angle of the same bogie at the same moment. The system assigns all frames captured at the same trigger_id to a single logical bogie. The challenge: how do you know where one bogie ends and the next begins?
Original approach — OCR voting:
- Scan OCR results ordered by trigger_id
- When the same coach number appears in consecutive triggers → one bogie segment
- A gap of more than sync_max_trigger_gap (150) triggers without a consistent number → segment boundary
Why this failed:
- If the OCR camera is not facing the number plate (e.g., viewing the side), it sees nothing — breaks the segment
- Multiple cameras may disagree on the coach number for the same trigger
- Segments were wrong or merged when trains moved at irregular speeds
- UNKNOWN coaches were created for every gap in OCR readings, not just real bogie boundaries

## 4.2  The Solution — Gap-Boundary Synchronisation
The physical gap between two bogies is always visible to the camera and is a definitive boundary. YOLO's Gap class detects this gap on every frame where it is visible. Instead of relying on what the coach number reads, the system now relies on where the gap is.
Algorithm:
- Load all gap_detections for the session where confidence >= GAP_MIN_CONFIDENCE (0.4)
- Cluster consecutive detections within GAP_CLUSTER_RADIUS (30 trigger_ids) of each other — the same physical gap appears in many frames as the train moves
- Pick the highest-confidence detection from each cluster as the canonical boundary trigger_id
- Build bogie ranges: [session_start … boundary_0), [boundary_0 … boundary_1), … , [boundary_N … session_end]
- For each range, query ocr_results for the best coach_number (is_valid=TRUE preferred)
- Create one coaches row per range; insert all frames into coach_frame_map by trigger range
- Create timeline_events: OCR_ANCHOR per identified coach, GAP_BOUNDARY per detected gap
- Update total_frames and ocr_frame_count on each coach row

## 4.3  Fallback — OCR Voting
If no gap_detections exist for the session (e.g., old data captured before the Gap YOLO class existed), the engine falls back to the original OCR voting algorithm. The fallback is fully preserved in _ocr_voting_fallback() and produces coaches with method = 'ocr_voting'.

## 4.4  Configuration
Tunable parameters in config.json → pipeline section:
sync_gap_cluster_radius   : 30    # trigger_ids; same gap seen within this window = one boundary
sync_gap_min_confidence   : 0.4   # minimum YOLO confidence to accept a gap detection
sync_min_votes            : 1     # OCR fallback: minimum OCR hits to form a segment
sync_max_trigger_gap      : 150   # OCR fallback: max trigger gap before new segment

# 5. Running Multiple AI Models Without DLL Conflicts
## 5.1  The Problem
The system runs two GPU-accelerated models simultaneously: YOLOv8 (PyTorch/Ultralytics) and PaddleOCR (PaddlePaddle). Both frameworks ship their own CUDA runtime DLLs (cudart64_*.dll, cublas64_*.dll, etc.). When loaded in the same Python process, DLL version mismatches cause one or both models to crash at inference time.
Symptoms observed:
- RuntimeError: CUDA error: no kernel image is available for execution on the device
- DLL load failed: the specified module could not be found (cublas64_11.dll vs cublas64_12.dll)
- Process crash on first inference after startup — model warmed up fine but failed on real data
- PaddleOCR RuntimeError: Tensor holds no memory — caused by thread-unsafe angle classifier under concurrent requests

## 5.2  Root Cause
PyTorch (used by Ultralytics YOLO) and PaddlePaddle compile against different CUDA toolkit versions. When both are imported in the same Python interpreter, whichever CUDA runtime DLL loads first 'wins'; the other framework then tries to call functions that do not exist in that DLL version and crashes.
Thread-safety issue (separate from DLL conflict):
PaddleOCR's angle classifier (use_angle_cls=True) uses an internal state variable that is not protected by a mutex. Under concurrent HTTP requests, two threads enter the angle detection branch simultaneously and corrupt the tensor handle, producing 'Tensor holds no memory'.

## 5.3  Solution — Process Isolation
Each model runs in its own dedicated Python process (microservice). They share no memory space and therefore no DLL conflict can occur.
- YOLO Service  (port 5002) — runs PyTorch / Ultralytics only
- OCR Service   (port 5000) — runs PaddlePaddle / PaddleOCR only
The OCR service calls the YOLO service over HTTP. The YOLO service returns JSON bounding boxes; the OCR service uses them for cropping. No GPU tensor crosses the process boundary — only plain JSON.

## 5.4  Additional Fixes Applied
Angle classifier disabled in OCR service:
# ocr_engine.py
ocr = PaddleOCR(use_angle_cls=False, lang='en', use_gpu=True)
Setting use_angle_cls=False removes the thread-unsafe code path entirely. Train coach numbers are always printed horizontally so detection accuracy is not affected.
OCR concurrency locked to 1:
# config.json  →  "ocr_concurrency": 1
Even with the angle classifier disabled, PaddleOCR's GPU memory allocator is not fully re-entrant. Limiting concurrency to 1 ensures sequential inference while still allowing the pipeline to queue frames.
GPU warm-up on startup:
# server.py  @app.on_event('startup')
blank = np.zeros((100, 300, 3), dtype='uint8')
run_ocr(blank)  # forces CUDA context initialisation before first real request
Without warm-up the first real request bears the full CUDA initialisation cost (~3 s) and can time out in high-throughput scenarios.

# 6. Other Bugs & Fixes Log
## 6.1  BigInt serialization error in Node.js
Problem:
Postgres BIGINT columns (trigger_id, start_trigger_id, end_trigger_id) returned as JavaScript BigInt by Prisma. JSON.stringify() throws 'Do not know how to serialize a BigInt'.
Fix:
Added BigInt.prototype.toJSON = function() { return Number(this); } at the top of backend/src/index.js and devlab/backend/src/index.js. Safe for trigger_id values which are well within Number.MAX_SAFE_INTEGER.

## 6.2  Devlab backend 500 on all routes
Problem:
Devlab backend started without a .env file — DATABASE_URL was undefined, causing every Prisma call to throw at connection time.
Fix:
Created devlab/backend/.env with DATABASE_URL pointing to the shared Neon PostgreSQL instance, plus service URL overrides and PORT=8002.

## 6.3  dev_ocr_runs table missing
Problem:
Running prisma db push from the main backend schema would drop the devlab-only tables (dev_ocr_runs, dev_sync_runs) not present in the main schema.
Fix:
Always run prisma db push from devlab/backend/ whose schema.prisma is a superset that includes both the production tables and the dev-only tables.

## 6.4  coach_frame_maps (plural) Prisma error
Problem:
intelligence.js queried frame.coach_frame_maps which does not exist — the Prisma relation is named coach_frame_map (singular, one-to-one).
Fix:
Renamed all references in intelligence.js to coach_frame_map and removed the [0] array index since the relation returns a single object, not an array.

## 6.5  OCR Anchors always showing 0
Problem:
HierarchyTree.jsx normalizeCoach() computed ocrFramesCount as Math.floor(total_frames * 0.15) — a hardcoded estimate, always near zero for coaches with few frames.
Fix:
Changed to c.ocr_frame_count from the API response. Added ocr_frame_count to the hierarchy route response and added an UPDATE coaches SET ocr_frame_count = ... query to the sync engine (both gap and OCR-voting paths).

## 6.6  Port conflicts on restart
Problem:
Repeatedly starting and stopping services left stale processes occupying ports 5173, 5174, 8001, 8002, causing EADDRINUSE on the next start.
Fix:
Added killPort() to start.js and devlab/start.js using netstat -ano | findstr :<PORT> to find the PID and taskkill /PID <n> /F to terminate it before binding the new process.

## 6.7  Parallel YOLO + OCR call (wrong architecture)
Problem:
An early implementation called the YOLO service in parallel with the OCR service from the Node.js backend, then merged the results. This broke the intended sequence where OCR internally calls YOLO for ROI detection.
Fix:
Reverted to a single POST /ocr call. The OCR service calls YOLO internally and returns yolo_boxes in its response. The Node.js backend reads serviceResult.yolo_boxes and stores it alongside the OCR result.


# 7. DevLab — Developer Testing Tool
DevLab is a separate React + Express application (frontend :5174, backend :8002) that shares the production Neon database. It provides manual testing interfaces for each microservice without going through the full orchestrated pipeline.
## 7.1  Modules
- OCR Tester — select a session/trigger, run OCR on individual frames, view YOLO bounding boxes (Boogie=blue, Car Type=amber, Engine=green, Gap=orange) and OCR overlay toggle
- Sync Tester — trigger sync engine for a session, view coach segments and gap boundary count
- Component Tester — browse coach frames with component detection overlays
- Session Browser — list sessions, frame counts, status
## 7.2  YOLO Box Overlay
YOLO bounding boxes displayed in DevLab come directly from the OCR service response (yolo_boxes field) — no separate YOLO HTTP call is made from the frontend. This preserves the intended call sequence and avoids double-counting GPU time.

# 8. Configuration Reference — config.json
- pipeline.frames_per_second  (default: 1) — Frame extraction rate per camera
- pipeline.ocr_concurrency  (default: 1) — Max parallel OCR workers (keep at 1 for GPU safety)
- pipeline.db_flush_every_n_frames  (default: 10) — Batch DB writes every N frames
- pipeline.sync_min_votes  (default: 1) — OCR fallback: min OCR hits to form a segment
- pipeline.sync_max_trigger_gap  (default: 150) — OCR fallback: max trigger gap between same coach hits
- pipeline.sync_gap_cluster_radius  (default: 30) — Gap sync: cluster radius (trigger_ids)
- pipeline.sync_gap_min_confidence  (default: 0.4) — Gap sync: minimum YOLO gap confidence
- upload.max_file_size_gb  (default: 2) — Maximum video upload size
- upload.max_cameras  (default: 10) — Maximum simultaneous camera feeds

# 9. Running the System
## 9.1  Production Services
cd E:/PROJECTS/VandeBharat/Main
node start.js
Starts all 8 services in order. Kills any stale process on ports 5173, 8001 before binding.
## 9.2  DevLab
cd E:/PROJECTS/VandeBharat/Main/devlab
node start.js
Kills stale processes on 8002 and 5174, then starts backend (nodemon) and frontend (Vite).
## 9.3  GPU Services (separate terminal — GPU machine)
cd E:/PROJECTS/VandeBharat/Main/GPU/ocr
uvicorn server:app --host 0.0.0.0 --port 5000

cd E:/PROJECTS/VandeBharat/Main/GPU/yolo
uvicorn server:app --host 0.0.0.0 --port 5002