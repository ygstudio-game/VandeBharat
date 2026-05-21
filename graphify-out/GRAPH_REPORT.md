# Graph Report - Main  (2026-05-21)

## Corpus Check
- 87 files · ~245,557 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 382 nodes · 487 edges · 28 communities (19 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e3492faa`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]

## God Nodes (most connected - your core abstractions)
1. `VandeInspect AI — Backend Build Progress` - 16 edges
2. `_fetch()` - 15 edges
3. `services` - 9 edges
4. `useSessionSocket()` - 8 edges
5. `usePolling()` - 7 edges
6. `run_pipeline()` - 7 edges
7. `run_sync()` - 7 edges
8. `scripts` - 7 edges
9. `normalizeSession()` - 6 edges
10. `generate_report()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `generate()` --calls--> `generate_report()`  [INFERRED]
  services/report_generator/server.py → services/report_generator/builder.py
- `run_pipeline()` --calls--> `preprocess_frame()`  [INFERRED]
  GPU/ocr/server.py → GPU/ocr/preprocess.py
- `run_pipeline()` --calls--> `run_ocr()`  [INFERRED]
  GPU/ocr/server.py → GPU/ocr/ocr_engine.py
- `warmup()` --calls--> `run_ocr()`  [INFERRED]
  GPU/ocr/server.py → GPU/ocr/ocr_engine.py
- `Sessions()` --calls--> `useSessionSocket()`  [EXTRACTED]
  frontend/src/pages/Sessions.jsx → frontend/src/hooks/useSessionSocket.js

## Communities (28 total, 9 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (24): axios, CAM_TYPES, config, fs, path, { pipeline }, PIPELINE_STAGES, prisma (+16 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (22): dependencies, axios, cloudinary, dotenv, fastify, @fastify/cors, @fastify/multipart, @fastify/websocket (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (26): code:block1 (Frontend (React + Vite) ── port 5173), code:block2 (Main/), code:bash (cd Main/services/frame_extractor), code:bash (# Terminal 1 — YOLO service), code:bash (# Terminal 4 — Correlation service), code:bash (cd Main/services/report_generator), code:bash (# 1. GPU Services (need CUDA + GPU)), Correct Service Architecture (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (20): assign_frames(), _close(), create_coaches(), create_timeline_events(), detect_segments(), _find_coach(), load_ocr_by_trigger(), _new_seg() (+12 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (13): app, config, prisma, { PrismaClient }, config, config, cors, fastify (+5 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (35): usePolling(), getSharedWs(), subscribers, subscribeSession(), useSessionSocket(), WS_BASE, _fetch(), generateReport() (+27 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (20): _cudnn8_available(), get_ocr(), PaddleOCR singleton — GPU with CPU fallback. Windows CUDA DLL injection included, PaddlePaddle 2.x requires cuDNN 8 (cudnn_ops_infer64_8.dll on Windows).     PyTo, run_ocr(), preprocess_frame(), Frame preprocessing for Pass 2 OCR: grayscale → 2× upscale → sharpen → CLAHE → b, _best_candidate_from() (+12 more)

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (8): decode_bytes(), predict(), predict_train_number(), YOLO Service — port 5002 Two models loaded at startup on GPU:   best.pt, Defect detection — uses best.pt. Called by Phase 3 correlation pipeline., Defect detection — uses best.pt. Called by Phase 3 correlation pipeline., Bogie ROI detection — uses train_num_detector.pt. Called by OCR service (Phase 2, Bogie ROI detection — uses train_num_detector.pt. Called by OCR service (Phase 2

### Community 11 - "Community 11"
Cohesion: 0.21
Nodes (10): correlate_coach(), _fetch_frame_bytes(), load_manifest(), Correlation Engine — Phase 3 For each coach:   1. Sample frames assigned to that, Run defect + component correlation for one coach.     Returns summary dict., _run_yolo(), correlate(), CorrelateRequest (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (16): BaseModel, _all_cameras_done(), ExtractRequest, _flush_rows(), get_conn(), Frame Extractor Service — port 5003 Receives video path → OpenCV extracts every, True when every session_camera for this session has frame_count > 0., True when every session_camera for this session has frame_count > 0. (+8 more)

### Community 13 - "Community 13"
Cohesion: 0.26
Nodes (10): FPDF, build_json_report(), build_pdf_report(), generate_report(), _health_color(), load_session_data(), _PDF, Report builder — Phase 4 Reads full session from DB → builds PDF (fpdf2) + JSON (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (16): C, fs, http, killAll(), launch(), log(), LOG_DIR, LOG_FILE (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.40
Nodes (3): axios, config, prisma

### Community 19 - "Community 19"
Cohesion: 0.25
Nodes (7): toast, useToastStore, navItems, BORDER, ICONS, ToastContainer(), ToastItem()

### Community 20 - "Community 20"
Cohesion: 0.33
Nodes (5): name, private, scripts, setup, start

### Community 22 - "Community 22"
Cohesion: 0.10
Nodes (11): C, exe, { execSync }, fs, ocrPy, path, r, SERVICES (+3 more)

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (16): pipeline, db_flush_every_n_frames, frames_per_second, ocr_concurrency, services, backend_port, correlation_port, frame_extractor_port (+8 more)

### Community 24 - "Community 24"
Cohesion: 0.26
Nodes (11): BACKEND_MODULES, C, deleteCloudinaryAssets(), dotenv, getAllCloudinaryIds(), log(), main(), path (+3 more)

### Community 26 - "Community 26"
Cohesion: 0.40
Nodes (3): _coachShape, extendedCoaches, HierarchyTree()

## Knowledge Gaps
- **137 isolated node(s):** `fastify`, `cors`, `multipart`, `websocketPlugin`, `config` (+132 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `OcrRequest` connect `Community 12` to `Community 7`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `SyncRequest` connect `Community 3` to `Community 12`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `PaddleOCR singleton — GPU with CPU fallback. Windows CUDA DLL injection included`, `PaddlePaddle 2.x requires cuDNN 8 (cudnn_ops_infer64_8.dll on Windows).     PyTo`, `YOLO Service — port 5002 Two models loaded at startup on GPU:   best.pt` to the rest of the system?**
  _169 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07765151515151515 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07977207977207977 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.1225296442687747 - nodes in this community are weakly interconnected._