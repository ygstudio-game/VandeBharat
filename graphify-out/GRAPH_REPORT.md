# Graph Report - Main  (2026-05-21)

## Corpus Check
- 79 files · ~243,560 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 274 nodes · 362 edges · 20 communities (14 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `64c8f4ed`
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

## God Nodes (most connected - your core abstractions)
1. `VandeInspect AI — Backend Build Progress` - 16 edges
2. `_fetch()` - 12 edges
3. `usePolling()` - 7 edges
4. `useSessionSocket()` - 7 edges
5. `run_pipeline()` - 7 edges
6. `run_sync()` - 7 edges
7. `scripts` - 7 edges
8. `normalizeSession()` - 6 edges
9. `generate_report()` - 6 edges
10. `correlate_coach()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `generate()` --calls--> `generate_report()`  [INFERRED]
  services/report_generator/server.py → services/report_generator/builder.py
- `run_pipeline()` --calls--> `preprocess_frame()`  [INFERRED]
  GPU/ocr/server.py → GPU/ocr/preprocess.py
- `sync()` --calls--> `run_sync()`  [INFERRED]
  services/sync_engine/server.py → services/sync_engine/engine.py
- `Reports()` --calls--> `usePolling()`  [EXTRACTED]
  frontend/src/pages/Reports.jsx → frontend/src/hooks/usePolling.js
- `Sessions()` --calls--> `useSessionSocket()`  [EXTRACTED]
  frontend/src/pages/Sessions.jsx → frontend/src/hooks/useSessionSocket.js

## Communities (20 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (25): app, config, prisma, { PrismaClient }, config, axios, { broadcast, broadcastAll }, config (+17 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (22): dependencies, axios, cloudinary, dotenv, fastify, @fastify/cors, @fastify/multipart, @fastify/websocket (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (26): code:block1 (Frontend (React + Vite) ── port 5173), code:block2 (Main/), code:bash (cd Main/services/frame_extractor), code:bash (# Terminal 1 — YOLO service), code:bash (# Terminal 4 — Correlation service), code:bash (cd Main/services/report_generator), code:bash (# 1. GPU Services (need CUDA + GPU)), Correct Service Architecture (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.18
Nodes (16): assign_frames(), _close(), create_coaches(), create_timeline_events(), detect_segments(), _find_coach(), load_ocr_by_trigger(), _new_seg() (+8 more)

### Community 4 - "Community 4"
Cohesion: 0.32
Nodes (5): _all_cameras_done(), get_conn(), Frame Extractor Service — port 5003 Receives video path → OpenCV extracts every, True when every session_camera for this session has frame_count > 0., run_extraction()

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (31): usePolling(), getSharedWs(), subscribers, subscribeSession(), useSessionSocket(), WS_BASE, toast, _fetch() (+23 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (18): get_ocr(), PaddleOCR singleton — GPU with CPU fallback. Windows CUDA DLL injection included, run_ocr(), preprocess_frame(), Frame preprocessing for Pass 2 OCR: grayscale → 2× upscale → sharpen → CLAHE → b, _best_candidate_from(), _digit_substring(), download_frame() (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.28
Nodes (6): decode_bytes(), predict(), predict_train_number(), YOLO Service — port 5002 Two models loaded at startup on GPU:   best.pt, Defect detection — uses best.pt. Called by Phase 3 correlation pipeline., Bogie ROI detection — uses train_num_detector.pt. Called by OCR service (Phase 2

### Community 11 - "Community 11"
Cohesion: 0.21
Nodes (10): correlate_coach(), _fetch_frame_bytes(), load_manifest(), Correlation Engine — Phase 3 For each coach:   1. Sample frames assigned to that, Run defect + component correlation for one coach.     Returns summary dict., _run_yolo(), correlate(), CorrelateRequest (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (12): BaseModel, ExtractRequest, OcrRequest, generate(), GenerateRequest, get_conn(), get_report(), Report Generator Service — port 5006 POST /generate { session_id } → builds PDF (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.26
Nodes (10): FPDF, build_json_report(), build_pdf_report(), generate_report(), _health_color(), load_session_data(), _PDF, Report builder — Phase 4 Reads full session from DB → builds PDF (fpdf2) + JSON (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (11): axios, CAM_TYPES, config, fs, path, { pipeline }, PIPELINE_STAGES, prisma (+3 more)

### Community 18 - "Community 18"
Cohesion: 0.40
Nodes (3): axios, config, prisma

### Community 19 - "Community 19"
Cohesion: 0.31
Nodes (6): useToastStore, navItems, BORDER, ICONS, ToastContainer(), ToastItem()

## Knowledge Gaps
- **83 isolated node(s):** `fastify`, `cors`, `multipart`, `websocketPlugin`, `config` (+78 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `OcrRequest` connect `Community 12` to `Community 7`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `fastify`, `cors`, `multipart` to the rest of the system?**
  _110 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07301587301587302 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07977207977207977 - nodes in this community are weakly interconnected._
- **Should `Community 6` be split into smaller, more focused modules?**
  _Cohesion score 0.10452961672473868 - nodes in this community are weakly interconnected._
- **Should `Community 7` be split into smaller, more focused modules?**
  _Cohesion score 0.11462450592885376 - nodes in this community are weakly interconnected._