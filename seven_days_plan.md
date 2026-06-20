# Vande Bharat Automated Train Inspection System — 7-Day Production Readiness Plan

**Created:** 2026-06-20
**Updated:** 2026-06-20 — revised against `D:\Vande_Bharat_Updates\plan.md` (current real state of the codebase, more advanced than initially assessed)
**Goal:** Move from "functionally complete MVP" to a demonstrably more production-grade platform within 7 days — closing the highest-risk reliability, security, and observability gaps named in the architecture review.
**Deadline:** 7 days

---

## 0. Scope Decision (read this first)

`D:\Vande_Bharat_Updates\plan.md` (the current architecture review) establishes the real baseline:

- **Already working:** video upload → frame extraction → YOLO-first OCR → trigger_id sync → coach mapping → defect correlation → PDF/JSON report, all 7 services wired via direct HTTP from a Node orchestrator. Frontend fully wired to real data (no mocks). WebSocket live stage updates work. Dashboard modules (Coach Search, OCR Log, Defect Console, Analytics, Camera Health, System Health, User Management, Historical Reports) exist.
- **Explicitly acknowledged gaps (from the review):**
  1. No real job queue — HTTP fire-and-forget orchestration, no resumability, no back-pressure (Phase 7 in source review)
  2. Single Node orchestrator = single point of failure, no horizontal scale
  3. GPU services (YOLO/OCR) are single-instance, unscaled, unbatched (Phase 8)
  4. No human-feedback → retraining loop — the review log is write-only, doesn't feed model improvement (Phase 9)
  5. No model version lifecycle / registry / rollback safety net
  6. No real observability — System Health Dashboard is simulated, no cross-service tracing (Phase 11)
  7. RBAC/auth/2FA/audit log are **frontend-only**, zero backend enforcement (Phase 10) — explicitly called a hard blocker for any real deployment, not a nice-to-have
  8. Minor cleanup: `coach_type` not populated (degenerate analytics), periodic reports are JSON not PDF (Phase 12)

A full close-out of all 6 phases (7–12) in 7 days is not realistic — Phase 8 (GPU scaling/batching) and Phase 9 (full retraining loop with shadow-eval) are multi-week efforts on their own. This plan applies the source review's own sequencing rationale (Section 4 of `plan.md`) under a hard 7-day budget: take the foundation phase to completion, take the hard security blocker to completion, and take partial, honestly-scoped slices of the rest.

### What gets FULLY closed in 7 days
- **Phase 7 — Job queue & resumable pipeline** (foundation everything else depends on)
- **Phase 10 — Real RBAC, auth, 2FA, audit log** (explicit pre-deployment hard blocker, frontend UI already built — backend-only lift)
- **Phase 12 — Dashboard cleanup** (`coach_type` populate, periodic report PDF) — cheap, do opportunistically

### What gets PARTIALLY closed (documented honestly as in-progress)
- **Phase 9 — Retraining loop:** dataset export job + `ModelVersion` registry table, manual-trigger retrain script. **No shadow-eval automation, no scheduled retraining** — flagged as roadmap.
- **Phase 11 — Observability:** trace_id correlation + structured JSON logs + one real metric (GPU utilization via `nvidia-smi`) replacing one simulated System Health value. **No full Prometheus/Grafana stack, no alerting pipeline** — flagged as roadmap.

### What is explicitly OUT of scope, deferred to roadmap
- **Phase 8 — GPU scaling/batching** (multi-replica routing, micro-batching) — needs hardware inventory decision (per Section 5 of source review) and load testing infra that can't be stood up and validated in this window.
- Broker choice between Redis Streams vs RabbitMQ — **decision made below for this plan** (Redis Streams, per source review's own recommendation: lighter ops, reuses existing Postgres+Cloudinary infra pattern) so Day 1 isn't blocked on a sign-off.

---

## Day 1 — Job Queue Foundation (Phase 7, part 1)

**Objective:** Replace the direct HTTP fire-and-forget orchestration with a durable, replayable queue for at least the highest-risk stages.

### Tasks
1. **Stand up Redis Streams** alongside existing Postgres/Cloudinary infra (already-decided broker per source review recommendation — don't burn a day on this decision).
2. **Define stream topics** per pipeline stage: `frame_extraction`, `ocr`, `sync`, `correlation`, `report`.
3. **Convert Node orchestrator** (`pipelineOrchestrator.js`) from direct HTTP calls to: publish job → stage worker (existing Python service, wrapped with a small consumer loop) claims job from stream, processes, publishes next stage's job.
4. **Persist stage job state** in the existing `PipelineStage` model — write `claimed_at`, `completed_at`, `worker_id` so a crashed worker's job is visible as stuck (visibility timeout pattern), not silently lost.

### Exit criteria
- A test session runs through `frame_extraction → ocr` via the queue (not direct HTTP), with stage state persisted and visible in `PipelineStage`.

---

## Day 2 — Job Queue Foundation (Phase 7, part 2) + Resumability

**Objective:** Full pipeline runs end-to-end through the queue with retry/DLQ; Node API becomes stateless.

### Tasks
1. **Finish wiring remaining stages** (`sync`, `correlation`, `report`) through Redis Streams consumers.
2. **Per-stage retry with exponential backoff** — N attempts before a job moves to a dead-letter stream.
3. **Dead-letter queue surfaced** as a real (non-simulated) metric on the System Health Dashboard — this is the first simulated→real flag retirement.
4. **Verify statelessness:** kill the Node API process mid-pipeline on a test session, restart it, confirm an in-flight job is re-claimed from the stream rather than lost.

### Exit criteria
- Full 5-stage pipeline runs through the queue on a real sample video, end to end.
- Killing/restarting the orchestrator mid-run does not lose the session — job resumes from last persisted stage.
- DLQ depth is a real metric, not simulated.

---

## Day 3 — Real RBAC, Auth, 2FA, Audit Log (Phase 10 — full close)

**Objective:** Close the explicit hard pre-deployment blocker. Frontend UI is already built (per source review) — this is backend enforcement only.

### Tasks
1. **`User.role` migration** to the 4-role enum (per source review's existing design intent) — confirm/finish Prisma model.
2. **Auth middleware** enforcing role checks on all protected routes (sessions, reports, sign-off, user management, model registry endpoints added later).
3. **Real TOTP-based 2FA** (`otplib`) replacing the existing mock modal — wire to the already-built frontend setup UI.
4. **`AuditLog` populated on real mutating actions:** uploads, report generation, report sign-off, review-log entries, role changes. Append-only at the application layer.
5. **Wire existing frontend RBAC/2FA/audit UI** (already correct shape per source review) to these new real endpoints — minimal frontend changes expected.

### Exit criteria
- Hitting a protected endpoint as a non-privileged role returns 403, verified by test.
- 2FA setup → login flow works with real TOTP, not the mock modal.
- A real mutating action (e.g., report sign-off) produces a verifiable `AuditLog` row.

---

## Day 4 — Human Feedback → Model Retraining Loop (Phase 9 — partial close)

**Objective:** Stop the review log being write-only. Build the dataset export + model registry; defer automated shadow-eval to roadmap.

### Tasks
1. **Dataset export job:** `DefectReviewLog` entries marked FP/FN/confirmed → pull associated frame + annotation → write to a versioned training-data store (Cloudinary folder + manifest file, reusing existing storage pattern — no new infra).
2. **Model registry table:** new Prisma model `ModelVersion` (`model_name`, `version`, `weights_url`, `metrics`, `status` [`staging`/`active`/`rolled_back`], `created_at`).
3. **Manual-trigger retrain script** (not scheduled/automated): takes exported dataset, fine-tunes `best.pt` / `train_num_detector.pt`, registers result as a new `ModelVersion` in `staging`.
4. **`model_manager.py` reads active pointer from registry**, not a static file path — enables rollback by flipping the pointer, even without automated shadow-eval gating it yet.

### Exit criteria
- A reviewer-flagged FP/FN frame is traceable through to an exported training manifest entry.
- A `ModelVersion` row exists with `status=staging` after a manual retrain run.
- Flipping the `active` pointer in the registry actually changes which weights `model_manager.py` loads on next restart (rollback proven).

### Explicitly deferred (documented in submission)
- Automated shadow-eval against held-out sessions before promotion — manual comparison only for now.
- Scheduled/automatic retraining — manual trigger only, per source review's own recommendation (automate only once enough FP/FN volume justifies it).

---

## Day 5 — Observability (Phase 11 — partial close) + Dashboard Cleanup (Phase 12)

**Objective:** Make debugging a failed session possible without correlating logs across 4 terminals. Close cheap dashboard gaps.

### Tasks
1. **`trace_id`/`session_id` correlation** across all 7 services in structured JSON logs (replace any `print`/`console.log` debug output in the pipeline path).
2. **One real metrics retirement:** add real `nvidia-smi`-sourced GPU utilization reading, feed it into the System Health Dashboard's "Node Telemetry" tab in place of a simulated value.
3. **`coach_type` population:** fix in `sync_engine` or `correlation` stage so "Defects by Coach Class" analytics stop showing "Unclassified."
4. **Periodic Reports → PDF:** extend `report_generator` service to render shift/day/week aggregate as PDF (currently JSON-only).

### Exit criteria
- A failed session's logs can be filtered by a single `trace_id` across all services.
- System Health Dashboard shows at least one real (not simulated) GPU metric.
- Coach-class analytics show real classes, not "Unclassified," on a freshly run session.
- A periodic report downloads as PDF, not JSON.

### Explicitly deferred (documented in submission)
- Full Prometheus/Grafana metrics stack and `/metrics` endpoints per service.
- Alerting hooks on DLQ growth / error rate spikes (DLQ metric itself exists from Day 2 — alerting on it does not).

---

## Day 6 — Integration Testing + Security/Regression Pass

**Objective:** Confirm everything built Days 1–5 actually works together, not just individually.

### Tasks
1. **Full pipeline regression:** run 3 real sample videos end-to-end through the queue-based pipeline (Day 1–2 work), confirm reports generate, sign-off locks correctly, audit log populates correctly for each.
2. **RBAC regression:** test all 4 roles against all protected routes, confirm correct allow/deny matrix — including the new model registry and retrain-trigger endpoints from Day 4 (these must be role-gated, not open).
3. **Failure injection:** kill a Python worker mid-job, confirm DLQ/retry behavior (Day 2) actually engages instead of silently hanging.
4. **Secrets hygiene check:** confirm no credentials committed, confirm `.env` separation between dev and any deployed environment.
5. **Fix whatever breaks** — this day is intentionally buffer-heavy since Days 1–5 are dense.

### Exit criteria
- 3 consecutive full-pipeline runs complete via the queue with no manual intervention.
- Role-gating matrix verified correct across all routes touched this week.
- A killed worker's job is retried/DLQ'd, not lost or hung indefinitely.

---

## Day 7 — Demo Preparation + Submission Documentation

**Objective:** System is demo-ready; documentation matches `D:\Vande_Bharat_Updates\plan.md`'s own honest gap framing.

### Tasks
1. **Demo script:**
   - Upload sample video → show queue-based pipeline progressing live via WebSocket → show resumability (kill/restart orchestrator mid-run, show it recovers) → show coach hierarchy + defect intelligence panel with real `coach_type` → generate + sign off a report (PDF) → show attempted regeneration of a locked report creates a new version → log in as a restricted role and show a 403 on a privileged action → show real-time 2FA login → show one DLQ/retry recovery from a forced worker kill → show System Health Dashboard's real GPU metric.
2. **Submission document:** update/produce final summary covering:
   - What was fully closed: Phase 7 (queue), Phase 10 (RBAC/auth/2FA/audit), Phase 12 (cleanup).
   - What was partially closed and exactly what's missing: Phase 9 (no shadow-eval automation), Phase 11 (no full metrics stack/alerting).
   - What remains fully open: Phase 8 (GPU scaling/batching) — explicitly flagged as needing a hardware inventory decision before work can start.
3. **Final regression + freeze:** one more full pipeline + RBAC + failure-injection pass, fix any last issues, code freeze.

### Exit criteria
- Demo script runs cleanly start to finish at least twice in rehearsal.
- Submission document accurately reflects what was built vs. deferred — no overclaiming Phase 8/9/11 completeness.

---

## Hand-off Roadmap (Post-Submission)

In priority order, per the source architecture review's own sequencing rationale:

1. **Phase 8 — GPU service scaling & batching.** Requires hardware inventory decision (GPU count/VRAM headroom — open decision per source review Section 5) before committing to multi-process replicas vs. in-process micro-batching. Load test against realistic concurrency once hardware is known.
2. **Phase 9 completion — automated shadow-eval.** Add the held-out-batch comparison step before model promotion, replacing the Day 4 manual-comparison stopgap.
3. **Phase 11 completion — full observability stack.** Prometheus-style `/metrics` per service, Grafana dashboards, alerting webhooks on DLQ growth / error rate spikes.
4. **Retraining cadence decision.** Move from manual-trigger to scheduled automated retraining once FP/FN review volume justifies it (per source review's own recommendation — don't automate prematurely).
5. **Data localization / compliance review** (carried from prior assessment): confirm whether Cloudinary (foreign-hosted) is acceptable for Indian Railways inspection imagery, or whether migration to India-hosted storage is required.
6. **Full security penetration testing** beyond the Day 3/6 RBAC functional verification.
