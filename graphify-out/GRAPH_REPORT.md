# Graph Report - Main  (2026-05-20)

## Corpus Check
- 66 files · ~233,246 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 80 nodes · 67 edges · 18 communities (7 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cf0483e2`
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

## God Nodes (most connected - your core abstractions)
1. `scripts` - 7 edges
2. `OCR Service — port 5000 YOLO-first ROI pipeline:   1. Call YOLO /api/yolo/predic` - 1 edges
3. `Shared Cloudinary upload helpers used by all Python services.` - 1 edges
4. `Shared psycopg2 connection helper for Python services writing to PostgreSQL.` - 1 edges
5. `YOLO Service — port 5002 Two models loaded at startup:   best.pt              →` - 1 edges
6. `main` - 1 edges
7. `dev` - 1 edges
8. `db:push` - 1 edges
9. `db:seed` - 1 edges
10. `db:studio` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (18 total, 11 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.20
Nodes (7): app, config, config, config, cors, fastify, prisma

### Community 1 - "Community 1"
Cohesion: 0.22
Nodes (9): dependencies, axios, cloudinary, dotenv, fastify, @fastify/cors, @fastify/multipart, @fastify/websocket (+1 more)

### Community 2 - "Community 2"
Cohesion: 0.25
Nodes (5): prisma, { PrismaClient }, axios, config, prisma

### Community 3 - "Community 3"
Cohesion: 0.29
Nodes (6): description, devDependencies, prisma, main, name, version

### Community 4 - "Community 4"
Cohesion: 0.29
Nodes (7): scripts, db:generate, db:push, db:seed, db:studio, dev, start

## Knowledge Gaps
- **36 isolated node(s):** `name`, `version`, `description`, `main`, `start` (+31 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 1` to `Community 3`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `scripts` connect `Community 4` to `Community 3`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **What connects `OCR Service — port 5000 YOLO-first ROI pipeline:   1. Call YOLO /api/yolo/predic`, `Shared Cloudinary upload helpers used by all Python services.`, `Shared psycopg2 connection helper for Python services writing to PostgreSQL.` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._