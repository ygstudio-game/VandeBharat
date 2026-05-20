# Graph Report - Main  (2026-05-21)

## Corpus Check
- 72 files · ~239,557 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 187 nodes · 202 edges · 18 communities (10 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c488bcdc`
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

## God Nodes (most connected - your core abstractions)
1. `VandeInspect AI — Backend Build Progress` - 16 edges
2. `run_pipeline()` - 7 edges
3. `run_sync()` - 7 edges
4. `scripts` - 7 edges
5. `correlate_coach()` - 6 edges
6. `detect_segments()` - 5 edges
7. `run_ocr()` - 4 edges
8. `_best_candidate_from()` - 4 edges
9. `ocr()` - 4 edges
10. `assign_frames()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `run_pipeline()` --calls--> `preprocess_frame()`  [INFERRED]
  GPU/ocr/server.py → GPU/ocr/preprocess.py
- `sync()` --calls--> `run_sync()`  [INFERRED]
  services/sync_engine/server.py → services/sync_engine/engine.py
- `correlate()` --calls--> `correlate_coach()`  [INFERRED]
  services/correlation/server.py → services/correlation/engine.py
- `run_pipeline()` --calls--> `run_ocr()`  [INFERRED]
  GPU/ocr/server.py → GPU/ocr/ocr_engine.py
- `warmup()` --calls--> `run_ocr()`  [INFERRED]
  GPU/ocr/server.py → GPU/ocr/ocr_engine.py

## Communities (18 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.14
Nodes (10): app, config, prisma, { PrismaClient }, config, config, cors, fastify (+2 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (22): dependencies, axios, cloudinary, dotenv, fastify, @fastify/cors, @fastify/multipart, @fastify/websocket (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (24): code:block1 (Frontend (React + Vite) ── port 5173), code:block2 (Main/), code:bash (cd Main/services/frame_extractor), code:bash (# Terminal 1 — YOLO service), code:bash (# Terminal 4 — Correlation service), code:bash (# 1. GPU Services (need CUDA + GPU)), Correct Service Architecture, Full Folder Structure (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.18
Nodes (16): assign_frames(), _close(), create_coaches(), create_timeline_events(), detect_segments(), _find_coach(), load_ocr_by_trigger(), _new_seg() (+8 more)

### Community 4 - "Community 4"
Cohesion: 0.32
Nodes (5): _all_cameras_done(), get_conn(), Frame Extractor Service — port 5003 Receives video path → OpenCV extracts every, True when every session_camera for this session has frame_count > 0., run_extraction()

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
Cohesion: 0.25
Nodes (7): BaseModel, ExtractRequest, OcrRequest, get_conn(), Sync Engine Service — port 5004 Receives { session_id } → runs trigger_id gap de, sync(), SyncRequest

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (15): axios, CAM_TYPES, config, fs, path, { pipeline }, PIPELINE_STAGES, prisma (+7 more)

## Knowledge Gaps
- **64 isolated node(s):** `fastify`, `cors`, `multipart`, `config`, `prisma` (+59 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `OcrRequest` connect `Community 12` to `Community 7`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `sync()` connect `Community 12` to `Community 3`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `run_pipeline()` (e.g. with `run_ocr()` and `preprocess_frame()`) actually correct?**
  _`run_pipeline()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fastify`, `cors`, `multipart` to the rest of the system?**
  _90 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._