# Historical Reports

## 1. Task Overview
Automated periodic report generation (shift/day/week) with FP/FN defect review log. Reports include session counts, uptime proxy, defect counts, and false positive/negative capture. Separate from per-session PDF reports.

## 2. Current Codebase Status
**DONE.** Implemented in Dashboard modules Phase 5.

Completed:
- Prisma models: `DefectReviewLog`, `PeriodicReport`
- Backend: `GET/POST /api/sessions/:id/review-log`, `GET /api/review-log` (global)
- Backend: `GET /api/periodic-reports`, `POST /api/periodic-reports/generate`
- Scheduler: `backend/src/services/periodicReportScheduler.js` — auto-generates at shift/day/week boundaries
- Frontend: `frontend/src/components/reports/PeriodicReportsPanel.jsx` embedded in `Reports.jsx`
- Shift/day/week aggregate cards, Defect Review Log table, manual log-entry form

Note: Reports are JSON aggregates — PDF rendering for this aggregate type is deferred.

## 3. Required Role
- Backend Developer (PDF rendering, future)
- QA Engineer

## 4. Role-Based Working Prompt
"You are a QA engineer and backend developer. Your tasks: (1) Validate the periodic report scheduler triggers correctly at shift/day/week boundaries. (2) Verify manual 'Generate Now' button works for each period type. (3) Test the FP/FN review log submission and retrieval. (4) As a future enhancement, plan PDF rendering for the periodic reports (defer to AI team if fpdf2 integration needed)."

## 5. Implementation Plan
1. Verify scheduler auto-generates shift report after 8h boundary
2. Test manual trigger for all 3 period types (shift, day, week)
3. Submit FP/FN review log entries and verify they appear in the list
4. Verify aggregate metrics (session counts, defect counts, FP/FN) are accurate
5. Plan PDF extension in `services/report_generator` (future)

## 6. Files Likely to be Modified
- `backend/src/services/periodicReportScheduler.js` (bug fixes)
- `backend/src/routes/periodicReports.js` (bug fixes)
- `frontend/src/components/reports/PeriodicReportsPanel.jsx` (bug fixes)

## 7. Dependencies
- PostgreSQL `DefectReviewLog` and `PeriodicReport` models (done)
- `services/report_generator` (done for per-session PDFs)

## 8. Testing Plan
- API tests: Manual trigger endpoint returns 200; list endpoint returns reports
- Unit tests: Aggregate calculation logic (session counts, FP/FN counts)
- Integration tests: Submit review log entries, generate report, verify counts match
- UI tests: Cards render correctly, "Generate Now" button fires

## 9. Acceptance Criteria
- Scheduler generates reports automatically at period boundaries
- Manual trigger works for shift, day, week
- FP/FN log entries persist and appear in the UI
- Aggregate metrics match actual DB data

## 10. Risk Areas
- Scheduler runs on server startup — missing periods if server was down during boundary
- `system_uptime_pct` is a proxy metric, not real uptime — document clearly

## 11. Rollback Plan
- Revert scheduler service; PeriodicReport model is additive (no migration conflicts)

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented
- [ ] Tests passed
- [x] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
