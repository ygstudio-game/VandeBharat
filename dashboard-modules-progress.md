# Dashboard Modules — Implementation Progress

Source: `6.2 Dashboard Modules` requirement table vs. current implementation audit (2026-06-18).
Module #3 (Virtual Train Inspection Portal / 3D) is **skipped entirely** — existing non-3D coach view in `TrainWorkspace.jsx` is considered sufficient, 3D is out of scope.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Groundwork (shared dependencies for later phases) ✅

- [x] Add chart library to frontend — installed `recharts` in `frontend/package.json`
- [x] Add export utility — `frontend/src/lib/export.js` (`exportToCSV`, `exportToJSON`, `exportToXLSX` via new `xlsx` dependency)
- [x] Decide on RBAC role enum — `admin | rdso_inspector | zr_officer | field_staff`, codified in `frontend/src/lib/roles.js` and `backend/src/constants/roles.js` (not yet wired into `User.role` DB field — that's Phase 4)
- [x] Confirm Jetson hardware metrics approach — **decision: simulate for now** (no physical Jetson device available yet); Phase 3 will return plausible mock values, swap to real `nvidia-smi`/sensor reads later

---

## Phase 1 — Low-risk, data-already-exists (new pages/endpoints only) ✅

### 1A. Coach Search ✅
- [x] Backend: `GET /api/coaches/search?q=` — `backend/src/routes/coaches.js`, matches `coach_number` or `session.train_number` (case-insensitive)
- [x] Backend: response includes per-coach summary (health score, critical defects, missing components, defect/OCR counts, session info) — full drill-down reuses existing `/api/sessions/:id/coaches/:coachId/intelligence` + `/frames` via click-through
- [x] Frontend: `frontend/src/pages/CoachSearch.jsx` — search bar + result cards
- [x] Frontend: route `/coach-search` + nav entry in `Shell.jsx`
- [x] Frontend: clicking a result navigates to `/train/:sessionId` (existing TrainWorkspace coach view)

### 1B. OCR Results Log ✅
- [x] Backend: `GET /api/ocr-results` — `backend/src/routes/ocrResults.js`, paginated (`limit`/`offset`), filterable by `coachNumber`/`minConfidence`/`validOnly`
- [x] Frontend: `frontend/src/pages/OcrResultsLog.jsx` — table with thumbnail, coach number, detected text, confidence, valid flag, train, timestamp
- [x] Frontend: route `/ocr-log` + nav entry in `Shell.jsx`
- [x] Frontend: filter bar (coach number, min confidence, valid-only toggle) + pagination controls
- [x] Frontend: CSV/JSON export buttons wired to Phase 0 `lib/export.js`

### 1C. Defect Alert Console (promoted from embedded section to standalone) ✅
- [x] Frontend: extracted "Recent Defects" logic out of `Dashboard.jsx` into standalone `frontend/src/pages/DefectAlertConsole.jsx`
- [x] Frontend: route `/defect-console` + nav entry in `Shell.jsx`
- [x] Backend: added `defects_found` WS event — `pipelineOrchestrator.js` now broadcasts per-coach after correlation when defects are found (supplements polling, doesn't replace it — `getRecentDefects` polling kept as fallback for `POLLING MODE`)
- [x] Frontend: condensed version still embedded on Dashboard; "View All" button links to `/defect-console`; shared `DefectPreviewModal` extracted to `components/dashboard/DefectPreviewModal.jsx` for reuse

---

## Phase 1.5 — Module Renaming & Navigation Alignment ✅

Source: `CHANGES.pdf` (2026-06-18) — official module naming convention. Pure relabeling, no new data/logic. Route paths kept unchanged to avoid breaking existing links; only display labels/headers renamed.

| PDF name | Change made |
|---|---|
| Live Train Monitor | `Dashboard.jsx` nav label + h1 "OPERATIONS DASHBOARD" → "LIVE TRAIN MONITOR"; `Shell.jsx` sidebar subtitle "RDSO_MVIS Operations Control" → "Live Train Monitor" |
| Defect Alert Console | `Shell.jsx` nav label "Defect Console" → "Defect Alert Console" |
| Virtual Train Inspection Portal | `TrainWorkspace.jsx` header now carries a "Virtual Train Inspection Portal" label (Inspection Timeline / Frame Timeline remain nested here per spec — no structural change needed, already correct) |
| Coach Search | Already matched — no change |
| OCR Results Log | `Shell.jsx` nav label "OCR Log" → "OCR Results Log" |
| Defect Analytics | `Analytics.jsx` nav label + h1 "ANALYTICS & METRICS" → "DEFECT ANALYTICS" |
| System Health Dashboard | `Infrastructure.jsx` nav label + h1 "SYSTEM & INFRASTRUCTURE" → "SYSTEM HEALTH DASHBOARD" |
| Historical Reports | `Reports.jsx` nav label + h1 "AUDIT & COMPLIANCE REPORTS" → "HISTORICAL REPORTS" |
| User Management | `Settings.jsx` tab label "Users & Role Authority" → "User Management" |

- [x] `Shell.jsx` — nav labels + sidebar subtitle renamed
- [x] `Dashboard.jsx` — h1 renamed to "LIVE TRAIN MONITOR"
- [x] `Analytics.jsx` — h1 renamed to "DEFECT ANALYTICS"
- [x] `Reports.jsx` — h1 renamed to "HISTORICAL REPORTS"
- [x] `Infrastructure.jsx` — h1 renamed to "SYSTEM HEALTH DASHBOARD"
- [x] `TrainWorkspace.jsx` — header labeled "Virtual Train Inspection Portal"
- [x] `Settings.jsx` — "Users & Role Authority" tab renamed to "User Management"

**Structural note carried into Phase 3:** Camera Health Monitor currently lives as a tab inside `Infrastructure.jsx` ("Camera Feeds & Triggers"). Per the original spec table these are two distinct modules — Phase 3 will split Camera Health Monitor out into its own route + nav item rather than keeping it as a System Health Dashboard tab.

---

## Phase 2 — Defect Analytics ✅

- [x] Backend: `GET /api/analytics/defects-over-time?range=` — `backend/src/routes/analytics.js`, buckets by hour (24h) or day (7d/30d)
- [x] Backend: `GET /api/analytics/defects-by-type?range=` — Prisma `groupBy` on `defect_type`
- [x] Backend: `GET /api/analytics/defects-by-coach-class?range=` — grouped by `Coach.coach_type` (currently mostly "Unclassified" — pipeline doesn't populate `coach_type` yet; data-population gap, not an endpoint bug)
- [x] Backend: `GET /api/analytics/inference-latency?range=` — avg `completed_at - started_at` per `PipelineStage.stage`, not the unused `stats` JSON field (more reliable signal)
- [x] Frontend: wired `recharts` into `Analytics.jsx` — replaced empty placeholders with 4 live charts (defect trend line, defect-by-type bar, defect-by-coach-class bar, inference latency bar) via shared `ChartCard` wrapper
- [x] Frontend: existing 24h/7d/30d time-range toggle now drives all 4 chart queries
- [x] Frontend: Export to CSV/JSON/Excel buttons wired to Phase 0 `lib/export.js`, exporting all 4 chart series at once
- [x] Verified: all 4 endpoints smoke-tested against live DB via fastify inject, return real data; frontend build/lint clean

---

## Phase 3 — Camera Health Monitor & System Health Dashboard ✅

### 3A. Camera Health Monitor ✅
- [x] Backend: uptime calculation per camera — `backend/src/routes/cameraHealth.js`, derived from the last 20 `SessionCamera` rows per `Camera` (`frame_count` vs `dropped_frames`), real DB data (not simulated — this is genuinely tracked pipeline data)
- [x] Backend: `GET /api/cameras/health` — returns all registered cameras with uptime %, status, last-seen, grouped by station
- [x] Backend: auto-alert flag — `alert: true` when uptime < 90% (threshold returned in response, not hardcoded on frontend)
- [x] Frontend: new standalone `frontend/src/pages/CameraHealthMonitor.jsx` page (moved out of the `Infrastructure.jsx` "Camera Feeds & Triggers" tab per CHANGES.pdf — Camera Health Monitor and System Health Dashboard are distinct modules)
- [x] Frontend: route `/camera-health` + nav entry in `Shell.jsx`
- [x] Frontend: per-camera card with status dot, uptime %, destructive-bordered card + alert banner when below threshold
- [x] Verified: smoke-tested against live DB, returns real camera/uptime data

### 3B. System Health Dashboard ✅
- [x] Backend: `GET /api/health/system` — GPU/CPU/Memory/SSD/UPS telemetry, **simulated** per the Phase 0 decision (no physical Jetson available yet); response includes `simulated: true` flag so the frontend can show a disclosure banner
- [x] Backend: SSD health % + storage used/total included
- [x] Backend: UPS battery % + mains/battery source included
- [x] Frontend: model inference times surfaced by reusing the Phase 2 `/api/analytics/inference-latency` endpoint (no duplicate logic) in a new "Model Inference Times" table on the GPU tab
- [x] Frontend: `Infrastructure.jsx` — removed the "Camera Feeds & Triggers" tab (moved to 3A); GPU/Memory tab renamed "Node Telemetry" and wired to real (simulated) metrics via `MetricBar` components, with a "SIMULATED" disclosure banner
- [x] Verified: smoke-tested `/api/health/system` against running server, returns plausible values; lint + build clean

---

## Phase 4 — User Management (RBAC + 2FA) — Frontend preview only ✅

**Decision (2026-06-18): backend auth/RBAC/2FA explicitly NOT implemented this phase.** Only the UI was built so stakeholders can review the look/flow. A visible dev-mode banner was added to `Settings.jsx` stating authentication, RBAC enforcement, and 2FA are disabled and this is a frontend preview with no backend enforcement. Revisit backend items below in a future phase if/when real auth is greenlit.

- [x] Frontend: `Settings.jsx` — dev-mode disclosure banner ("authentication... disabled in this build") added above the tabs
- [x] Frontend: "User Management" tab rebuilt — role legend (4 cards using `lib/roles.js` `ROLES`/`ROLE_LABELS`), live user table with inline role-reassignment `<select>`, add/remove user (local state only, no persistence)
- [x] Frontend: 2FA setup/verification UI — `TwoFactorSetupModal` component: mock QR placeholder + 6-digit code input + "Verify & Enable" (purely visual, no real TOTP secret generated, no backend call)
- [x] Frontend: per-user 2FA badge toggle (ON/OFF) in the user table
- [x] Verified: lint + build clean

**Explicitly deferred (not started — needs a real go-ahead before touching backend):**
- [ ] Backend: update `User.role` enum to `admin | rdso_inspector | zr_officer | field_staff`
- [ ] Backend: migration for existing users to new role values
- [ ] Backend: auth middleware — enforce role-based access control on protected routes
- [ ] Backend: add 2FA enrollment + verification flow (TOTP-based, e.g. `otplib`)
- [ ] Backend: populate `AuditLog` model on real actions (currently mock-only in UI)
- [ ] Frontend: wire the mock user list/role-select/2FA UI to real backend endpoints once they exist
- [ ] Frontend: Audit Log tab reads from real backend data instead of mock entries

---

## Phase 5 — Historical Reports completion ✅

**Scope note:** "Auto-generated PDF reports per shift/day/week. Includes FP/FN log, system uptime" (original spec) is a separate aggregate report, distinct from the existing per-session PDF report (which stays untouched). Built as a JSON aggregate (`PeriodicReport` model), **not a PDF** — real PDF rendering for this aggregate would need the Python `report_generator` service extended, which is a follow-up, not done here.

- [x] Backend: Prisma schema — added `DefectReviewLog` (FP/FN/confirmed capture) and `PeriodicReport` (shift/day/week aggregate) models; pushed via `prisma db push` (additive, no migration conflicts)
- [x] Backend: capture mechanism — `POST/GET /api/sessions/:id/review-log` (`backend/src/routes/reviewLog.js`); syncs `Defect.review_status` when a `defect_id` is provided
- [x] Backend: `GET /api/review-log` (`reviewLogGlobal.js`) — flat cross-session list for the Historical Reports UI
- [x] Backend: scheduler — `backend/src/services/periodicReportScheduler.js`, checks every 15 min on server start (`run.js`), auto-generates the previous shift/day/week's aggregate once its boundary has passed (shift = 8h blocks, day = midnight, week = Monday)
- [x] Backend: aggregate includes total/completed/failed sessions, total + critical defects, FP/FN counts, and `system_uptime_pct` — defined as `completed / (completed + failed)` sessions in the period (a real-data proxy; no continuous service-uptime monitor exists yet, see System Health Dashboard which is simulated)
- [x] Backend: `GET /api/periodic-reports` + `POST /api/periodic-reports/generate` (manual trigger, useful since a "week" boundary only rolls over naturally once a week)
- [x] Frontend: `components/reports/PeriodicReportsPanel.jsx` — shows latest shift/day/week cards (sessions, uptime, defects, FP/FN) with "Generate Now" buttons, plus a Defect Review Log table + manual log-entry form, embedded into `Reports.jsx` below the existing reports table
- [x] Verified: smoke-tested all new endpoints against the live DB (create + list review-log entries, manual periodic report generation, listing); lint + build clean

---

## Phase 6 — Live Train Monitor polish

- [ ] Frontend: surface animated rake diagram (already exists in `TrainWorkspace.jsx`) on the main `Dashboard.jsx` view
- [ ] Frontend: confirm WebSocket push covers all required real-time states (in-progress, not just completion events)

---

## Explicitly Skipped

- **#3 Virtual Train Inspection Portal (3D)** — not pursued; existing non-3D coach view in `TrainWorkspace.jsx` is considered sufficient for now.
