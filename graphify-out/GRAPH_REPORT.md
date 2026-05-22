# Graph Report - Main  (2026-05-22)

## Corpus Check
- 109 files · ~252,663 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 493 nodes · 606 edges · 38 communities (29 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `de13c2a7`
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
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]

## God Nodes (most connected - your core abstractions)
1. `_fetch()` - 16 edges
2. `VandeInspect AI — Backend Build Progress` - 16 edges
3. `scripts` - 9 edges
4. `services` - 9 edges
5. `useSessionSocket()` - 8 edges
6. `run_pipeline()` - 7 edges
7. `run_sync()` - 7 edges
8. `usePolling()` - 7 edges
9. `pipeline` - 6 edges
10. `normalizeSession()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `run_pipeline()` --calls--> `preprocess_frame()`  [INFERRED]
  GPU/ocr/server.py → GPU/ocr/preprocess.py
- `sync()` --calls--> `run_sync()`  [INFERRED]
  services/sync_engine/server.py → services/sync_engine/engine.py
- `run_pipeline()` --calls--> `run_ocr()`  [INFERRED]
  GPU/ocr/server.py → GPU/ocr/ocr_engine.py
- `warmup()` --calls--> `run_ocr()`  [INFERRED]
  GPU/ocr/server.py → GPU/ocr/ocr_engine.py
- `_best_candidate_from()` --calls--> `filter_train_numbers()`  [INFERRED]
  GPU/ocr/server.py → GPU/ocr/train_number_filter.py

## Communities (38 total, 9 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.14
Nodes (11): axios, CAM_TYPES, config, fs, path, { pipeline }, PIPELINE_STAGES, { randomUUID } (+3 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (28): dependencies, axios, cloudinary, cors, dotenv, express, fastify, @fastify/cors (+20 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (26): code:block1 (Frontend (React + Vite) ── port 5173), code:block2 (Main/), code:bash (cd Main/services/frame_extractor), code:bash (# Terminal 1 — YOLO service), code:bash (# Terminal 4 — Correlation service), code:bash (cd Main/services/report_generator), code:bash (# 1. GPU Services (need CUDA + GPU)), Correct Service Architecture (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (22): assign_frames(), _close(), create_coaches(), create_timeline_events(), detect_segments(), _find_coach(), load_ocr_by_trigger(), _new_seg() (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (10): prisma, { PrismaClient }, config, cors, fastify, msg, multipart, prisma (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (40): usePolling(), getSharedWs(), subscribers, subscribeSession(), useSessionSocket(), WS_BASE, toast, _fetch() (+32 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (20): _cudnn8_available(), get_ocr(), PaddleOCR singleton — GPU with CPU fallback. Windows CUDA DLL injection included, PaddlePaddle 2.x requires cuDNN 8 (cudnn_ops_infer64_8.dll on Windows).     PyTo, run_ocr(), preprocess_frame(), Frame preprocessing for Pass 2 OCR: grayscale → 2× upscale → sharpen → CLAHE → b, _best_candidate_from() (+12 more)

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (8): decode_bytes(), predict(), predict_train_number(), YOLO Service — port 5002 Two models loaded at startup on GPU:   best.pt, Defect detection — uses best.pt. Called by Phase 3 correlation pipeline., Defect detection — uses best.pt. Called by Phase 3 correlation pipeline., Bogie ROI detection — uses train_num_detector.pt. Called by OCR service (Phase 2, Bogie ROI detection — uses train_num_detector.pt. Called by OCR service (Phase 2

### Community 11 - "Community 11"
Cohesion: 0.23
Nodes (9): correlate_coach(), _fetch_frame_bytes(), load_manifest(), Correlation Engine — Phase 3 For each coach:   1. Sample frames assigned to that, Run defect + component correlation for one coach.     Returns summary dict., _run_yolo(), correlate(), get_conn() (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (16): BaseModel, CorrelateRequest, _all_cameras_done(), ExtractRequest, _flush_rows(), get_conn(), Frame Extractor Service — port 5003 Receives video path → OpenCV extracts every, True when every session_camera for this session has frame_count > 0. (+8 more)

### Community 13 - "Community 13"
Cohesion: 0.15
Nodes (15): FPDF, build_json_report(), build_pdf_report(), generate_report(), _health_color(), load_session_data(), _PDF, Report builder — Phase 4 Reads full session from DB → builds PDF (fpdf2) + JSON (+7 more)

### Community 16 - "Community 16"
Cohesion: 0.16
Nodes (17): C, fs, http, killAll(), killPort(), launch(), log(), LOG_DIR (+9 more)

### Community 18 - "Community 18"
Cohesion: 0.40
Nodes (3): axios, config, prisma

### Community 19 - "Community 19"
Cohesion: 0.31
Nodes (6): useToastStore, navItems, BORDER, ICONS, ToastContainer(), ToastItem()

### Community 20 - "Community 20"
Cohesion: 0.33
Nodes (5): name, private, scripts, setup, start

### Community 22 - "Community 22"
Cohesion: 0.10
Nodes (11): C, exe, { execSync }, fs, ocrPy, path, r, SERVICES (+3 more)

### Community 23 - "Community 23"
Cohesion: 0.11
Nodes (18): pipeline, db_flush_every_n_frames, frames_per_second, ocr_concurrency, sync_max_trigger_gap, sync_min_votes, services, backend_port (+10 more)

### Community 24 - "Community 24"
Cohesion: 0.26
Nodes (11): BACKEND_MODULES, C, deleteCloudinaryAssets(), dotenv, getAllCloudinaryIds(), log(), main(), path (+3 more)

### Community 26 - "Community 26"
Cohesion: 0.06
Nodes (26): axios, prisma, { PrismaClient }, { Router }, prisma, { PrismaClient }, { Router }, types (+18 more)

### Community 28 - "Community 28"
Cohesion: 0.11
Nodes (3): SEVERITY_COLOR, CLASS_COLOR, nav

### Community 29 - "Community 29"
Cohesion: 0.10
Nodes (19): dependencies, lucide-react, react, react-dom, react-router-dom, devDependencies, autoprefixer, postcss (+11 more)

### Community 30 - "Community 30"
Cohesion: 0.29
Nodes (3): clients, globalClients, sessionRooms

### Community 31 - "Community 31"
Cohesion: 0.27
Nodes (9): axios, { broadcast, broadcastAll }, config, emitStage(), prisma, runOcrPipeline(), broadcast(), broadcastAll() (+1 more)

### Community 32 - "Community 32"
Cohesion: 0.29
Nodes (6): name, private, scripts, install:all, start, version

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (3): app, config, config

### Community 34 - "Community 34"
Cohesion: 0.28
Nodes (8): backend, frontend, killPort(), main(), path, run(), { spawn }, { spawn, exec }

## Knowledge Gaps
- **196 isolated node(s):** `type`, `dev`, `start`, `db:generate`, `db:migrate` (+191 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `OcrRequest` connect `Community 12` to `Community 7`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `sync()` connect `Community 12` to `Community 3`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `PaddleOCR singleton — GPU with CPU fallback. Windows CUDA DLL injection included`, `PaddlePaddle 2.x requires cuDNN 8 (cudnn_ops_infer64_8.dll on Windows).     PyTo`, `OCR Service — port 5000 YOLO-first ROI pipeline, ported from POC/backend/OCR/ser` to the rest of the system?**
  _234 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07586206896551724 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07977207977207977 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.11231884057971014 - nodes in this community are weakly interconnected._