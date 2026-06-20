# Camera Health Monitor

## 1. Task Overview
Standalone dashboard showing real-time health status of all registered cameras. Displays uptime percentage, last-seen timestamp, alert flags (uptime < 90%), and groups cameras by station. Separate module from System Health Dashboard.

## 2. Current Codebase Status
**DONE.** Implemented in Dashboard modules Phase 3A.

Completed:
- `frontend/src/pages/CameraHealthMonitor.jsx` — per-camera cards with uptime %, alert banners
- Route `/camera-health` in Shell.jsx
- Backend: `GET /api/cameras/health` in `backend/src/routes/cameraHealth.js`
- Uptime derived from last 20 `SessionCamera` rows (frame_count vs dropped_frames)
- Alert: `alert: true` when uptime < 90%

## 3. Required Role
- QA Engineer
- Backend Developer (maintenance)

## 4. Role-Based Working Prompt
"You are a QA engineer validating the Camera Health Monitor. Verify that cameras registered in the DB appear with correct uptime calculations, that the alert threshold (90%) triggers correctly, and that the grouped-by-station view is correct. Test edge cases: camera with no sessions, camera with 100% uptime, camera below threshold."

## 5. Implementation Plan
1. Verify all cameras from DB appear on the page
2. Test uptime calculation correctness (simulate dropped frames in SessionCamera)
3. Test alert card border/banner appears below 90%
4. Check station grouping
5. Test with camera that has never been in a session (edge case)

## 6. Files Likely to be Modified
- `frontend/src/pages/CameraHealthMonitor.jsx` (bug fixes)
- `backend/src/routes/cameraHealth.js` (bug fixes)

## 7. Dependencies
- Camera and SessionCamera tables (done), sessions pipeline (done)

## 8. Testing Plan
- API tests: `GET /api/cameras/health` returns correct uptime for known cameras
- Unit tests: Uptime calculation logic
- UI tests: Alert state rendering, station group rendering

## 9. Acceptance Criteria
- All cameras visible with correct uptime %
- Alert triggers at 90% threshold
- Station grouping is correct
- Empty state when no cameras registered

## 10. Risk Areas
- New cameras with no sessions show 0% uptime — this may incorrectly trigger alert; add "no data" state
- `dropped_frames` field may not always be populated by frame extractor

## 11. Rollback Plan
- Revert `CameraHealthMonitor.jsx` and `cameraHealth.js`

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented
- [ ] Tests passed
- [x] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
