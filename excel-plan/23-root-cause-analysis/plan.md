# Root Cause Analysis Dashboard

## 1. Task Overview
Advanced analytics module that correlates defects across coaches, trains, cameras, and environmental conditions to identify root causes of recurring defects. Generates investigation reports with probable causes and corrective action tracking.

## 2. Current Codebase Status
**NOT STARTED.**

Foundation:
- All defect data exists in PostgreSQL (defects, coaches, sessions, cameras)
- Defect Analytics (module 6) covers basic counts/trends
- No correlation engine across defects from different sessions/trains exists

## 3. Required Role
- AI/ML Engineer
- Backend Developer
- Frontend Developer
- Business Analyst (for RCA methodology definition)

## 4. Role-Based Working Prompt
"You are an AI/ML engineer and backend developer. Build the Root Cause Analysis Dashboard. Create a backend engine that correlates defects: (1) by camera ID (same camera → hardware issue), (2) by coach number/type (same coach → manufacturing issue), (3) by train speed (speed-dependent defects), (4) by time of day (environmental). Rank probable root causes by correlation strength. Track corrective actions: operator logs what was done and when. Build a Recharts-powered visualization of defect correlation clusters."

## 5. Implementation Plan
1. Backend: `GET /api/rca/correlation` — correlate defects by camera_id, coach_number, session_date; return ranked correlation groups
2. Backend: `GET /api/rca/defect-clusters` — cluster recurring defects by type + location (coach position + camera)
3. Backend: `GET /api/rca/failure-trends?type=&camera_id=` — time-series of a specific defect type per camera
4. Add `CorrectiveAction` Prisma model: id, defect_type, camera_id, description, performed_by, performed_at, effectiveness
5. Backend: `POST /api/rca/corrective-actions`, `GET /api/rca/corrective-actions`
6. Backend: `POST /api/rca/report/generate` — generate RCA investigation report (PDF or JSON)
7. Frontend: new `frontend/src/pages/RootCauseAnalysis.jsx`
8. Defect correlation heatmap (Recharts ScatterChart or custom SVG)
9. Top-N root cause ranking panel
10. Corrective actions log with effectiveness tracking
11. Report generation button
12. Register route `/rca` in Shell.jsx

## 6. Files Likely to be Modified
- `backend/prisma/schema.prisma` — add CorrectiveAction model
- `backend/src/routes/` — new `rca.js` route file
- `services/report_generator/` — extend for RCA PDF generation
- `frontend/src/pages/RootCauseAnalysis.jsx` — new file
- `frontend/src/pages/Shell.jsx` — add nav entry

## 7. Dependencies
- Sufficient defect data in DB (requires multiple sessions with defects)
- Defect Analytics (module 6) data model (done)
- Report generator service (done, needs extension for RCA format)

## 8. Testing Plan
- Unit tests: Correlation algorithm with known defect dataset
- API tests: Correlation endpoint returns ranked groups with correct camera/coach attribution
- Integration tests: Run multiple sessions with same defect type; verify RCA identifies the pattern
- UI tests: Heatmap renders, corrective action log works

## 9. Acceptance Criteria
- Correlation engine identifies defects that cluster by camera/coach/type
- Root causes ranked by correlation strength
- Corrective action tracking functional
- RCA report generated (PDF or JSON)
- Visualization loads within 5 seconds

## 10. Risk Areas
- Insufficient data (few sessions) makes correlation statistically meaningless — document minimum data requirement
- Correlation ≠ causation — UI must present this as "probable" causes only
- RCA algorithm complexity may be high — start with simple frequency-based clustering

## 11. Rollback Plan
- New models + page; additive changes only

## 12. Completion Checklist
- [ ] Code reviewed
- [ ] Feature implemented
- [ ] Tests passed
- [ ] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
