# VandeInspect AI — 10-Day Master Execution Plan

**Start Date:** 2026-06-20
**End Date:** 2026-06-30
**Goal:** Complete all 24 MVIS dashboard modules and bring VandeInspect AI to production readiness.

---

## Day 1 — 2026-06-20: Validation + Live Train Monitor Completion

**Theme:** Validate completed modules, finish Phase 6 rake animation.

### Tasks
- [x] ~~Module 02: Defect Alert Console~~ — QA validation pass
- [x] ~~Module 03: Virtual Train Inspection Portal~~ — QA validation pass
- [x] ~~Module 04: Coach Search~~ — QA validation pass
- [ ] Module 01: Live Train Monitor — Complete Phase 6 animated rake diagram on Dashboard

### Expected Output
- Animated rake diagram visible on Dashboard for active sessions
- All QA-validated modules documented as Done
- Any bugs from QA logged in issue tracker

### Testing Checkpoint
- Run a full session (video upload → processing → completion)
- Verify rake animation updates in real-time via WebSocket
- Confirm all Done modules have no console errors

---

## Day 2 — 2026-06-21: User Management Backend + System QA

**Theme:** Implement production authentication, RBAC, 2FA.

### Tasks
- [ ] Module 10: User Management — Full backend implementation (JWT auth, RBAC, 2FA)
- [x] ~~Module 08: System Health Dashboard~~ — QA + hardware toggle preparation
- [x] ~~Module 09: Historical Reports~~ — QA validation

### Expected Output
- `POST /api/auth/login` returns JWT
- All backend routes reject unauthenticated requests with 401
- RBAC enforced: rdso_inspector blocked from admin routes
- 2FA setup generates real TOTP QR; verify step works
- Settings.jsx user table wired to real backend

### Testing Checkpoint
- Login with admin credentials → receive JWT
- Access protected route without token → 401
- Change user role → verify DB updated
- Enable 2FA → scan QR → verify with correct code → passes

---

## Day 3 — 2026-06-22: AI Inference Management + Defect Verification Console

**Theme:** AI visibility and human-in-the-loop review.

### Tasks
- [ ] Module 11: AI Inference Management — Model registry, live metrics, activation
- [ ] Module 12: Defect Verification Console — Approve/Reject defects, dataset export

### Expected Output
- `/ai-inference` page shows active YOLO/OCR model with live FPS/latency/GPU metrics
- Model version list and activation button functional
- `/defect-verification` page shows pending defects with frame + bbox
- Confirm/Reject updates DB; keyboard shortcuts (C/R/N) work
- Dataset export generates valid YOLO-format ZIP

### Testing Checkpoint
- Query YOLO `/metrics` endpoint → returns latency and FPS
- Mark 5 defects as confirmed + 2 as false positive → verify DB update
- Export training dataset → unzip → verify images + labels directory structure

---

## Day 4 — 2026-06-23: Train Movement Timeline + Image Archive Management

**Theme:** Temporal inspection view and storage management.

### Tasks
- [ ] Module 13: Train Movement Timeline — Timeline visualization + playback
- [ ] Module 14: Image Archive Management — Retention policy + archive service

### Expected Output
- `/timeline/:sessionId` page renders horizontal timeline of coach events
- Playback steps through events in order; clicking event loads frame preview
- Archive stats page shows total images, storage used
- Archive service correctly identifies frames past retention threshold

### Testing Checkpoint
- Load timeline for a completed session → all coaches visible as segments
- Play timeline at 1× speed → events step in order
- Verify archive stats API returns valid numbers
- Manually trigger archive migration → verify `storage_tier` field updated in DB

---

## Day 5 — 2026-06-24: Train Passage History + AI Performance Analytics

**Theme:** Historical context and AI quality metrics.

### Tasks
- [ ] Module 15: Train Passage History — Historical sessions with filtering + trend
- [ ] Module 16: AI Performance Analytics — Precision/Recall/F1 tracking

### Expected Output
- `/history` page shows all completed sessions with filter bar (date, train number)
- Trend chart shows health score progression for repeated train inspections
- `/ai-performance` page shows Precision/Recall/F1 calculated from review data
- Model comparison table lists all versions with metrics

### Testing Checkpoint
- Filter by train number → only matching sessions shown
- Select a train inspected 3+ times → trend chart shows health score over time
- Verify P/R/F1 math: insert known TP/FP counts, verify formula results

---

## Day 6 — 2026-06-25: Operations Command Center + Data Synchronization Hub

**Theme:** Unified operations view and reliable messaging.

### Tasks
- [ ] Module 17: Operations Command Center — Unified dashboard + incident tracking
- [ ] Module 18: Data Synchronization Hub — RabbitMQ integration + retry logic

### Expected Output
- `/command-center` page aggregates all key metrics in one view
- Incident tracker allows P1/P2/P3 logging and resolution
- Pipeline jobs dispatched via RabbitMQ (not direct HTTP)
- Retry fires up to 3× with exponential backoff
- Queue health endpoint returns queue depth + consumer count

### Testing Checkpoint
- Create P1 incident → resolve it → verify status change in DB
- Kill sync_engine mid-processing → verify retry triggers → service comes back → session completes
- Verify queue depth shows in `/api/queue/health`

---

## Day 7 — 2026-06-26: Audit & Compliance + Railway Asset Management

**Theme:** Governance, tracking, and physical asset management.

### Tasks
- [ ] Module 19: Audit & Compliance — Real audit logging on all user actions
- [ ] Module 20: Railway Asset Management — Asset CRUD + maintenance scheduling

### Expected Output
- All key actions (login, role change, defect review) recorded in AuditLog
- `/audit` page shows searchable audit log with date/user/action filters
- CSV export of audit log works
- `/assets` page shows all registered cameras, edge PCs, UPS units
- Overdue maintenance assets highlighted with alert

### Testing Checkpoint
- Login as admin → verify AuditLog row created with correct user_id and action
- Add a camera asset with next_maintenance_at = yesterday → verify overdue alert visible
- Export audit log CSV → verify all columns present

---

## Day 8 — 2026-06-27: Station Monitoring Dashboard + Dataset Management Portal

**Theme:** Multi-site visibility and AI data infrastructure.

### Tasks
- [ ] Module 21: Station Monitoring Dashboard — Multi-station health aggregation
- [ ] Module 22: Dataset Management Portal — Dataset upload, versioning, gallery

### Expected Output
- `/stations` page shows station grid with health status per location
- Station drill-down shows cameras and recent sessions
- `/datasets` page lists registered datasets with image counts
- YOLO-format ZIP upload validated and metadata extracted
- Sample image gallery shows first 10 labeled images

### Testing Checkpoint
- Register 2 stations, assign cameras → verify station overview shows correct camera counts
- Upload a small YOLO dataset ZIP → verify image count and class list extracted
- View dataset gallery → verify images + label overlays render

---

## Day 9 — 2026-06-28/29: Root Cause Analysis + AI Training Workbench

**Theme:** Advanced AI modules — insight and retraining.

### Tasks
- [ ] Module 23: Root Cause Analysis Dashboard — Defect correlation + RCA reports
- [ ] Module 24: AI Model Training Workbench — Training pipeline UI

### Expected Output
- `/rca` page shows defect correlation heatmap and top-N probable root causes
- Corrective action log functional
- RCA report generation works (PDF or JSON)
- `/training` page shows training config form
- Training job launches and live progress chart updates per epoch
- Completed model saved to registry with option to deploy

### Testing Checkpoint
- Verify RCA correlation clusters defects correctly by camera_id
- Submit a corrective action → verify it appears in log
- Launch training with 10-image test dataset, 2 epochs → verify progress chart updates → verify model registered on completion

---

## Day 10 — 2026-06-30: QA, Regression Testing, Deployment Readiness

**Theme:** Final validation, bug fixes, documentation, deployment.

### Tasks
- [ ] Full regression test: run end-to-end pipeline with real video
- [ ] Verify all 24 modules are accessible and functional
- [ ] Fix any bugs discovered during regression
- [ ] Verify WebSocket live updates work across all pages
- [ ] Verify RBAC blocks unauthorized access correctly
- [ ] Update all plan.md completion checklists
- [ ] Update Excel sheet with final Target Dates and Status
- [ ] Prepare deployment checklist

### Expected Output
- All 24 modules functional and tested
- Zero P1/P2 bugs outstanding
- All plan.md checklists marked complete
- Excel sheet fully updated
- Deployment runbook drafted (service startup order, env vars required)

### Final Delivery Checklist
- [ ] All routes accessible without 500 errors
- [ ] WebSocket live updates verified on Dashboard, Sessions, TrainWorkspace
- [ ] RBAC: unauthenticated → 401; wrong role → 403
- [ ] PDF report generation works end-to-end
- [ ] YOLO inference returns detections on test video
- [ ] OCR correctly identifies train number from test video
- [ ] All analytics charts load with data
- [ ] Export (CSV/JSON/Excel) verified on all modules
- [ ] No hardcoded secrets in codebase
- [ ] All env vars documented in `.env.example`
- [ ] Database migrations are clean (no pending changes)
- [ ] Services start correctly in correct order
- [ ] All plan.md completion checklists updated
- [ ] Excel status column updated for all tasks

---

## Risk Contingency

| Risk | Contingency |
|------|------------|
| Module 18 (RabbitMQ) takes too long | Keep HTTP fallback, defer to post-launch |
| Module 24 (Training) blocked by GPU | Build UI and job API; defer actual training run |
| Module 10 (Auth) causes regression | Add `AUTH_ENABLED=false` toggle for emergency rollback |
| Insufficient data for RCA (module 23) | Use synthetic test data for demo; document real data requirement |
| Cloudinary quota exceeded | Switch frame storage to local disk for testing |
