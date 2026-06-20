# Station Monitoring Dashboard

## 1. Task Overview
Multi-station monitoring view showing health and activity of all MVIS (Machine Vision Inspection System) deployment locations. Aggregates camera status, active sessions, and system health per station into a single consolidated view.

## 2. Current Codebase Status
**NOT STARTED.**

Foundation:
- Camera model has a `location` or `station` field (verify in Prisma schema)
- `GET /api/cameras/health` groups cameras by station already
- No multi-station configuration or aggregation API exists

## 3. Required Role
- Full Stack Developer
- Backend Developer
- Frontend Developer

## 4. Role-Based Working Prompt
"You are a full stack developer. Build the Station Monitoring Dashboard. Create a `Station` Prisma model (id, name, location, code, status). Associate cameras, sessions, and assets with stations. Build a `GET /api/stations/overview` endpoint that returns per-station: camera health summary, active session count, last inspection, system health status. Build a frontend page with a station grid — each station card shows health at a glance. Clicking a station drills down to its cameras and recent sessions."

## 5. Implementation Plan
1. Add `Station` Prisma model: id, name, code, location, latitude, longitude, status
2. Add `station_id` FK to Camera, Session (and Asset from module 20)
3. Backend: `GET /api/stations` — list all stations
4. Backend: `GET /api/stations/overview` — per-station aggregate: camera_health_pct, active_sessions, last_inspection_at, system_status
5. Backend: `GET /api/stations/:id/detail` — cameras, recent sessions, health history
6. Frontend: new `frontend/src/pages/StationMonitoringDashboard.jsx`
7. Station grid: card per station with health score, camera count, active sessions
8. Status badges: Online / Degraded / Offline based on thresholds
9. Drill-down panel or navigation to station-specific view
10. Register route `/stations` in Shell.jsx

## 6. Files Likely to be Modified
- `backend/prisma/schema.prisma` — add Station model, FKs on Camera + Session
- `backend/src/routes/` — new `stations.js` route
- `frontend/src/pages/StationMonitoringDashboard.jsx` — new file
- `frontend/src/pages/Shell.jsx` — add nav entry

## 7. Dependencies
- Camera model (done), Session model (done)
- CameraHealthMonitor data already grouped by station

## 8. Testing Plan
- API tests: Overview endpoint returns correct aggregates per station
- Unit tests: Health status threshold logic (Online/Degraded/Offline)
- UI tests: Station grid renders, drill-down works
- Integration tests: Assign cameras to stations; verify station overview reflects correct counts

## 9. Acceptance Criteria
- All MVIS stations visible in grid view
- Camera health % correctly aggregated per station
- Active session count correct
- Status badges reflect real-time state
- Drill-down shows station cameras and recent sessions

## 10. Risk Areas
- Adding `station_id` to Camera and Session tables requires migration + data backfill
- Longitude/latitude may not be available for all locations — make optional fields

## 11. Rollback Plan
- Station model is additive; FK additions to Camera/Session require migration but are nullable

## 12. Completion Checklist
- [ ] Code reviewed
- [ ] Feature implemented
- [ ] Tests passed
- [ ] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
