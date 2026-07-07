# VandeInspect AI — System Improvement Plan

**Author role:** Senior DevOps / Platform Engineering review
**Inputs compared:** (a) our current system (`system_flow.md`, codebase) vs (b) competitor MVIS architecture (Jetson AGX Orin edge design, Revision 1.0).
**Date:** 2026-06-28

---

## 0. Executive Verdict

The competitor's MVIS document and our system are **two different architectural bets**, not the same system built to different quality levels. Reading their plan as "they are ahead" is the wrong framing. The correct framing:

| | Competitor MVIS | VandeInspect AI (ours) |
|---|---|---|
| Deployment model | Single **edge appliance** (1× Jetson AGX Orin per site) | **Cloud platform** (Neon Postgres + Cloudinary + microservices) |
| Processing model | **Real-time streaming** — live cameras at 90 km/h | **Batch** — operator uploads video, pipeline runs |
| Latency target | Trigger sensor → alert in **< 5 s** | Minutes (upload + multi-stage queue) |
| Compute | C++ / CUDA / **TensorRT FP16**, hand-tuned | Python services, YOLOv8 (likely PyTorch), Node orchestrator |
| Storage | **Event-only evidence** (99.9% reduction) | All frames → Cloudinary |
| Alerting | SMS / Email / WhatsApp / **MQTT** | WebSocket to dashboard only |
| Scale unit | One inspection zone | **Many stations**, central dashboard, RBAC |
| Model lifecycle | Static engine file | **MLflow** (in proposed arch), training workbench |
| Audit / sign-off | Structured logs for RDSO | **Human verification + signed PDF** workflow (mature) |

**They win** on: latency, GPU efficiency, storage cost, real-time alerting, single-node hardware reliability, RDSO-grade determinism.
**We win** on: multi-station fleet, dashboard/UX maturity, audit & sign-off workflow, cloud analytics, model governance.

**Strategic recommendation: go hybrid.** Adopt their best ideas at the *edge layer* (smart frame selection, event-only storage, TensorRT, real-time alerts) while keeping our cloud layer (fleet management, analytics, governance, dashboard). Edge captures + infers + emits events; cloud aggregates, analyzes, audits across all stations. This beats a single-site appliance on scale and beats our current batch system on latency.

---

## 1. Gap Analysis — Where Competitor Is Genuinely Stronger

Ranked by business/operational impact.

### G1. Real-time vs batch (HIGHEST impact)
- **Them:** trigger sensor fires → frame scheduled → inference → alert in <5 s, on a moving train.
- **Us:** human uploads recorded video afterward; pipeline is offline batch.
- **Why it matters:** real-time detection enables *stop-the-train* / immediate corrective action. Batch is post-hoc audit only. This is the single biggest capability gap and the one most visible to a railway evaluator.
- **Action:** introduce a streaming ingestion path (see Roadmap Phase B). Keep batch path for re-processing / uploaded evidence.

### G2. Smart frame selection (HIGH — cost + accuracy)
- **Them:** physics-based Frame Scheduling Engine — predict exactly which frame holds the bogie from train speed + camera geometry → **60–80% fewer frames hit the GPU**.
- **Us:** fixed FPS sampling — process every sampled frame regardless of content.
- **Action:** add a pre-inference frame-gate: (a) quick CPU quality pre-screen (Laplacian blur / brightness reject — their Algorithm 9, ~0.2 ms/frame), (b) ROI/trigger-based selection when sensor data available. Big GPU/cost saving even in our cloud model.

### G3. Inference efficiency (HIGH — cost)
- **Them:** TensorRT FP16, batch=4, CUDA streams overlapping pre/infer/post. P99 < 15 ms.
- **Us:** YOLOv8 service, likely eager PyTorch, per-frame.
- **Action:** export YOLO → ONNX → TensorRT FP16 engine; batch inference; warm engine at startup. Even on cloud GPUs this 2× throughput cuts spend directly. Validate mAP drop < 1%.

### G4. Storage economics (HIGH — cost)
- **Them:** four-tier model (RAM ring buffer → GPU pinned → NVMe evidence → archive). Store **only confirmed-defect evidence**: best JPEG + ±2 frames + OCR crop + 10 s H.265 clip. Clean train = ~200 KB log. 99.9% reduction.
- **Us:** push frames to Cloudinary broadly.
- **Action:** adopt **event-driven retention**. Keep full frames only for flagged coaches; for clean coaches keep thumbnail + JSON log; tiered TTL (defect 90 d, clean 24 h — configurable per RDSO). This directly cuts Cloudinary/storage bill and matches railway retention policy.

### G5. Detection confidence / correlation depth (MEDIUM-HIGH — accuracy & defensibility)
- **Them:** 8-algorithm Event Correlation Engine — coach association, temporal + spatial correlation, **multi-camera voting**, **Bayesian confidence fusion**, duplicate suppression, composite alert score, **trajectory matching** across cameras.
- **Us:** sync engine + manifest check + per-coach health score. Single-stream reasoning, no cross-camera Bayesian fusion.
- **Action:** upgrade Correlation Engine: add multi-camera voting + Bayesian fusion + tracking-based dedup. These are *algorithmic*, language-agnostic — implementable in our Python correlation service with no hardware change. Biggest accuracy/defensibility win available to us cheaply.

### G6. Real-time alerting channels (MEDIUM)
- **Them:** SMS (Twilio/MSG91), Email, WhatsApp, MQTT QoS1, 60 s dedup window.
- **Us:** WebSocket UI only — no out-of-band alerts.
- **Action:** add an Alert Service: confirmed defect → MQTT + SMS/WhatsApp/email, with dedup window. Decouple from pipeline (poll DB, never call AI directly — their rule 7).

### G7. Config discipline & observability (MEDIUM — ops maturity)
- **Them:** single versioned `config.yaml`, *nothing hardcoded*; structured JSON logs per service; Health Monitor with explicit thresholds (GPU temp, frame drop, SSD, latency P99).
- **Us:** config scattered; observability is WebSocket status, not metrics.
- **Action:** centralize config; structured JSON logging everywhere; Prometheus metrics + Grafana (already in proposed arch — wire it up for real); health thresholds + alerting.

### G8. Reliability / back-pressure (MEDIUM)
- **Them:** every inter-service link is a bounded lock-free queue with back-pressure (drop oldest, never block acquisition); watchdogs; auto camera reconnect; engine reload on crash.
- **Us:** Redis Streams = resumable queue (GOOD — a real strength), but no explicit back-pressure / watchdog / supervised restart story.
- **Action:** add per-service watchdogs + supervised restart; bounded queue depths; circuit breakers on external deps (Cloudinary, Neon).

---

## 2. Where We Are Already Ahead — Protect & Leverage

Do **not** regress these while chasing edge parity:

1. **Multi-station fleet model** — competitor doc is single-box, single-zone. Our station/train/date-scoped workspace + central dashboard is a genuine product advantage. Lean into it.
2. **Mature web dashboard + RBAC** — Command Center, Station Workspace, role-gated routes (Field Staff → RDSO → ZR → Admin). Their dashboard is a thin REST viewer.
3. **Human-in-the-loop sign-off** — deliberate manual report step, PIN-signed audit PDF + JSON. Strong compliance story they only gesture at.
4. **Resumable queue (Redis Streams)** — crash-safe stage hand-off. Architecturally on par with their bounded-queue claim.
5. **Cloud analytics + MLflow lifecycle** — Spark analytics, trend/RCA, AI performance analytics, model tracking. Competitor has *no* cross-train learning beyond a per-camera statistical baseline (their Algo 13). Our analytics tier is a moat.
6. **WebSocket live pipeline UX** — operators watch stages in real time. Good.

---

## 3. DevOps / Platform Gaps (Independent of the Competitor — But We Need These)

The codebase currently has **no containerization, no CI/CD, no IaC, no fleet/edge management**. For a "highscale" railway deployment these are mandatory regardless of the competitor:

| Gap | Current state | Required |
|---|---|---|
| Packaging | Bare `node` + Python venvs, `.bat`/`.ps1` launchers, `start.js` | **Docker** per service; `docker-compose` for dev, images for prod |
| Orchestration | Manual process start | **Kubernetes** (cloud tier) + **k3s / fleet agent** (edge tier) |
| CI/CD | None (`.github` absent) | GitHub Actions: lint, test, build images, push, deploy; model-export pipeline |
| Infra as code | None | Terraform for cloud (Neon, GPU pool, object store, MQTT broker) |
| Secrets | Likely in `config.json`/env | Vault / sealed secrets; no creds in repo |
| Observability | WebSocket status only | Prometheus + Grafana + Loki/structured logs + alerting |
| Edge fleet mgmt | N/A | OTA model + config rollout, device health, remote SSH (key-only) |
| DR / backup | Neon managed only | Defined RPO/RTO, evidence archive to NAS/cloud, restore drills |
| Load / chaos testing | None | k6/Locust load tests; failure injection on queues + external deps |

---

## 4. Improvement Roadmap (Phased, ~24 weeks to parity-plus)

### Phase A — Foundation & quick wins (Weeks 1–4)
- Containerize all services (backend, frame_extractor, ocr, yolo, sync, correlation, report). One Dockerfile each + compose.
- GitHub Actions CI: build/test/push images.
- Centralize config → versioned `config.yaml` per environment; remove hardcoded values.
- Structured JSON logging across every service.
- Event-driven retention policy (G4) — immediate storage-cost win, no new hardware.
- **Outcome:** reproducible builds, lower storage bill, ops visibility.

### Phase B — Real-time path (Weeks 5–12) — closes the headline gap
- Add streaming ingestion alongside batch: camera/RTSP → frame gate → inference, instead of upload-only.
- Frame pre-screen + smart selection (G2): blur/brightness reject + ROI/trigger gating.
- TensorRT FP16 + batched inference for YOLO (G3); warm engine at startup.
- Target: ingest → flagged-defect in **< 10 s** v1, then tighten to < 5 s.
- **Outcome:** real-time detection capability — directly answers competitor's strongest claim.

### Phase C — Detection quality (Weeks 11–16, overlaps B)
- Upgrade Correlation Engine (G5): tracking-based dedup, multi-camera voting, Bayesian fusion, composite alert score, optional trajectory matching.
- Per-camera false-positive baseline (their Algo 13) feeding our analytics tier.
- **Outcome:** higher precision/recall, defensible RDSO-grade confidence scoring.

### Phase D — Alerting & observability (Weeks 15–20)
- Alert Service (G6): MQTT + SMS/WhatsApp/email, dedup window, decoupled from AI.
- Prometheus + Grafana dashboards; health thresholds + paging.
- Watchdogs + supervised restart + circuit breakers (G8).
- **Outcome:** out-of-band alerts + production-grade ops.

### Phase E — Scale, edge fleet & hardening (Weeks 21–24)
- K8s for cloud tier; k3s/fleet agent + OTA rollout for edge nodes.
- Terraform IaC; secrets management; DR drills.
- Load + chaos testing to acceptance targets below.
- **Outcome:** multi-station scale with edge real-time + cloud aggregation — the hybrid that beats a single-box appliance.

---

## 5. Acceptance Targets (Match or Beat Competitor)

Adopt their Section 11 targets as our bar, add fleet-scale targets they lack:

| Metric | Competitor target | Our target |
|---|---|---|
| Ingest/trigger → alert latency | < 5 s | < 5 s (Phase B: < 10 s) |
| YOLO inference P99 | < 15 ms (batch 4) | < 20 ms after TensorRT |
| Defect precision / recall | > 95% / > 92% | ≥ match, tracked in MLflow |
| Coach OCR accuracy | > 98% | ≥ 98% |
| Storage / clean train | < 5 MB | < 5 MB (event-driven retention) |
| False-positive alert rate | < 2% trains | < 2%, + Bayesian fusion |
| System uptime | > 99.5% | > 99.5% per station |
| **Stations managed (ours only)** | 1 (N/A) | **N stations, central fleet** |
| **Cross-train analytics (ours only)** | baseline stat only | full trend/RCA/MLflow |

---

## 6. One-Page Summary for Stakeholders

- Competitor built a fast **single-site edge box**. We built a **multi-station cloud platform**. Their strengths are latency + efficiency; ours are scale + governance.
- Don't rebuild their appliance. **Bolt their edge ideas onto our cloud platform** = hybrid that wins both axes.
- **Top 5 actions, best ROI first:**
  1. Event-driven storage retention (cost win, week 1).
  2. TensorRT + smart frame gate (GPU cost + speed).
  3. Real-time streaming ingestion path (closes headline gap).
  4. Upgrade correlation: multi-cam voting + Bayesian fusion (accuracy/defensibility, pure software).
  5. Alert Service (MQTT/SMS/WhatsApp) + Prometheus/Grafana (ops parity).
- **Foundational debt to clear regardless:** Docker, CI/CD, IaC, secrets, observability, edge fleet management.
