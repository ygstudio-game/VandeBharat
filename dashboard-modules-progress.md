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

## Phase 1 — Low-risk, data-already-exists (new pages/endpoints only)

### 1A. Coach Search
- [ ] Backend: add `GET /api/coaches/search?q=` endpoint (matches coach_number or train_number)
- [ ] Backend: response includes full inspection history for matched coach (sessions, defects, frames summary)
- [ ] Frontend: new `CoachSearch.jsx` page with search bar
- [ ] Frontend: route + nav entry for Coach Search
- [ ] Frontend: results list → click-through to existing coach detail view (reuse TrainWorkspace coach view)

### 1B. OCR Results Log
- [ ] Backend: add `GET /api/ocr-results` endpoint (all OcrResult rows, paginated, filterable by date/confidence/coach)
- [ ] Frontend: new `OcrResultsLog.jsx` page with table (coach number, confidence, raw image thumbnail, timestamp)
- [ ] Frontend: route + nav entry for OCR Results Log
- [ ] Frontend: basic filter (date range, min confidence)
- [ ] Frontend: hook into Phase 0 export utility (CSV/JSON export of filtered rows)

### 1C. Defect Alert Console (promote from embedded section to standalone)
- [ ] Frontend: extract "Recent Defects" logic out of `Dashboard.jsx` into standalone `DefectAlertConsole.jsx` page
- [ ] Frontend: route + nav entry for Defect Alert Console
- [ ] Backend: switch polling → WebSocket push for new defect events (reuse existing `/ws` session socket pattern)
- [ ] Frontend: keep condensed/recent version embedded on Dashboard (link "View all" → full console)

---

## Phase 2 — Defect Analytics

- [ ] Backend: aggregation endpoint — defect counts over time (daily/weekly/monthly buckets)
- [ ] Backend: aggregation endpoint — defect counts per defect type
- [ ] Backend: aggregation endpoint — defect counts per coach class
- [ ] Frontend: wire chart library (Phase 0) into `Analytics.jsx` empty containers
- [ ] Frontend: "Defect Distribution per Component Group" chart — connect to real data
- [ ] Frontend: "Model Inference Latency Trend" chart — connect to `PipelineStage.stats` data (already in DB, unused)
- [ ] Frontend: defect-trends-over-time chart (new)
- [ ] Frontend: per-coach-class breakdown chart (new)
- [ ] Frontend: Export to Excel/CSV/JSON button using Phase 0 export utility

---

## Phase 3 — Camera Health Monitor & System Health Dashboard

### 3A. Camera Health Monitor
- [ ] Backend: define "uptime" calculation logic per camera (based on `Camera`/`SessionCamera` heartbeat or frame-capture success rate)
- [ ] Backend: `GET /api/cameras/health` endpoint — live status for all 8 cameras per site
- [ ] Backend: auto-alert rule — flag/notify when a camera's uptime drops below 90%
- [ ] Frontend: replace `Infrastructure.jsx` placeholder "Synchronized Camera Feed Registry" with live camera health grid
- [ ] Frontend: visual alert indicator for cameras below threshold

### 3B. System Health Dashboard
- [ ] Backend: wire actual GPU/CPU/Memory utilisation (nvidia-smi or equivalent) — replace placeholder
- [ ] Backend: add SSD health metric
- [ ] Backend: add UPS battery level metric
- [ ] Backend: expose `PipelineStage.stats` (model inference times) via health/system endpoint
- [ ] Frontend: extend `Infrastructure.jsx` GPU/Memory tabs with the above real metrics

---

## Phase 4 — User Management (RBAC + 2FA)

- [ ] Backend: update `User.role` enum to `admin | rdso_inspector | zr_officer | field_staff`
- [ ] Backend: migration for existing users to new role values
- [ ] Backend: auth middleware — enforce role-based access control on protected routes
- [ ] Backend: add 2FA enrollment + verification flow (TOTP-based, e.g. `otplib`)
- [ ] Backend: populate `AuditLog` model on real actions (currently mock-only in UI)
- [ ] Frontend: `Settings.jsx` "Users & Role Authority" tab — replace static demo table with real user list/CRUD
- [ ] Frontend: role assignment UI restricted to Admin role
- [ ] Frontend: 2FA setup/verification UI (login flow + settings)
- [ ] Frontend: Audit Log tab reads from real backend data instead of mock entries

---

## Phase 5 — Historical Reports completion

- [ ] Backend: scheduled job for auto-report generation (shift / day / week cadence)
- [ ] Backend: FP/FN (false positive/negative) log — data model + capture mechanism
- [ ] Backend: include FP/FN log + system uptime aggregate in generated report content
- [ ] Frontend: `Reports.jsx` — surface FP/FN log and uptime stats in report view/download

---

## Phase 6 — Live Train Monitor polish

- [ ] Frontend: surface animated rake diagram (already exists in `TrainWorkspace.jsx`) on the main `Dashboard.jsx` view
- [ ] Frontend: confirm WebSocket push covers all required real-time states (in-progress, not just completion events)

---

## Explicitly Skipped

- **#3 Virtual Train Inspection Portal (3D)** — not pursued; existing non-3D coach view in `TrainWorkspace.jsx` is considered sufficient for now.
