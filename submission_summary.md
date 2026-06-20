# VandeInspect AI — Submission Summary

**Date:** 2026-06-20
**Scope:** 7-day production-readiness sprint (see [seven_days_plan.md](seven_days_plan.md) for the day-by-day plan this followed). Baseline before this sprint: a functionally complete MVP per `D:\Vande_Bharat_Updates\plan.md` — pipeline worked, frontend was wired to real data, but reliability, security, and observability were all explicitly named gaps.

This document states what was actually closed, what was partially closed by design, and what remains open — no overclaiming.

---

## 1. What This System Does

Vande Bharat Automated Train Inspection System: video feeds from multiple track-side cameras → frame extraction → OCR identifies train/coach number → YOLO detects components and defects → results mapped to coach/bogie/component/side/frame → audit-ready report. Full architecture in [understanding.md](understanding.md) and [progress.md](progress.md).

---

## 2. Fully Closed This Sprint

### Phase 7 — Job Queue & Resumable Pipeline
- Redis Streams between the Node orchestrator and every pipeline stage (`ocr_detection`, `synchronization`, `correlation`, `report_generation`) — replaces the prior direct fire-and-forget HTTP chain.
- Per-stage retry with exponential backoff (3 attempts) → dead-letter stream on exhaustion.
- Crash recovery via `XAUTOCLAIM` — a worker process killed mid-job doesn't lose the job.
- `PipelineStage.claimed_at` / `worker_id` / `attempts` give real per-stage audit trail of which worker did what, when.
- DLQ depth surfaced as a real (non-simulated) metric on `GET /api/health/queue` and the Infrastructure dashboard.

### Phase 10 — Real RBAC, Auth, 2FA, Audit Log
- Was previously **UI-only** with an explicit on-screen disclosure: "no backend enforcement exists yet." That disclosure is gone because the gap is gone.
- JWT auth (`bcrypt` password hashing, 8h tokens), real TOTP 2FA (`otplib` + real QR via `qrcode`, not a placeholder icon).
- Role-based route gating: `ADMIN`-only user management + audit log read; report sign-off restricted to `ADMIN`/`RDSO_INSPECTOR` (verified: `ZR_OFFICER`/`FIELD_STAFF` get a real 403, not just a UI-hidden button).
- Append-only `AuditLog` populated on every login (success/failure), 2FA state change, role change, user creation/deactivation, dataset export, model promotion, and report sign-off.
- Login screen + route guard added to the frontend (previously no login existed at all — every route was open).

### Phase 12 — Dashboard Cleanup
- `coach_type` root-cause fixed: it was never written at `Coach` row creation, so "Defects by Coach Class" analytics were structurally guaranteed to show "Unclassified" regardless of frontend work. Session now carries a `train_type`, sync engine stamps it onto every coach.
- Periodic (shift/day/week) aggregate reports now render as PDF, not JSON-only.

---

## 3. Partially Closed By Design

### Phase 9 — Human Feedback → Model Retraining Loop
**Closed:** dataset export (turns `DefectReviewLog` FP/FN/confirmed entries into a versioned training manifest), `ModelVersion` registry (staging/active/rolled_back lifecycle), `PATCH /:id/activate` doubles as the rollback mechanism, `model_manager.py` resolves active weights from the registry instead of a static file path, manual-trigger `retrain.py` CLI.
**Not closed (intentionally):** automated shadow-eval before promotion — an operator must manually compare metrics before calling `/activate`. Scheduled/automatic retraining — manual trigger only, per the source architecture review's own recommendation (automate only once feedback volume justifies it).
**Known rough edge, flagged in the code itself:** `retrain.py`'s bbox-to-YOLO-label conversion writes a placeholder — real use needs per-frame image dimensions to normalize coordinates correctly.

### Phase 11 — Observability
**Closed:** structured JSON logs across all 7 services (6 Python + Node), correlated by `trace_id`/`session_id` via a shared `contextvars`-based filter so existing log call sites didn't need individual edits. One simulated System Health metric retired — GPU utilization/VRAM/temperature now reads real `nvidia-smi` output, falling back to simulated values only if no GPU/driver is present.
**Not closed:** no Prometheus `/metrics` endpoints, no Grafana, no alerting on DLQ growth or error-rate spikes. CPU/memory/SSD/UPS readings remain simulated.

---

## 4. Explicitly Out of Scope (Roadmap)

| Item | Why deferred | What's needed |
|---|---|---|
| Phase 8 — GPU service scaling/batching | Needs a hardware inventory decision (GPU count/VRAM headroom) before committing to multi-replica vs. micro-batching | Hardware decision + load testing infra |
| Edge hardware camera trigger | Current `trigger_id` uses video-file `frame_number` as a test-mode proxy — correct for the current upload-based flow, not yet wired to real synchronized camera hardware | Physical camera install + edge firmware |
| Data localization review | Cloudinary (foreign-hosted) may not satisfy Indian Railways/CERT-In data residency requirements for inspection imagery — not evaluated | Compliance review; possible migration to India-hosted S3-compatible storage |
| Full security penetration test | Only functional RBAC verification was done (real, but not adversarial) | External pentest |
| GPU service redundancy | Single-instance OCR/YOLO services — no failover | Multi-replica deployment once hardware is sized |

---

## 5. Honesty Note on Testing

**No live Postgres, Redis, or GPU was reachable in the development sandbox this entire sprint.** Every day's work was verified the most rigorous way actually possible without live infra:
- Every new/touched file: `node --check` (JS) or `python -m py_compile` (Python) — clean, every day.
- Full app load (`require('./src/app')` with all routes registered) — clean, every day.
- `npm run build` in `frontend/` — clean, every day.
- `npx prisma validate` — clean, after all 6 schema changes made across the week.
- RBAC role-gating logic and JWT sign/verify/tamper-rejection — actually unit-tested as pure functions (no DB needed for that logic), all cases correct.
- A real bug was found this way on Day 6 (a pipeline stage's queue-claim bookkeeping was incomplete) and fixed, then re-verified.

**What this does NOT verify:** an actual end-to-end pipeline run against real video, a live worker crash-and-recover cycle, a live DLQ-after-3-retries cycle, or a real login against a live database. [progress.md](progress.md) contains a step-by-step runbook (Day 6 section) for exactly those checks once Postgres/Redis/the 6 Python services are reachable.

---

## 6. Demo Script

See [demo_script.md](demo_script.md) for the live walkthrough sequence.
