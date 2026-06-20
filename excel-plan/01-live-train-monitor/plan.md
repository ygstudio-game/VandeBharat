# Live Train Monitor

## 1. Task Overview
Real-time dashboard showing animated rake visualization of a train passing through the inspection zone. Displays live pipeline status, train queue, WebSocket-driven updates, and health KPIs. This is the primary landing screen for operators.

## 2. Current Codebase Status
**Nearly complete.** Phases 0–5 done. WebSocket live updates working. Dashboard.jsx built with KPI strip, live train queue, pipeline health. Phase 6 (animated rake diagram on Dashboard) is in progress — the rake animation already exists in TrainWorkspace.jsx but has not been surfaced on Dashboard.jsx.

Files already implemented:
- `frontend/src/pages/Dashboard.jsx` — main dashboard, WebSocket wired
- `frontend/src/components/workspace/` — contains rake animation components
- `frontend/src/hooks/useSessionSocket.js` — WebSocket hook
- `backend/src/routes/dashboard.js` — KPI endpoints

## 3. Required Role
- Frontend Developer
- UI/UX Designer (minor)

## 4. Role-Based Working Prompt
"You are a senior frontend developer on VandeInspect AI. Your task is to complete Phase 6 of the Live Train Monitor: surface the animated rake visualization that already exists in TrainWorkspace.jsx onto the main Dashboard.jsx. The rake animation should show the currently active train with its coach layout and real-time defect highlights driven by WebSocket events. Reuse existing components — do not duplicate logic. Test that it updates in real-time when a session is processing."

## 5. Implementation Plan
1. Identify the rake/coach animation component in `frontend/src/components/workspace/`
2. Extract it into a standalone shareable component if not already done
3. Import and embed it in `Dashboard.jsx` — show the most recent active session's train
4. Wire WebSocket events (stage updates, defect_found) to animate coach status changes
5. Confirm all required real-time states are covered: QUEUED, PROCESSING, COMPLETED, FAILED
6. Add fallback empty state when no active session
7. Lint and build check

## 6. Files Likely to be Modified
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/components/workspace/` (rake animation component)
- `frontend/src/hooks/useSessionSocket.js` (if new event types needed)

## 7. Dependencies
- WebSocket gateway (Phase 6 of pipeline — already done)
- Backend `GET /api/dashboard` endpoints (already done)

## 8. Testing Plan
- Unit tests: Render rake component with mock coach data; verify coach status colors
- Integration tests: Upload a video session, verify rake updates in real-time on Dashboard
- UI tests: Check empty state; check coach highlight on defect_found event
- API tests: Not applicable (UI-only change)

## 9. Acceptance Criteria
- Animated rake diagram visible on Dashboard for the most recent active session
- Coach status updates in real-time via WebSocket without page refresh
- All pipeline states (queued/processing/completed/failed) reflected visually
- No performance regression on Dashboard load time
- Lint and build pass

## 10. Risk Areas
- Rake component may have internal state assumptions tied to TrainWorkspace — need to verify it can be used standalone
- WebSocket event schema may need extension to carry coach-level status to Dashboard

## 11. Rollback Plan
- Git revert `Dashboard.jsx` to previous commit if rake breaks layout
- Rake component extraction is additive — original TrainWorkspace unaffected

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented — `RakeVisualization.jsx` created, `Dashboard.jsx` wired
- [x] No breaking changes — additive only, TrainWorkspace untouched
- [x] ESLint: 0 errors
- [ ] Browser test — start `npm run dev` from Windows terminal, verify at localhost:5173/dashboard
- [x] Excel status updated
