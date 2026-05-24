"""
Run this script once to generate VandeBharat_TechDoc.docx
  python generate_docs.py
"""
from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import datetime

doc = Document()

# ── Page margins ──────────────────────────────────────────────────────────────
for section in doc.sections:
    section.top_margin    = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin   = Cm(3)
    section.right_margin  = Cm(2.5)

# ── Helper functions ──────────────────────────────────────────────────────────
def heading(text, level=1):
    doc.add_heading(text, level=level)

def para(text, bold=False, italic=False, color=None):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold   = bold
    run.italic = italic
    if color:
        run.font.color.rgb = RGBColor(*color)
    return p

def bullet(text, level=0):
    p = doc.add_paragraph(text, style='List Bullet')
    p.paragraph_format.left_indent = Inches(0.25 * (level + 1))
    return p

def numbered(text):
    return doc.add_paragraph(text, style='List Number')

def code_block(text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent  = Inches(0.4)
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after  = Pt(2)
    run = p.add_run(text)
    run.font.name = 'Courier New'
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor(0x1e, 0x40, 0xaf)  # dark blue
    shading = OxmlElement('w:shd')
    shading.set(qn('w:val'),   'clear')
    shading.set(qn('w:color'), 'auto')
    shading.set(qn('w:fill'),  'F1F5F9')
    p._p.pPr.append(shading)
    return p

def separator():
    doc.add_paragraph()

def info_row(label, value):
    p = doc.add_paragraph()
    r1 = p.add_run(f"{label}: ")
    r1.bold = True
    p.add_run(value)

# ── Cover page ────────────────────────────────────────────────────────────────
title_p = doc.add_paragraph()
title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = title_p.add_run("VandeBharat Inspect")
r.bold      = True
r.font.size = Pt(28)
r.font.color.rgb = RGBColor(0x1e, 0x40, 0xaf)

subtitle_p = doc.add_paragraph()
subtitle_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r2 = subtitle_p.add_run("AI-Powered Train Coach Inspection System")
r2.font.size = Pt(14)
r2.font.color.rgb = RGBColor(0x64, 0x74, 0x8b)

doc.add_paragraph()
meta_p = doc.add_paragraph()
meta_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
meta_p.add_run(f"Technical Documentation  ·  {datetime.date.today().strftime('%B %Y')}")

doc.add_page_break()

# ══════════════════════════════════════════════════════════════════════════════
# 1.  PROJECT OVERVIEW
# ══════════════════════════════════════════════════════════════════════════════
heading("1. Project Overview")
para(
    "VandeBharat Inspect is a real-time, multi-camera AI pipeline that automatically inspects "
    "Vande Bharat train coaches as they pass through a station. The system captures video "
    "from multiple fixed cameras, extracts frames, reads coach numbers using OCR, detects "
    "bogie gaps using YOLO, correlates all camera feeds, and produces a structured inspection "
    "report — all without manual intervention."
)
separator()

heading("1.1  System Architecture", level=2)
para("Eight independent microservices communicate over HTTP:")
services = [
    ("YOLO Service",          ":5002", "Detects Boogie, Car Type, Engine, and Gap bounding boxes"),
    ("OCR Service",           ":5000", "Downloads frame, calls YOLO for ROI, runs PaddleOCR, writes results to DB"),
    ("Frame Extractor",       ":5003", "Pulls frames from video at configured FPS, uploads to Cloudinary"),
    ("Sync Engine",           ":5004", "Groups frames into coach segments using gap detections or OCR voting"),
    ("Correlation Engine",    ":5005", "Cross-links detections across camera feeds"),
    ("Report Generator",      ":5006", "Produces final inspection report per session"),
    ("Backend (Node.js)",     ":8001", "REST API, Prisma ORM, Neon PostgreSQL"),
    ("Frontend (Vite/React)", ":5173", "Train Workspace UI, HierarchyTree, Timeline"),
]
for name, port, desc in services:
    bullet(f"{name} ({port}) — {desc}")

separator()
heading("1.2  Database", level=2)
para("Hosted on Neon (serverless PostgreSQL). Key tables:")
tables = [
    "inspection_sessions — one row per train pass",
    "frames             — every extracted frame (all cameras)",
    "ocr_results        — PaddleOCR output per frame",
    "gap_detections     — YOLO 'gap' class hits per frame",
    "coaches            — one row per detected bogie/coach",
    "coach_frame_map    — many-to-one: frame → coach assignment",
    "timeline_events    — OCR_ANCHOR and GAP_BOUNDARY markers",
    "component_detections — YOLO component hits (Boogie, Car Type, Engine)",
]
for t in tables:
    bullet(t)

doc.add_page_break()

# ══════════════════════════════════════════════════════════════════════════════
# 2.  DEVELOPMENT PHASES
# ══════════════════════════════════════════════════════════════════════════════
heading("2. Development Phases")

# Phase 1
heading("Phase 1 — Basic Video Streaming & Frame Extraction", level=2)
para(
    "The first milestone was establishing a live video stream from an IP camera and extracting "
    "frames at a configurable rate. The Frame Extractor service was built as a standalone "
    "FastAPI server. Frames were stored locally, then later migrated to Cloudinary for CDN "
    "delivery to the OCR and YOLO workers."
)
para("Key deliverables:", bold=True)
bullet("Frame Extractor service (port 5003)")
bullet("Cloudinary upload integration")
bullet("Trigger-ID concept introduced — all cameras share the same monotonically increasing trigger counter so frames captured at the same instant share a trigger_id")
bullet("PostgreSQL schema for sessions + frames")

separator()

# Phase 2
heading("Phase 2 — OCR Pipeline (PaddleOCR, no ROI)", level=2)
para(
    "Initial OCR ran PaddleOCR on the full frame. Results were filtered with a regex "
    r"^\d{5,6}$ to accept only valid 5–6 digit coach numbers above a 0.4 confidence "
    "threshold. This worked but was slow and noisy on cluttered frames."
)
para("Problems encountered:", bold=True)
bullet("High false-positive rate from background text")
bullet("GPU memory spikes when multiple frames processed concurrently")
bullet("PaddleOCR angle classifier (use_angle_cls=True) caused thread-unsafe crashes under concurrent requests (RuntimeError: Tensor holds no memory)")
para("Fix:", bold=True)
bullet("Angle classifier disabled (use_angle_cls=False) — train numbers are always horizontal so accuracy was unaffected")
bullet("OCR concurrency limited to 1 in config.json (ocr_concurrency: 1)")

separator()

# Phase 3
heading("Phase 3 — YOLO ROI Detection (Boogie Class)", level=2)
para(
    "A YOLOv8 model was trained to detect the Boogie (bogie number plate) region. The OCR "
    "service was updated to call YOLO first, crop the detected region with 15% padding, then "
    "pass only the crop to PaddleOCR. This dramatically reduced false positives and improved "
    "recognition speed."
)
para("Two-pass OCR strategy:", bold=True)
numbered("Pass 1 — raw BGR crop → PaddleOCR")
numbered("Pass 2 — preprocessed (denoised, contrast-enhanced) crop → PaddleOCR")
numbered("Digit substring fallback — extract any 5–6 digit run from detected text")
numbered("Full-frame fallback — if YOLO finds no boxes, run on whole frame")
para("OCR pipeline return tuple (7 values):", bold=True)
code_block("(coach_number, confidence, pass_used, roi_used, bbox, raw_ocr, all_yolo_boxes)")

separator()

# Phase 4
heading("Phase 4 — Multi-Class YOLO (Boogie, Car Type, Engine, Gap)", level=2)
para(
    "The YOLO model was retrained to detect four classes. The Gap class was the critical "
    "addition — the physical gap between bogies is a reliable, camera-visible boundary that "
    "can replace OCR-number voting as the primary synchronisation signal."
)
bullet("Boogie  — coach number plate region")
bullet("Car Type — car type label")
bullet("Engine  — locomotive unit")
bullet("Gap     — inter-bogie gap (NEW — used for sync)")
para(
    "All four classes are returned in the OCR service response under yolo_boxes, and Gap "
    "detections are written to the gap_detections table on every OCR call."
)

separator()

# Phase 5
heading("Phase 5 — Gap-Boundary Synchronisation & Multi-Camera Correlation", level=2)
para(
    "This phase replaced the fragile OCR-voting sync with a physically-grounded algorithm "
    "driven by gap detections. Details are covered in Section 4."
)
bullet("Sync Engine rewritten with gap-boundary primary path and OCR-voting fallback")
bullet("ocr_frame_count column added to coaches table and populated by sync engine")
bullet("HierarchyTree OCR Anchors count fixed to read real ocr_frame_count from API")
bullet("Component frame filtering added to timeline (click Component Frames node)")
bullet("DevLab testing tool built alongside production services")

doc.add_page_break()

# ══════════════════════════════════════════════════════════════════════════════
# 3.  OCR PIPELINE — DETAILED WALKTHROUGH
# ══════════════════════════════════════════════════════════════════════════════
heading("3. OCR Pipeline — Detailed Walkthrough")
para(
    "Every extracted frame triggers a POST /ocr request to the OCR service. "
    "The request carries frame_url (Cloudinary), frame_id, trigger_id, and session_id."
)

heading("3.1  Step-by-Step Flow", level=2)
numbered("Frame downloaded from Cloudinary URL via requests.get()")
numbered("Frame sent to YOLO service as a multipart JPEG — returns bounding boxes for all classes")
numbered("If a Boogie box exists, crop it with 15% padding on all sides")
numbered("Pass 1: run_ocr(crop) — PaddleOCR on raw BGR crop")
numbered("If no valid 5-6 digit number found: Pass 2: run_ocr(preprocess_frame(crop))")
numbered("If still nothing: digit_substring fallback extracts any 5-6 digit run from OCR text")
numbered("If YOLO found no boxes at all: full-frame fallback with preprocessing")
numbered("Result written to ocr_results table")
numbered("All Gap boxes written to gap_detections table")
numbered("Response returned including yolo_boxes list (all classes)")

separator()
heading("3.2  Preprocessing Pipeline", level=2)
para("preprocess_frame() applies the following in sequence:")
bullet("Grayscale conversion")
bullet("CLAHE (contrast-limited adaptive histogram equalisation) for uneven lighting")
bullet("Gaussian blur to reduce sensor noise")
bullet("Otsu thresholding to binarise")
bullet("Morphological dilation to thicken digits")
bullet("Converted back to 3-channel for PaddleOCR input compatibility")

separator()
heading("3.3  Train Number Filter", level=2)
para(
    "filter_train_numbers() accepts raw PaddleOCR output and returns only candidates "
    r"matching ^\d{5,6}$ with confidence >= 0.4. The best candidate (highest confidence) "
    "is selected as the coach_number for that frame."
)

separator()
heading("3.4  Database Writes", level=2)
para("On every OCR call two DB operations happen inside a single transaction:")
bullet("INSERT into ocr_results (one row per frame) — stores coach_number, confidence, pass_used, is_valid, bbox, raw JSON response")
bullet("INSERT into gap_detections (one row per Gap box detected by YOLO) — stores trigger_id, confidence, bbox")

doc.add_page_break()

# ══════════════════════════════════════════════════════════════════════════════
# 4.  SYNCHRONISATION PROBLEM & SOLUTION
# ══════════════════════════════════════════════════════════════════════════════
heading("4. Synchronisation — Problem & Solution")

heading("4.1  The Problem", level=2)
para(
    "A train inspection uses multiple cameras simultaneously. Each camera sees a different "
    "angle of the same bogie at the same moment. The system assigns all frames captured "
    "at the same trigger_id to a single logical bogie. The challenge: how do you know "
    "where one bogie ends and the next begins?"
)
para("Original approach — OCR voting:", bold=True)
bullet("Scan OCR results ordered by trigger_id")
bullet("When the same coach number appears in consecutive triggers → one bogie segment")
bullet("A gap of more than sync_max_trigger_gap (150) triggers without a consistent number → segment boundary")
para("Why this failed:", bold=True)
bullet("If the OCR camera is not facing the number plate (e.g., viewing the side), it sees nothing — breaks the segment")
bullet("Multiple cameras may disagree on the coach number for the same trigger")
bullet("Segments were wrong or merged when trains moved at irregular speeds")
bullet("UNKNOWN coaches were created for every gap in OCR readings, not just real bogie boundaries")

separator()
heading("4.2  The Solution — Gap-Boundary Synchronisation", level=2)
para(
    "The physical gap between two bogies is always visible to the camera and is a "
    "definitive boundary. YOLO's Gap class detects this gap on every frame where it is "
    "visible. Instead of relying on what the coach number reads, the system now relies "
    "on where the gap is."
)
para("Algorithm:", bold=True)
numbered("Load all gap_detections for the session where confidence >= GAP_MIN_CONFIDENCE (0.4)")
numbered("Cluster consecutive detections within GAP_CLUSTER_RADIUS (30 trigger_ids) of each other — the same physical gap appears in many frames as the train moves")
numbered("Pick the highest-confidence detection from each cluster as the canonical boundary trigger_id")
numbered("Build bogie ranges: [session_start … boundary_0), [boundary_0 … boundary_1), … , [boundary_N … session_end]")
numbered("For each range, query ocr_results for the best coach_number (is_valid=TRUE preferred)")
numbered("Create one coaches row per range; insert all frames into coach_frame_map by trigger range")
numbered("Create timeline_events: OCR_ANCHOR per identified coach, GAP_BOUNDARY per detected gap")
numbered("Update total_frames and ocr_frame_count on each coach row")

separator()
heading("4.3  Fallback — OCR Voting", level=2)
para(
    "If no gap_detections exist for the session (e.g., old data captured before the Gap "
    "YOLO class existed), the engine falls back to the original OCR voting algorithm. "
    "The fallback is fully preserved in _ocr_voting_fallback() and produces coaches "
    "with method = 'ocr_voting'."
)

separator()
heading("4.4  Configuration", level=2)
para("Tunable parameters in config.json → pipeline section:")
code_block("sync_gap_cluster_radius   : 30    # trigger_ids; same gap seen within this window = one boundary")
code_block("sync_gap_min_confidence   : 0.4   # minimum YOLO confidence to accept a gap detection")
code_block("sync_min_votes            : 1     # OCR fallback: minimum OCR hits to form a segment")
code_block("sync_max_trigger_gap      : 150   # OCR fallback: max trigger gap before new segment")

doc.add_page_break()

# ══════════════════════════════════════════════════════════════════════════════
# 5.  RUNNING MULTIPLE AI MODELS — DLL / CUDA CONFLICTS
# ══════════════════════════════════════════════════════════════════════════════
heading("5. Running Multiple AI Models Without DLL Conflicts")

heading("5.1  The Problem", level=2)
para(
    "The system runs two GPU-accelerated models simultaneously: YOLOv8 (PyTorch/Ultralytics) "
    "and PaddleOCR (PaddlePaddle). Both frameworks ship their own CUDA runtime DLLs "
    "(cudart64_*.dll, cublas64_*.dll, etc.). When loaded in the same Python process, "
    "DLL version mismatches cause one or both models to crash at inference time."
)
para("Symptoms observed:", bold=True)
bullet("RuntimeError: CUDA error: no kernel image is available for execution on the device")
bullet("DLL load failed: the specified module could not be found (cublas64_11.dll vs cublas64_12.dll)")
bullet("Process crash on first inference after startup — model warmed up fine but failed on real data")
bullet("PaddleOCR RuntimeError: Tensor holds no memory — caused by thread-unsafe angle classifier under concurrent requests")

separator()
heading("5.2  Root Cause", level=2)
para(
    "PyTorch (used by Ultralytics YOLO) and PaddlePaddle compile against different CUDA "
    "toolkit versions. When both are imported in the same Python interpreter, whichever "
    "CUDA runtime DLL loads first 'wins'; the other framework then tries to call functions "
    "that do not exist in that DLL version and crashes."
)
para("Thread-safety issue (separate from DLL conflict):", bold=True)
para(
    "PaddleOCR's angle classifier (use_angle_cls=True) uses an internal state variable "
    "that is not protected by a mutex. Under concurrent HTTP requests, two threads enter "
    "the angle detection branch simultaneously and corrupt the tensor handle, producing "
    "'Tensor holds no memory'."
)

separator()
heading("5.3  Solution — Process Isolation", level=2)
para(
    "Each model runs in its own dedicated Python process (microservice). They share no "
    "memory space and therefore no DLL conflict can occur."
)
bullet("YOLO Service  (port 5002) — runs PyTorch / Ultralytics only")
bullet("OCR Service   (port 5000) — runs PaddlePaddle / PaddleOCR only")
para(
    "The OCR service calls the YOLO service over HTTP. The YOLO service returns JSON "
    "bounding boxes; the OCR service uses them for cropping. No GPU tensor crosses the "
    "process boundary — only plain JSON."
)

separator()
heading("5.4  Additional Fixes Applied", level=2)
para("Angle classifier disabled in OCR service:", bold=True)
code_block("# ocr_engine.py")
code_block("ocr = PaddleOCR(use_angle_cls=False, lang='en', use_gpu=True)")
para(
    "Setting use_angle_cls=False removes the thread-unsafe code path entirely. "
    "Train coach numbers are always printed horizontally so detection accuracy is not affected."
)
para("OCR concurrency locked to 1:", bold=True)
code_block('# config.json  →  "ocr_concurrency": 1')
para(
    "Even with the angle classifier disabled, PaddleOCR's GPU memory allocator is not "
    "fully re-entrant. Limiting concurrency to 1 ensures sequential inference while "
    "still allowing the pipeline to queue frames."
)
para("GPU warm-up on startup:", bold=True)
code_block("# server.py  @app.on_event('startup')")
code_block("blank = np.zeros((100, 300, 3), dtype='uint8')")
code_block("run_ocr(blank)  # forces CUDA context initialisation before first real request")
para(
    "Without warm-up the first real request bears the full CUDA initialisation cost (~3 s) "
    "and can time out in high-throughput scenarios."
)

doc.add_page_break()

# ══════════════════════════════════════════════════════════════════════════════
# 6.  OTHER BUGS & FIXES LOG
# ══════════════════════════════════════════════════════════════════════════════
heading("6. Other Bugs & Fixes Log")

issues = [
    (
        "BigInt serialization error in Node.js",
        "Postgres BIGINT columns (trigger_id, start_trigger_id, end_trigger_id) returned as "
        "JavaScript BigInt by Prisma. JSON.stringify() throws 'Do not know how to serialize a BigInt'.",
        "Added BigInt.prototype.toJSON = function() { return Number(this); } at the top of "
        "backend/src/index.js and devlab/backend/src/index.js. Safe for trigger_id values "
        "which are well within Number.MAX_SAFE_INTEGER.",
    ),
    (
        "Devlab backend 500 on all routes",
        "Devlab backend started without a .env file — DATABASE_URL was undefined, "
        "causing every Prisma call to throw at connection time.",
        "Created devlab/backend/.env with DATABASE_URL pointing to the shared Neon "
        "PostgreSQL instance, plus service URL overrides and PORT=8002.",
    ),
    (
        "dev_ocr_runs table missing",
        "Running prisma db push from the main backend schema would drop the devlab-only "
        "tables (dev_ocr_runs, dev_sync_runs) not present in the main schema.",
        "Always run prisma db push from devlab/backend/ whose schema.prisma is a superset "
        "that includes both the production tables and the dev-only tables.",
    ),
    (
        "coach_frame_maps (plural) Prisma error",
        "intelligence.js queried frame.coach_frame_maps which does not exist — "
        "the Prisma relation is named coach_frame_map (singular, one-to-one).",
        "Renamed all references in intelligence.js to coach_frame_map and removed "
        "the [0] array index since the relation returns a single object, not an array.",
    ),
    (
        "OCR Anchors always showing 0",
        "HierarchyTree.jsx normalizeCoach() computed ocrFramesCount as "
        "Math.floor(total_frames * 0.15) — a hardcoded estimate, always near zero "
        "for coaches with few frames.",
        "Changed to c.ocr_frame_count from the API response. "
        "Added ocr_frame_count to the hierarchy route response and added an UPDATE "
        "coaches SET ocr_frame_count = ... query to the sync engine (both gap and "
        "OCR-voting paths).",
    ),
    (
        "Port conflicts on restart",
        "Repeatedly starting and stopping services left stale processes occupying "
        "ports 5173, 5174, 8001, 8002, causing EADDRINUSE on the next start.",
        "Added killPort() to start.js and devlab/start.js using netstat -ano | "
        "findstr :<PORT> to find the PID and taskkill /PID <n> /F to terminate "
        "it before binding the new process.",
    ),
    (
        "Parallel YOLO + OCR call (wrong architecture)",
        "An early implementation called the YOLO service in parallel with the OCR "
        "service from the Node.js backend, then merged the results. This broke the "
        "intended sequence where OCR internally calls YOLO for ROI detection.",
        "Reverted to a single POST /ocr call. The OCR service calls YOLO internally "
        "and returns yolo_boxes in its response. The Node.js backend reads "
        "serviceResult.yolo_boxes and stores it alongside the OCR result.",
    ),
]

for i, (title, problem, fix) in enumerate(issues, 1):
    heading(f"6.{i}  {title}", level=2)
    para("Problem:", bold=True)
    para(problem)
    para("Fix:", bold=True)
    para(fix)
    separator()

doc.add_page_break()

# ══════════════════════════════════════════════════════════════════════════════
# 7.  DEVLAB TESTING TOOL
# ══════════════════════════════════════════════════════════════════════════════
heading("7. DevLab — Developer Testing Tool")
para(
    "DevLab is a separate React + Express application (frontend :5174, backend :8002) "
    "that shares the production Neon database. It provides manual testing interfaces "
    "for each microservice without going through the full orchestrated pipeline."
)
heading("7.1  Modules", level=2)
bullet("OCR Tester — select a session/trigger, run OCR on individual frames, view YOLO bounding boxes (Boogie=blue, Car Type=amber, Engine=green, Gap=orange) and OCR overlay toggle")
bullet("Sync Tester — trigger sync engine for a session, view coach segments and gap boundary count")
bullet("Component Tester — browse coach frames with component detection overlays")
bullet("Session Browser — list sessions, frame counts, status")

heading("7.2  YOLO Box Overlay", level=2)
para(
    "YOLO bounding boxes displayed in DevLab come directly from the OCR service response "
    "(yolo_boxes field) — no separate YOLO HTTP call is made from the frontend. "
    "This preserves the intended call sequence and avoids double-counting GPU time."
)

doc.add_page_break()

# ══════════════════════════════════════════════════════════════════════════════
# 8.  CONFIGURATION REFERENCE
# ══════════════════════════════════════════════════════════════════════════════
heading("8. Configuration Reference — config.json")
params = [
    ("pipeline.frames_per_second",       "1",    "Frame extraction rate per camera"),
    ("pipeline.ocr_concurrency",         "1",    "Max parallel OCR workers (keep at 1 for GPU safety)"),
    ("pipeline.db_flush_every_n_frames", "10",   "Batch DB writes every N frames"),
    ("pipeline.sync_min_votes",          "1",    "OCR fallback: min OCR hits to form a segment"),
    ("pipeline.sync_max_trigger_gap",    "150",  "OCR fallback: max trigger gap between same coach hits"),
    ("pipeline.sync_gap_cluster_radius", "30",   "Gap sync: cluster radius (trigger_ids)"),
    ("pipeline.sync_gap_min_confidence", "0.4",  "Gap sync: minimum YOLO gap confidence"),
    ("upload.max_file_size_gb",          "2",    "Maximum video upload size"),
    ("upload.max_cameras",               "10",   "Maximum simultaneous camera feeds"),
]
for key, default, desc in params:
    bullet(f"{key}  (default: {default}) — {desc}")

doc.add_page_break()

# ══════════════════════════════════════════════════════════════════════════════
# 9.  RUNNING THE SYSTEM
# ══════════════════════════════════════════════════════════════════════════════
heading("9. Running the System")

heading("9.1  Production Services", level=2)
code_block("cd E:/PROJECTS/VandeBharat/Main")
code_block("node start.js")
para("Starts all 8 services in order. Kills any stale process on ports 5173, 8001 before binding.")

heading("9.2  DevLab", level=2)
code_block("cd E:/PROJECTS/VandeBharat/Main/devlab")
code_block("node start.js")
para("Kills stale processes on 8002 and 5174, then starts backend (nodemon) and frontend (Vite).")

heading("9.3  GPU Services (separate terminal — GPU machine)", level=2)
code_block("cd E:/PROJECTS/VandeBharat/Main/GPU/ocr")
code_block("uvicorn server:app --host 0.0.0.0 --port 5000")
code_block("")
code_block("cd E:/PROJECTS/VandeBharat/Main/GPU/yolo")
code_block("uvicorn server:app --host 0.0.0.0 --port 5002")

# ── Save ──────────────────────────────────────────────────────────────────────
out_path = "VandeBharat_TechDoc.docx"
doc.save(out_path)
print(f"Saved: {out_path}")
