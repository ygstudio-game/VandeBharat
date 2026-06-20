# Virtual Train Inspection Portal

## 1. Task Overview
Interactive coach-level inspection workspace. Shows a visual train/coach layout, maps 8 cameras to coach positions, displays AI defect annotation overlays on captured frames, and provides a hierarchical tree (Train → Coach → Camera → Frame → Defect) for navigation. 3D visualization was explicitly out of scope.

## 2. Current Codebase Status
**DONE.** 3D explicitly skipped by design decision.

Completed:
- `frontend/src/pages/TrainWorkspace.jsx` — full train workspace with header, pipeline timeline, hierarchy panel, evidence viewer, intelligence panel, frame strip
- `frontend/src/components/workspace/` — all workspace sub-components
- Coach mapping via sync engine (trigger_id based)
- Camera-to-coach frame retrieval via `GET /api/sessions/:id/coaches/:coachId/frames`
- Defect intelligence via `GET /api/sessions/:id/coaches/:coachId/intelligence`
- Annotation overlay on frames (bbox rendering)

## 3. Required Role
- Frontend Developer (maintenance/QA only)
- QA Engineer

## 4. Role-Based Working Prompt
"You are a QA engineer validating the Virtual Train Inspection Portal. Walk through the full inspection flow: upload a video, wait for processing, navigate into a session, select a coach, browse frames, and verify defect annotations appear correctly. Document any discrepancies between the UI and the API data."

## 5. Implementation Plan
1. Validate HierarchyTree renders all coaches from `/hierarchy` endpoint
2. Verify frame strip loads paginated frames correctly
3. Verify intelligence panel shows defects with correct severity colors
4. Confirm missing components section lists undetected components
5. Check bbox overlay renders at correct coordinates on frame images
6. Test pipeline timeline progress bar reflects real stage states

## 6. Files Likely to be Modified
- `frontend/src/pages/TrainWorkspace.jsx` (bug fixes only)
- `frontend/src/components/workspace/HierarchyTree.jsx` (bug fixes only)

## 7. Dependencies
- Sync engine (done)
- Correlation engine (done)
- Backend intelligence route (done)

## 8. Testing Plan
- Integration tests: End-to-end flow with real video upload
- UI tests: Coach selection, frame pagination, defect panel
- API tests: Verify intelligence endpoint returns bbox data in correct format

## 9. Acceptance Criteria
- All coaches from hierarchy API appear in the tree
- Frame strip loads without errors and supports pagination
- Defect annotations visible on frame images
- Missing components listed correctly
- Health score displayed per coach

## 10. Risk Areas
- Bbox coordinates may be in different format (x1y1x2y2 vs xywh) — verify transform
- Large sessions (70k+ frames) may cause slow hierarchy load — verify pagination

## 11. Rollback Plan
- Component is isolated; revert individual component files if broken

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented
- [ ] Tests passed
- [x] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
