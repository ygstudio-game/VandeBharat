# AI Performance Analytics

## 1. Task Overview
Dedicated analytics dashboard for AI model performance metrics: Precision, Recall, F1-Score, mAP (Mean Average Precision), and False Positive Rate. Tracks these metrics per model version over time. Separate from general Defect Analytics (module 6) which focuses on defect counts.

## 2. Current Codebase Status
**NOT STARTED.**

Partial foundation:
- `backend/src/routes/modelVersions.js` — basic model version tracking
- `backend/src/routes/analytics.js` — inference latency (reusable)
- Defect `review_status` field captures TP/FP/FN labels (via DefectVerificationConsole)
- No Precision/Recall calculation logic exists

## 3. Required Role
- AI/ML Engineer
- Backend Developer
- Frontend Developer

## 4. Role-Based Working Prompt
"You are an AI/ML engineer and backend developer. Build the AI Performance Analytics dashboard. Calculate Precision = TP/(TP+FP), Recall = TP/(TP+FN), F1 = 2×(P×R)/(P+R) from the DefectReviewLog data (review_status: confirmed=TP, false_positive=FP). Track these per model version using the ModelVersion table. Build a frontend dashboard with Recharts showing these metrics over time and a model comparison table."

## 5. Implementation Plan
1. Define TP = `review_status = 'confirmed'`, FP = `review_status = 'false_positive'`, FN = undetected real defects (estimated from missing_components)
2. Backend: `GET /api/ai/performance` — calculate P/R/F1 per model version using Prisma aggregations
3. Backend: `GET /api/ai/performance/history?range=` — P/R/F1 trend over time
4. Backend: `GET /api/ai/performance/model-comparison` — P/R/F1 per model version side by side
5. Frontend: new `frontend/src/pages/AiPerformanceAnalytics.jsx`
6. Summary KPI cards: Precision, Recall, F1, mAP
7. Recharts line chart: P/R/F1 trend over sessions
8. Model comparison table: versions vs metrics
9. Register route `/ai-performance` in Shell.jsx

## 6. Files Likely to be Modified
- `backend/src/routes/analytics.js` — add AI performance endpoints or new `aiPerformance.js` route
- `frontend/src/pages/AiPerformanceAnalytics.jsx` — new file
- `frontend/src/pages/Shell.jsx` — add nav entry

## 7. Dependencies
- `DefectVerificationConsole` (module 12) — needs review_status data populated
- `ModelVersion` Prisma model (verify exists)
- Recharts (done)

## 8. Testing Plan
- Unit tests: Precision/Recall/F1 calculation logic with known TP/FP/FN values
- API tests: Performance endpoint returns correct metrics for known dataset
- Integration tests: Run sessions, mark defects, verify metrics update
- UI tests: Charts render, model comparison table is correct

## 9. Acceptance Criteria
- Precision, Recall, F1 calculated correctly from review data
- Metrics tracked per model version
- Trend chart shows progression over time
- Model comparison table allows identifying best-performing version
- Page loads within 3 seconds

## 10. Risk Areas
- If DefectVerificationConsole (module 12) is not done, no reviewed data exists — metrics will be 0 or undefined
- FN (false negatives) are inherently hard to measure — document the approximation used
- Small dataset (few sessions) makes metrics statistically unreliable — add confidence interval note

## 11. Rollback Plan
- New standalone page; analytics calculations are read-only from existing data

## 12. Completion Checklist
- [ ] Code reviewed
- [ ] Feature implemented
- [ ] Tests passed
- [ ] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
