# Defect Alert Console

## 1. Task Overview
Standalone real-time alert dashboard showing all defects detected across sessions. Supports severity filtering (Critical/Major/Minor), alert acknowledgment, and a condensed embedded view on the main Dashboard. Operators use this to triage defects as they are discovered by the AI pipeline.

## 2. Current Codebase Status
**DONE.** Implemented in Dashboard modules Phase 1C.

Completed:
- `frontend/src/pages/DefectAlertConsole.jsx` — standalone full page
- Route `/defect-console` registered in Shell.jsx
- Backend: `defects_found` WebSocket event broadcast from `pipelineOrchestrator.js`
- Embedded condensed version on `Dashboard.jsx` with "View All" button
- `frontend/src/components/dashboard/DefectPreviewModal.jsx` — shared modal

## 3. Required Role
- Frontend Developer (maintenance only)
- QA Engineer

## 4. Role-Based Working Prompt
"You are a QA engineer reviewing the Defect Alert Console. Verify that defect alerts appear in real-time as sessions process, that severity filters (Critical/Major/Minor) work correctly, that the embedded Dashboard preview matches the full console, and that acknowledge/dismiss actions behave as expected. Document any bugs found."

## 5. Implementation Plan
1. Verify all severity levels render correctly (Critical → red, High → orange, Medium → yellow, Low → blue)
2. Verify WebSocket `defects_found` event updates the list without page reload
3. Test filter combinations (severity + date range if applicable)
4. Confirm "View All" from Dashboard correctly navigates to `/defect-console`
5. Check empty state when no defects exist

## 6. Files Likely to be Modified
- `frontend/src/pages/DefectAlertConsole.jsx` (bug fixes only)
- `frontend/src/components/dashboard/DefectPreviewModal.jsx` (bug fixes only)

## 7. Dependencies
- WebSocket gateway (done)
- Backend pipeline orchestrator defect broadcast (done)
- `GET /api/sessions/:id/coaches/:coachId/intelligence` (done)

## 8. Testing Plan
- Unit tests: Render DefectAlertConsole with mock defects at each severity
- Integration tests: Run a real session with `best.pt`, verify defects appear
- API tests: Poll `intelligence` endpoint; confirm defect data structure matches UI expectations
- UI tests: Test filter UI, modal open/close, navigation from Dashboard

## 9. Acceptance Criteria
- Defects appear within 2 seconds of WebSocket `defects_found` event
- Severity filter correctly hides/shows relevant defects
- Modal shows frame image, bbox overlay, confidence score
- No console errors during normal operation

## 10. Risk Areas
- If `best.pt` is missing, no defects are ever generated — test with mock data fallback
- WebSocket disconnect scenario: UI should degrade gracefully to polling

## 11. Rollback Plan
- Module is isolated — revert `DefectAlertConsole.jsx` only if breaking issues found

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented
- [ ] Tests passed
- [x] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
