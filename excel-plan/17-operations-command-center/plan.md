# Operations Command Center

## 1. Task Overview
Unified single-screen operations hub for supervisors. Aggregates active sessions, camera health, system health, recent defects, and pending verifications into one view. Includes incident tracking for system issues and escalation workflows.

## 2. Current Codebase Status
**NOT STARTED.**

Related content exists in separate pages:
- Dashboard.jsx — live train monitor (KPIs + queue)
- CameraHealthMonitor.jsx — camera health
- Infrastructure.jsx — system health
- DefectAlertConsole.jsx — defect alerts

No unified command center page exists. No incident tracking model exists.

## 3. Required Role
- Full Stack Developer
- Frontend Developer
- UI/UX Designer
- Backend Developer

## 4. Role-Based Working Prompt
"You are a senior frontend developer and UI/UX designer. Build the Operations Command Center — a single-screen supervisor dashboard. Combine widgets from existing pages: live session status panel (from Dashboard), camera health summary (from CameraHealthMonitor), system health KPIs (from Infrastructure), and recent critical defects (from DefectAlertConsole). Add an Incident Tracker panel where supervisors can log system issues, set severity (P1/P2/P3), and track resolution. Use a responsive CSS grid layout."

## 5. Implementation Plan
1. Backend: `POST /api/incidents` — create incident (title, severity, description, assigned_to)
2. Backend: `GET /api/incidents` — list incidents with status (open/in_progress/resolved)
3. Backend: `PATCH /api/incidents/:id` — update incident status
4. Add `Incident` Prisma model: id, title, severity, status, created_by, resolved_at
5. Frontend: new `frontend/src/pages/OperationsCommandCenter.jsx`
6. Grid layout: 4 quadrants — ActiveSessions widget, CameraHealthSummary widget, SystemHealthKPI widget, RecentCriticalDefects widget
7. Incident Tracker panel (full-width at bottom): log/view/resolve incidents
8. Reuse existing API endpoints; no data duplication
9. Register route `/command-center` in Shell.jsx

## 6. Files Likely to be Modified
- `backend/prisma/schema.prisma` — add Incident model
- `backend/src/routes/` — new `incidents.js` route file
- `frontend/src/pages/OperationsCommandCenter.jsx` — new file
- `frontend/src/pages/Shell.jsx` — add nav entry
- `frontend/src/components/dashboard/` — extract reusable widgets if needed

## 7. Dependencies
- Dashboard KPI API (done)
- Camera health API (done)
- System health API (done)
- Defect alert data (done)

## 8. Testing Plan
- API tests: CRUD for Incident model
- UI tests: All 4 quadrant widgets render; incident log/update flow
- Integration tests: Create incident, resolve it, verify status change

## 9. Acceptance Criteria
- Single page shows all key operational metrics without switching tabs
- Incident tracker allows P1/P2/P3 severity logging
- All widgets update in near-real-time (WebSocket or polling)
- Incident resolution time tracked
- Page loads within 3 seconds

## 10. Risk Areas
- Combining multiple data sources may cause race conditions on page load — use parallel fetching
- Supervisor role will need access to this page before RBAC is finalized

## 11. Rollback Plan
- New standalone page with new Incident model; additive Prisma change

## 12. Completion Checklist
- [ ] Code reviewed
- [ ] Feature implemented
- [ ] Tests passed
- [ ] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
