# Coach Search

## 1. Task Overview
Search interface allowing operators to find specific coaches by coach number or train number across all historical inspection sessions. Results show per-coach health summary with drill-down into the full TrainWorkspace view.

## 2. Current Codebase Status
**DONE.** Implemented in Dashboard modules Phase 1A.

Completed:
- `frontend/src/pages/CoachSearch.jsx` — search bar + result cards
- Route `/coach-search` in Shell.jsx
- Backend: `GET /api/coaches/search?q=` in `backend/src/routes/coaches.js`
- Result drill-down navigates to `/train/:sessionId`

## 3. Required Role
- QA Engineer
- Frontend Developer (maintenance only)

## 4. Role-Based Working Prompt
"You are a QA engineer testing the Coach Search feature. Verify search by coach number, train number, and partial matches. Check that result cards display correct health score, critical defect count, and session date. Confirm clicking a result opens the correct TrainWorkspace coach view."

## 5. Implementation Plan
1. Test search with exact coach number (e.g., "B2")
2. Test search with train number (5-6 digits)
3. Test partial match (e.g., first 3 chars)
4. Test empty search result state
5. Verify result card data matches what's in the DB

## 6. Files Likely to be Modified
- `frontend/src/pages/CoachSearch.jsx` (bug fixes only)
- `backend/src/routes/coaches.js` (bug fixes only)

## 7. Dependencies
- Sessions and coaches data in PostgreSQL (done)
- TrainWorkspace route (done)

## 8. Testing Plan
- Unit tests: Search component renders with mock results
- Integration tests: Search against live DB with known data
- API tests: `GET /api/coaches/search?q=B2` returns correct shape

## 9. Acceptance Criteria
- Search returns results within 500ms
- Partial matches work (case-insensitive)
- Empty state shown when no results
- Drill-down opens correct session/coach context

## 10. Risk Areas
- Search on empty DB returns unclear error — ensure graceful empty state
- Very large coach tables may need query optimization (add DB index on coach_number)

## 11. Rollback Plan
- Revert `CoachSearch.jsx` and `coaches.js` if broken

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented
- [ ] Tests passed
- [x] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
