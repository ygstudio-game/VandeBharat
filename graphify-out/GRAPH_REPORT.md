# Graph Report - Main  (2026-05-21)

## Corpus Check
- 66 files · ~234,350 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 123 nodes · 111 edges · 17 communities (6 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `075cc1cc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
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
2. `scripts` - 7 edges
3. `_all_cameras_done()` - 3 edges
4. `run_extraction()` - 3 edges
5. `Correct Service Architecture` - 2 edges
6. `Full Folder Structure` - 2 edges
7. `Phase 1 — Video Upload + Frame Extraction + Cloudinary ✅` - 2 edges
8. `Phase 2 — OCR Pipeline + Coach Mapping ⬜` - 2 edges
9. `Sync key: trigger_id` - 2 edges
10. `Running Everything (Development)` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (17 total, 11 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (13): app, config, prisma, { PrismaClient }, config, axios, config, prisma (+5 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (15): dependencies, axios, cloudinary, dotenv, fastify, @fastify/cors, @fastify/multipart, @fastify/websocket (+7 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (22): code:block1 (Frontend (React + Vite) ── port 5173), code:block2 (Main/), code:bash (cd Main/services/frame_extractor), code:block4 (For each frame (side-camera only, is_ocr_candidate=true):), code:bash (# 1. GPU Services (need CUDA + GPU)), Correct Service Architecture, Full Folder Structure, Key Decisions (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.29
Nodes (7): scripts, db:generate, db:push, db:seed, db:studio, dev, start

### Community 12 - "Community 12"
Cohesion: 0.24
Nodes (7): BaseModel, _all_cameras_done(), ExtractRequest, get_conn(), Frame Extractor Service — port 5003 Receives video path → OpenCV extracts every, True when every session_camera for this session has frame_count > 0., run_extraction()

### Community 16 - "Community 16"
Cohesion: 0.15
Nodes (10): axios, CAM_TYPES, config, fs, path, { pipeline }, PIPELINE_STAGES, prisma (+2 more)

## Knowledge Gaps
- **63 isolated node(s):** `fastify`, `cors`, `multipart`, `config`, `prisma` (+58 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `scripts` connect `Community 4` to `Community 1`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `fastify`, `cors`, `multipart` to the rest of the system?**
  _72 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11052631578947368 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._