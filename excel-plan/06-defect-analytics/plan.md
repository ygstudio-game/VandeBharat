# Defect Analytics

## 1. Task Overview
Analytics dashboard with 4 Recharts visualizations: defect trend over time, defects by type (bar), defects by coach class (bar), and inference latency. Supports 24h/7d/30d time-range toggle and CSV/JSON/Excel export.

## 2. Current Codebase Status
**DONE.** Implemented in Dashboard modules Phase 2.

Completed:
- `frontend/src/pages/Analytics.jsx` — 4 live charts via Recharts, wired to real API
- Time-range toggle drives all chart queries
- Export buttons wired to Phase 0 `lib/export.js`
- Backend routes in `backend/src/routes/analytics.js`:
  - `GET /api/analytics/defects-over-time?range=`
  - `GET /api/analytics/defects-by-type?range=`
  - `GET /api/analytics/defects-by-coach-class?range=`
  - `GET /api/analytics/inference-latency?range=`

Note: `defects-by-coach-class` mostly shows "Unclassified" as `coach_type` is not yet populated by pipeline.

## 3. Required Role
- QA Engineer
- Backend Developer (coach_type population fix)

## 4. Role-Based Working Prompt
"You are a backend developer and QA engineer. Your tasks: (1) Verify all 4 analytics charts render correctly with real DB data. (2) Fix the `coach_type` population gap — the correlation engine should write a coach class based on the coach number pattern detected by OCR. (3) Verify export produces correct data."

## 5. Implementation Plan
1. Verify all 4 charts load with real data for each time range
2. Identify where `coach_type` should be set in the pipeline (sync_engine or correlation)
3. Add coach type inference logic (e.g., from train number prefix or coach number pattern)
4. Test export for all 3 formats (CSV, JSON, Excel)
5. Verify time-range toggle correctly refetches all charts

## 6. Files Likely to be Modified
- `frontend/src/pages/Analytics.jsx` (bug fixes)
- `backend/src/routes/analytics.js` (bug fixes)
- `services/correlation/engine.py` (coach_type population)

## 7. Dependencies
- PostgreSQL defects table (done), coaches table (done)

## 8. Testing Plan
- API tests: Each analytics endpoint with 24h/7d/30d range
- Integration tests: After running sessions, verify chart data reflects real counts
- UI tests: Time-range toggle, chart rendering, export

## 9. Acceptance Criteria
- All 4 charts render without errors
- Time-range toggle works for all charts
- Export produces correct data
- `defects-by-coach-class` shows real coach classes (not all "Unclassified")

## 10. Risk Areas
- Empty DB state (no sessions yet) may cause chart rendering errors — handle gracefully
- Coach type classification may not be deterministic from OCR number alone

## 11. Rollback Plan
- Revert `Analytics.jsx` and `analytics.js`; coach_type is additive (no breaking change to schema)

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented
- [ ] Tests passed
- [x] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
