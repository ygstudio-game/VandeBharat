# Train Passage History

## 1. Task Overview
Historical dashboard showing all previous train inspection runs. Operators can browse past sessions by date, train number, or rake ID. Each record shows the train's health summary, defect counts, and links to the full inspection report.

## 2. Current Codebase Status
**NOT STARTED as a dedicated module.**

Foundation:
- `frontend/src/pages/Sessions.jsx` exists — shows session list, but focused on operational upload/manage flow
- `GET /api/sessions` returns session list with status, health score, defect counts
- Historical data is in PostgreSQL

Missing:
- Dedicated historical view with date/train/rake filtering
- "Previous Runs" comparison view (same train number across multiple inspections)
- No dedicated route separate from Sessions operational view

## 3. Required Role
- Full Stack Developer
- Frontend Developer
- Backend Developer

## 4. Role-Based Working Prompt
"You are a full stack developer. Build the Train Passage History module. Create a new page that shows all completed inspection sessions in a historical context. Implement filtering by date range, train number, and rake/session ID. Show a trend view for trains that were inspected multiple times (health score over time). Add a comparison mode: select two sessions of the same train number and see a side-by-side defect diff."

## 5. Implementation Plan
1. Backend: `GET /api/history/passages?train_number=&date_from=&date_to=&rake_id=` — filtered sessions query
2. Backend: `GET /api/history/train/:trainNumber/trend` — health score over time for a specific train
3. Frontend: new `frontend/src/pages/TrainPassageHistory.jsx`
4. Filter bar: date range picker, train number input, status filter
5. Results table: session date, train number, health score, defect count, critical count, report link
6. Trend chart (Recharts line): health score over time for selected train number
7. "Compare" button: select 2 sessions, show side-by-side defect diff
8. Register route `/history` in Shell.jsx

## 6. Files Likely to be Modified
- `backend/src/routes/sessions.js` — extend or add history-specific endpoint
- `frontend/src/pages/TrainPassageHistory.jsx` — new file
- `frontend/src/pages/Shell.jsx` — add nav entry

## 7. Dependencies
- PostgreSQL sessions table (done), coaches/defects tables (done)
- Recharts (done)

## 8. Testing Plan
- API tests: Filter by train number returns only matching sessions; date filter works
- UI tests: Filter interactions, table rendering, trend chart
- Integration tests: Insert test sessions for same train number; verify trend shows correct data

## 9. Acceptance Criteria
- All completed sessions visible with correct metadata
- Filters reduce results correctly
- Trend line shows health score progression for a specific train
- Report link opens correct PDF
- Comparison mode shows defect diff between two sessions

## 10. Risk Areas
- Date range filter may return thousands of sessions — add pagination
- "Same train number" trend requires matching by OCR-detected train_number — OCR errors may create gaps

## 11. Rollback Plan
- New standalone page; no modification to existing Sessions.jsx operational view

## 12. Completion Checklist
- [ ] Code reviewed
- [ ] Feature implemented
- [ ] Tests passed
- [ ] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
