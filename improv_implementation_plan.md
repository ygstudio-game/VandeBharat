# VandeInspect AI — Implementation Plan (Phases B, C, D-subset)

**Scope:** Phase B (full) → Phase C (full) → Phase D (email alerts + watchdogs/supervised restart + circuit breakers ONLY).
**Explicitly excluded from Phase D:** MQTT, SMS, WhatsApp alert channels; Prometheus/Grafana; K8s/edge fleet; Terraform/IaC. (Those stay in the original `IMPROVEMENT_PLAN.md` backlog.)
**Author role:** Senior DevOps / Platform Engineering.

---

## 0. The Hard Rule — Module Gating Protocol

> **No module is "done" until it is implemented, tested, AND verified working. You may NOT start the next module until the current module's Exit Gate is GREEN.**

Every module below has the same five-part contract:

1. **Goal** — what it does, in one line.
2. **Touch** — files created/changed.
3. **Build** — implementation steps.
4. **Test** — automated tests that must pass (unit + integration).
5. **Verify** — manual/observed proof it works as intended.
6. **Exit Gate** — the measurable pass criteria. ALL must be ✅ before next module.

### Gate enforcement (mechanical)
- Each module = one feature branch `feat/B1-...`, one PR. PR cannot merge unless:
  - CI green (lint + that module's tests),
  - Exit Gate checklist ticked in PR description,
  - Demo evidence attached (log snippet / screenshot / benchmark number).
- A module's tests are **added to the permanent CI suite** — later modules must keep them green (no regressions).
- If a gate fails → fix in place. Do **not** "come back to it later." Later modules depend on it.

### Definition of Done (applies to every module)
- [ ] Code merged to integration branch
- [ ] Unit tests pass locally + in CI
- [ ] Integration test passes against real adjacent service (not just mocks)
- [ ] Manual verification evidence captured
- [ ] Exit Gate metrics met and recorded in this file's progress log (Section 5)
- [ ] No regression in prior modules' tests
- [ ] Config externalized (no hardcoded values), structured JSON log line emitted

---

## 1. Module B0 — Test Harness Foundation (PREREQUISITE, do first)

**Reason:** repo currently has **zero project tests**. Gating is impossible without a runner. Build this before any feature work.

- **Goal:** standard test + CI scaffolding so every later module has somewhere to put tests and a gate to pass.
- **Touch:**
  - `pytest.ini` (root), `tests/` dirs per Python service (`GPU/yolo/tests/`, `GPU/ocr/`, `services/correlation/`, `services/sync_engine/`, `services/frame_extractor/`).
  - Node: `backend/test/` with `node:test` (built-in) or `vitest`; add `"test"` script to `backend/package.json`.
  - `.github/workflows/ci.yml` — matrix: python services (pytest) + node (test) + ruff/eslint lint.
  - `docker-compose.test.yml` — spins Redis + a throwaway Postgres for integration tests.
- **Build:**
  1. Add `pytest`, `pytest-asyncio`, `httpx`, `requests-mock` to each service `requirements-dev.txt`.
  2. One smoke test per service: import server module, hit FastAPI `/health` via `TestClient` → 200. (Add `/health` route if missing.)
  3. Node smoke test: queue publish→consume round-trip against compose Redis.
  4. CI runs on PR; fails build on any test/lint failure.
- **Test:** the smoke tests themselves.
- **Verify:** push a PR with a deliberately failing test → CI goes red. Fix → green. Proves the gate actually blocks.
- **Exit Gate:**
  - ✅ `pytest` green for all 6 Python services (smoke level)
  - ✅ `npm test` green in backend
  - ✅ CI fails on red, passes on green (demonstrated)
  - ✅ `/health` endpoint on every service returns 200 with `{service, status, version}`

---

## 2. PHASE B — Real-Time Path

Goal of phase: move from upload→batch to a streaming ingest path with smart frame selection and TensorRT inference. Target ingest→flagged-defect **< 10 s** (v1), tighten toward **< 5 s**.

### Module B1 — Streaming Ingestion Service
- **Goal:** pull live camera/RTSP (or simulated stream) → emit timestamped `FramePacket`-equivalent into the pipeline, parallel to existing upload path. Upload path stays working.
- **Touch:** new `services/ingestion/` (FastAPI + OpenCV `VideoCapture`), publishes frames to a new Redis stream `vande:stream:ingest`; reuse `backend/src/queue`.
- **Build:**
  1. RTSP/file/loop source (config-driven `source_uri`). For dev, loop a sample video to simulate a live camera.
  2. Per-frame: assign monotonic `frame_number`, `timestamp_ms`, `camera_id`, `trigger_id`.
  3. Bounded buffer + back-pressure: if downstream lags, **drop oldest** (never block capture). Emit `frames_dropped` counter.
  4. Publish frame ref (store frame bytes in temp object store / shared volume, pass URL — not raw bytes through Redis).
- **Test:**
  - Unit: timestamp monotonicity; drop-oldest under simulated backlog; reconnect on source loss.
  - Integration: start service against sample stream → N frames land in `vande:stream:ingest` with strictly increasing `frame_number`.
- **Verify:** run against a looping sample video; watch frames flow; kill source → service logs `CameraOffline`, auto-reconnects.
- **Exit Gate:**
  - ✅ Sustains source FPS with **0 unbounded memory growth** over 10 min
  - ✅ Drop-oldest verified (no producer stall when consumer paused)
  - ✅ Auto-reconnect within configured window after source drop
  - ✅ Upload/batch path still passes its B0 smoke tests (no regression)

### Module B2 — Frame Quality Pre-Screen (Algorithm 9)
- **Goal:** reject blurry/dark/overexposed frames on CPU **before** they reach the GPU.
- **Touch:** `services/ingestion/quality_gate.py` (or a filter step consuming `vande:stream:ingest`).
- **Build:** Laplacian variance (sharpness) + mean brightness check; thresholds in `config.yaml` (`blur_threshold`, `brightness_min/max`). Pass → forward; reject → log + drop with reason.
- **Test:**
  - Unit: fixture set of {sharp, blurry, dark, overexposed} images → correct accept/reject. Assert classifier ≥ 95% correct on labeled fixtures.
  - Perf: < 1 ms/frame on CPU (assert mean over 1000 frames).
- **Verify:** feed mixed-quality clip → dashboard/log shows ~15–30% rejected, all rejects genuinely bad on eyeball check.
- **Exit Gate:**
  - ✅ ≥ 95% accept/reject accuracy on labeled fixture set
  - ✅ < 1 ms/frame mean
  - ✅ Reject reason logged (structured JSON), counter exposed

### Module B3 — Smart Frame Selection (Scheduler-lite)
- **Goal:** send only frames likely to contain a component-of-interest to inference, not every passing frame. Cut GPU frames 50%+.
- **Touch:** `services/ingestion/scheduler.py`.
- **Build:**
  1. v1 (no trigger sensors in our setup): motion/ROI-based — select frames where coach/bogie ROI shows expected content; coast (skip) inter-coach gaps. Adaptive rate (full during coach, ~10% between).
  2. If trigger/speed metadata available later, swap in physics prediction (`frame_idx = (t_arrival - buffer_start)*FPS`). Keep interface stable so the upgrade is drop-in.
  3. Tag selected frame with `task: OCR | YOLO | BOTH`, `roi`, `associated_coach` (best-effort).
- **Test:**
  - Unit: on a clip with known coach boundaries, selected frames fall inside coach windows; inter-coach frames skipped.
  - Metric: frames-to-GPU reduced ≥ 50% vs naive, with **no drop** in coaches detected.
- **Verify:** side-by-side run (naive vs scheduled) on same clip → same coaches found, far fewer GPU calls (logged count).
- **Exit Gate:**
  - ✅ ≥ 50% fewer frames forwarded to inference
  - ✅ 0 missed coaches vs naive baseline on test clips
  - ✅ Interface ready for physics-trigger upgrade (documented)

### Module B4 — TensorRT FP16 Batched Inference
- **Goal:** 2× YOLO throughput via TensorRT FP16, batch=4, warm engine at startup. Replaces eager PyTorch in `GPU/yolo`.
- **Touch:** `GPU/yolo/server.py`, new `GPU/yolo/trt_engine.py`, export script `GPU/yolo/scripts/export_trt.sh`.
- **Build:**
  1. Export `best.pt` → ONNX (opset 17) → `trtexec --fp16 --batch=4 --saveEngine=mvis.engine`.
  2. Load engine once at startup; batched inference with CUDA streams (overlap pre/infer/post); NMS on GPU.
  3. **Keep PyTorch path behind a config flag** (`INFERENCE_BACKEND=trt|torch`) for fallback + accuracy diff.
- **Test:**
  - Accuracy: run both backends on a labeled validation set → assert **mAP drop < 1%** TRT vs Torch.
  - Latency: assert P99 batch-of-4 < 20 ms (target), warn-line at competitor's 15 ms.
  - Contract: `/api/yolo/predict` response schema unchanged (correlation engine must not care which backend ran).
- **Verify:** load test 4-frame batches; record P50/P95/P99; confirm identical detections on a sample image both backends.
- **Exit Gate:**
  - ✅ mAP drop < 1% vs PyTorch baseline
  - ✅ P99 < 20 ms/batch
  - ✅ API response schema byte-compatible (correlation tests still green)
  - ✅ Fallback to torch via config flag works

### Module B5 — Real-Time Wiring + Latency Benchmark
- **Goal:** connect B1→B2→B3→B4→existing OCR/correlation into one live path; prove end-to-end latency.
- **Touch:** `backend/src/services/pipelineOrchestrator.js` (add streaming trigger), wiring config.
- **Build:** stream frames through gate→scheduler→inference→correlation; flagged defect surfaces to DB + WebSocket in real time.
- **Test:** integration — synthetic live clip with **known injected defect at known time** → assert defect row appears within latency budget.
- **Verify:** stopwatch run: inject defect → measure ingest→defect-visible.
- **Exit Gate:**
  - ✅ End-to-end ingest→flagged-defect **< 10 s** (P95)
  - ✅ Known injected defect detected (no miss) across 10 runs
  - ✅ Batch/upload path unaffected (full B0+prior tests green)
  - 🎯 Stretch: tighten to < 5 s before closing Phase B

**PHASE B EXIT (all of B1–B5 gates green) → proceed to Phase C.**

---

## 3. PHASE C — Detection Quality (Correlation Engine Upgrade)

Goal: convert raw per-frame detections into one authoritative, deduplicated, confidence-scored per-coach result using multi-camera evidence. All in `services/correlation/engine.py` (+ new modules). **Pure software — no hardware change.** Each algorithm is independently unit-testable with synthetic events (competitor's own recommended approach).

> Implement as a pipeline of pure functions over a `DefectEvent` list so each module is tested in isolation before chaining.

### Module C0 — DefectEvent model + state machine
- **Goal:** introduce `DefectEvent` struct + state enum `NEW→TRACKED→CORRELATED→VALIDATED→CONFIRMED→ALERTED→ARCHIVED`.
- **Touch:** `services/correlation/events.py`.
- **Test:** state transitions legal-only (illegal transition raises). Serialization round-trip.
- **Exit Gate:** ✅ state machine rejects illegal transitions; ✅ schema persisted to DB (migration added).

### Module C1 — Tracking-based Duplicate Suppression
- **Goal:** same physical component across consecutive frames = ONE event, not N. (DeepSORT-lite / IoU.)
- **Touch:** `services/correlation/tracking.py`.
- **Build:** IoU match + class match → assign to existing track, update conf = max, bump frame_count; else new track; prune after N idle frames.
- **Test:** synthetic — spring on frames 210/211/212 (same location) → **1** event, `frame_count=3`, conf = max. Two different springs → 2 events.
- **Verify:** real clip with a persistent defect → DB shows single event, not one-per-frame.
- **Exit Gate:** ✅ N consecutive detections collapse to 1; ✅ distinct components stay distinct; ✅ no over-merge across bogies.

### Module C2 — Multi-Camera Voting
- **Goal:** weight cameras by angle/distance; combine votes into agreement fraction.
- **Touch:** `services/correlation/voting.py`; `camera_weights` in `config.yaml`.
- **Test:** competitor's worked example → weighted confidence within tolerance of 0.743; abstain/missing camera handled.
- **Verify:** 3-camera synthetic case logs per-camera votes + final agreement.
- **Exit Gate:** ✅ matches reference calc; ✅ missing-camera degrades gracefully; ✅ weights config-driven.

### Module C3 — Bayesian Confidence Fusion
- **Goal:** sequential Bayesian update across independent cameras (stronger than averaging).
- **Touch:** `services/correlation/fusion.py`.
- **Test:** competitor example (0.91, 0.88, 0.94) → fused ≈ 0.999 (assert within 1e-3); disagreement case lowers confidence correctly; order-independence sanity check.
- **Exit Gate:** ✅ matches worked example; ✅ handles conflicting evidence sanely.

### Module C4 — Composite Alert Score + Trajectory Matching
- **Goal:** final score from 5 sources `Score = 0.35Y + 0.20T + 0.20M + 0.15Q + 0.10O`; trajectory check across cameras (Algo 8) as confirm/flag.
- **Touch:** `services/correlation/scoring.py`, `trajectory.py`.
- **Build:** composite score; threshold (`alert_threshold=0.92`, config) → CONFIRMED vs REVIEW queue. Trajectory: predicted arrival at next camera vs actual; within tolerance → bonus, else flag for human review.
- **Test:** worked example → 0.886 < 0.92 → routes to review (not alert). Trajectory match (3 ms < 20 ms tol) → confirm; 272 ms → flag.
- **Verify:** end-to-end synthetic train pass → correct CONFIRMED vs REVIEW routing.
- **Exit Gate:** ✅ score matches reference; ✅ threshold routing correct; ✅ trajectory confirm/flag correct.

### Module C5 — Per-Camera False-Positive Baseline (Inter-Train Learning, Algo 13)
- **Goal:** learn persistent per-camera/per-class false positives (e.g. track-shadow) over N clean trains; subtract at inference.
- **Touch:** `services/correlation/baseline.py`; feeds analytics tier.
- **Test:** simulate 20 clean trains with a recurring phantom detection → baseline rises → phantom suppressed; reset on recalibration flag.
- **Exit Gate:** ✅ recurring FP suppressed after N trains; ✅ real defects unaffected; ✅ baseline resettable.

**PHASE C EXIT (C0–C5 gates green, full correlation integration test on a multi-camera synthetic train pass) → proceed to Phase D.**

Integration acceptance for Phase C:
- ✅ Precision ≥ 95%, recall ≥ 92% on labeled validation set (tracked in MLflow)
- ✅ False-positive alert rate < 2% of trains
- ✅ Each algorithm unit-tested in isolation AND chained pipeline test green

---

## 4. PHASE D — Selected Hardening (email alerts + resilience ONLY)

> Per scope: implement **D1 email alerts**, **D2 watchdogs + supervised restart**, **D3 circuit breakers**. Nothing else from original Phase D.

### Module D1 — Email Alert Service
- **Goal:** confirmed defect (state CONFIRMED, score ≥ threshold) → email to configured recipients. Decoupled — polls DB, **never calls AI directly**.
- **Touch:** new `services/alerting/` (or `backend/src/services/alertService.js`); SMTP via TLS (`smtplib`/nodemailer); `config.yaml` SMTP block + recipients.
- **Build:**
  1. Poll confirmed-defect events (1 s interval) OR consume an `alerts` stream.
  2. **Dedup window** (config `dedup_window_sec`, default 60) — one email per defect per coach, not per detection.
  3. Email = coach id, defect class, score, station, timestamp, evidence thumbnail link (REST URL, image stays in store).
  4. Retry with backoff on SMTP failure; dead-letter after max attempts.
- **Test:**
  - Unit: dedup window (3 detections same defect/coach → 1 email); template renders required fields; backoff on simulated SMTP error.
  - Integration: against a local fake SMTP (e.g. MailHog/`aiosmtpd`) → email captured with correct content.
- **Verify:** trigger a confirmed defect → MailHog inbox shows exactly one correctly-formatted email; duplicate detections produce none extra.
- **Exit Gate:**
  - ✅ Exactly-one-email-per-defect-per-coach within dedup window
  - ✅ Email contains coach/defect/score/station/time + evidence link
  - ✅ SMTP failure → retry+backoff, then DLQ (no crash, no lost-silently)
  - ✅ Alert service never imports/calls YOLO/OCR (verified by dependency check)

### Module D2 — Watchdogs + Supervised Restart
- **Goal:** every service is health-checked; a hung/dead service is auto-restarted; nothing silently stays down.
- **Touch:** `services/_supervisor/` (or extend `start.js`); each service exposes `/health` (from B0) + liveness heartbeat.
- **Build:**
  1. Supervisor pings each `/health` on interval; missed N pings → restart that process (supervised, with exponential backoff cap to avoid crash-loop storms).
  2. Heartbeat/watchdog inside long-running loops (ingestion, inference) — if a worker stops progressing (no frame processed for T sec), self-flag unhealthy.
  3. Structured event on every restart (service, reason, attempt#).
- **Test:**
  - Integration: kill a service → supervisor restarts it within budget; assert recovery + event logged.
  - Crash-loop guard: a service that fails on boot → backoff increases, supervisor stops hammering, raises critical.
- **Verify:** `kill -9` the YOLO service mid-run → it comes back, pipeline resumes (Redis Streams resumes pending jobs via existing XAUTOCLAIM), no data lost.
- **Exit Gate:**
  - ✅ Each service auto-restarts after kill within configured budget
  - ✅ In-flight jobs not lost (resumed from stream)
  - ✅ Crash-loop backoff prevents restart storm
  - ✅ Every restart logged with reason

### Module D3 — Circuit Breakers on External Dependencies
- **Goal:** failing external deps (Cloudinary, Neon Postgres, SMTP) trip a breaker → fail fast + degrade gracefully instead of cascading hangs.
- **Touch:** wrap external calls in `backend/src/services/*` and Python `GPU/shared/db_client.py`, `cloudinary_client.py` with a breaker (e.g. `opossum` Node / custom Python).
- **Build:**
  1. Breaker states CLOSED→OPEN→HALF_OPEN with failure-rate + timeout thresholds (config).
  2. On OPEN: queue/buffer writes locally (DB writer already async via stream), serve degraded (e.g. skip thumbnail upload, keep event in DB), emit health event.
  3. HALF_OPEN probe restores service when dep recovers.
- **Test:**
  - Unit: breaker opens after threshold failures; rejects fast while open; half-open probe closes on success.
  - Integration: simulate Cloudinary 500s → uploads buffer, pipeline keeps flagging defects (no full stall); Postgres blip → writes retry from queue.
- **Verify:** block Cloudinary/Postgres at network level mid-run → system stays responsive, recovers automatically when restored, no lost confirmed defects.
- **Exit Gate:**
  - ✅ Breaker opens/half-opens/closes per spec
  - ✅ Dependency outage does NOT stall capture/inference
  - ✅ No confirmed defect lost during a simulated 2-min dep outage
  - ✅ Breaker state transitions logged

**PHASE D-subset EXIT → project increment complete.**

---

## 5. Progress Log (update as gates close — single source of truth)

| Module | Branch | Tests added | Exit Gate | Status | Evidence |
|---|---|---|---|---|---|
| B0 Test harness | `dev20` | `GPU/shared/tests/test_health.py` (12), `backend/test/queue.keys.test.js` (4) | ✅ | unit 12✅ + node 4✅; ruff clean; red→exit1 / green→exit0 proven |
| B1 Streaming ingest | `dev20` | `services/ingestion/tests/` (11 unit: frame/buffer/pipeline) + `test_redis_integration.py` (compose) | ◑ | unit 11✅ (monotonic, drop-oldest, reconnect proven); ruff clean. Integration tier (real Redis XADD) wired, **run in compose to close** |
| B2 Quality pre-screen | `dev20` | `test_quality_gate.py` (6) + `test_pipeline_screen.py` (2) | ✅ | 100-sample accuracy ≥95%✅; **0.50 ms/frame** (<1ms)✅; reasons logged+counted; ruff clean |
| B3 Smart selection | `dev20` | `test_scheduler.py` (6) + `test_pipeline_screen.py::select` (1) | ✅ | **79.7% fewer frames** (≥50%)✅; 16/16 coaches, 0 missed✅; `decide(activity,n)` ready for physics-trigger swap; ruff clean |
| B4 TensorRT inference | `dev20` | `test_inference_common.py` (7) + `test_backends.py` (7) | ✅ | 14 unit (schema/NMS/decode/select/fallback)✅. **HOST RUN (RTX-class GPU):** engine built (best.engine, FP16, batch 4); torch→trt **3.23× speedup** (107→33 ms/batch-of-4, ~9.5 ms/frame); output agreement 1.0. Strict P99<20ms NOT met (37.8ms) — that's a Jetson-specific target + includes ultralytics wrapper overhead; relative speedup is the win on this GPU. mAP-parity needs real-image run. **+ `UltralyticsEngineBackend`** (no pycuda): `INFERENCE_BACKEND=trt` loads `best.engine` via ultralytics; single-frame `/predict` padded to batch-4 internally + pad dropped — validated on GPU; 17 yolo unit tests |
| B5 RT wiring + latency | `dev20` | `test_latency.py` (4) + `test_realtime.py` (5) + `test_realtime_integration.py` (Redis) | ◑ | wiring + latency math unit-proven (injected-defect detected, P50/P95, 10-runs-no-miss)✅; cross-process epoch-clock fix✅. Full-stack P95<10s via `scripts/bench_realtime.py` on GPU host **to close** |
| C0 Event/state model | `dev20` | `services/correlation/tests/test_events.py` (7) | ✅ | legal lifecycle✅, illegal/backward transitions raise✅, serialization round-trip✅; migration `001_defect_events.sql`; ruff clean |
| C1 Tracking dedup | `dev20` | `test_tracking.py` (6) | ✅ | 3-frame & 15-frame collapse to 1 (conf=max, frame_count=N)✅; distinct springs separate✅; never merge across bogies/class✅; ruff clean |
| C2 Multi-cam voting | `dev20` | `test_voting.py` (5) | ✅ | competitor example = **0.743**✅; agreement fraction✅; missing-camera renormalizes✅; ruff clean |
| C3 Bayesian fusion | `dev20` | `test_fusion.py` (6) | ✅ | competitor example = **0.999**✅; order-independent✅; disagreement lowers✅; > naive avg✅; ruff clean |
| C4 Score + trajectory | `dev20` | `test_scoring.py` (4) + `test_trajectory.py` (4) | ✅ | composite = **0.886 → review**✅; threshold configurable✅; trajectory 3ms→confirm / 272ms→flag✅; ruff clean |
| C5 FP baseline | `dev20` | `test_baseline.py` (6) | ✅ | phantom suppressed after N clean trains✅; genuine defect untouched✅; per-camera isolation + reset✅; ruff clean |
| **C-integration** (chained C1–C5) | `dev20` | `test_correlate_v2.py` (2) | ✅ | `correlate_v2.py` chains tracking→voting→fusion→baseline→score; synthetic multi-cam pass: **precision 1.0 (≥0.95), recall 1.0 (≥0.92), FP-rate 0% (<2%)**; phantom only suppressed with baseline |
| **C WIRED into live engine** | `dev20` | `test_engine_aggregate.py` (4) | ✅ (code) / ◑ (DB) | `engine.py` now writes deduped, multi-cam-scored rows to `defect_events` alongside legacy `defects` (additive, guarded). `aggregate_candidates()` unit-tested. **Needs `migrations/001_defect_events.sql` applied to Neon + a real session to verify live** |
| D1 Email alerts | `dev20` | `test_email_alert.py` (8) + `test_email_integration.py` (MailHog) | ◑ | dedup 1/coach/defect✅; template required fields✅; retry→backoff→DLQ✅; never imports AI✅. Live MailHog tier compose-gated |
| D2 Watchdogs/restart | `dev20` | `test_watchdog.py` (5) | ✅ | restart after fail-threshold + recover✅; backoff 1→2→4→cap✅; crash-loop→CRITICAL stops✅; heartbeat staleness✅ |
| **D2 WIRED into start.js** | `dev20` | `backend/test/supervisor.test.js` (6, Node) | ✅ (code) / ◑ (host) | `backend/src/supervisor.js` (Node port) + watchdog loop in `start.js` behind `SUPERVISE=1`: probes `/health`, restarts only the dead service (not killAll), backoff + crash-loop guard + `graceMs` warmup. **Host-verify:** `SUPERVISE=1 node start.js` then kill a service → auto-respawn |
| D3 Circuit breakers | `dev20` | `test_circuit_breaker.py` (7) | ✅ | opens after N fails✅; OPEN fails fast✅; HALF_OPEN→close/reopen✅; fallback buffers event✅; transitions recorded |
| **D3 WIRED to external clients** | `dev20` | `test_external_breakers.py` (3) | ✅ | breakers on Postgres + Cloudinary clients (open/fail-fast/recovery verified). **Hot paths routed:** all 4 services' `get_conn` → `db_client.connect()`; frame_extractor upload → `cloudinary_client.upload()`. Real DB + frame-upload traffic now breaker-protected |

**Rule restated:** a row is ☑ only when implemented + tested + verified + Exit Gate met. The next row may not start until the row above is ☑.

---

## 6. Cross-Cutting Requirements (apply to every module)

- **Config:** all thresholds/URLs/weights in versioned `config.yaml` — no hardcoded values (carry forward competitor's discipline).
- **Logging:** structured JSON per service (`ts, service, level, msg, trace_id, latency_ms`); reuse `GPU/shared/logging_utils.py`.
- **No-regression:** prior modules' tests run in CI on every PR; a red prior test blocks merge.
- **Backwards compat:** existing upload/batch path and current dashboard must keep working through all of B/C/D.
- **Evidence-first:** every Exit Gate needs an attached artifact (benchmark number, log line, MailHog screenshot, test report) — claims without evidence don't close a gate.
