# Defect Verification Console

## 1. Task Overview
Human-in-the-loop verification interface where operators review AI-detected defects and approve (Confirmed) or reject (False Positive) each one. Stores operator corrections and builds labeled datasets for AI model retraining.

## 2. Current Codebase Status
**NOT STARTED.**

Foundation exists:
- `DefectReviewLog` Prisma model (created in Phase 5 for FP/FN capture)
- `POST /api/sessions/:id/review-log` and `GET /api/review-log` exist
- `Defect.review_status` field exists (synced by reviewLog endpoint)

No standalone Verification Console page exists. No retraining dataset export.

## 3. Required Role
- Full Stack Developer
- AI/ML Engineer (dataset builder)
- Frontend Developer
- QA Engineer

## 4. Role-Based Working Prompt
"You are a full stack developer and AI/ML engineer. Build the Defect Verification Console. The page shows a queue of unreviewed AI-detected defects with their annotated frame images. Operators click Confirm (true positive) or Reject (false positive). Confirmed defects update the Defect.review_status to 'confirmed'; rejected ones to 'false_positive'. Provide a dataset export button that generates a labeled YOLO-format dataset from all confirmed defects for retraining."

## 5. Implementation Plan
1. Backend: `GET /api/defects/pending-review` — return defects where `review_status = 'unreviewed'`, include frame image URL + bbox
2. Backend: `PATCH /api/defects/:id/review` — accept `{ status: 'confirmed' | 'false_positive', operator_notes }`, update DB
3. Backend: `GET /api/defects/export-training-dataset` — generate YOLO-format labels from confirmed defects (bbox + class)
4. Frontend: new `frontend/src/pages/DefectVerificationConsole.jsx`
5. Frontend: defect card with frame image + bbox overlay, Confirm/Reject buttons, notes input
6. Frontend: batch review mode (keyboard shortcuts: C=confirm, R=reject, N=next)
7. Frontend: dataset export button (downloads ZIP of images + YOLO label files)
8. Register route `/defect-verification` in Shell.jsx

## 6. Files Likely to be Modified
- `backend/src/routes/intelligence.js` — add pending-review and review-patch endpoints
- `backend/src/routes/trainingExport.js` — extend for YOLO dataset export
- `frontend/src/pages/DefectVerificationConsole.jsx` — new file
- `frontend/src/pages/Shell.jsx` — add nav entry

## 7. Dependencies
- `Defect` model with bbox + frame URL (done)
- `DefectReviewLog` model (done)
- Cloudinary frame URLs (done)

## 8. Testing Plan
- API tests: Pending-review returns only unreviewed defects; PATCH updates status correctly
- Integration tests: Mark defects as FP; verify they disappear from pending queue
- UI tests: Confirm/Reject buttons work; notes field saves; bbox renders on frame
- AI/ML tests: Export generates valid YOLO-format labels (verify bbox normalization)

## 9. Acceptance Criteria
- All unreviewed defects appear in the queue with frame image and bbox
- Confirm/Reject updates DB immediately
- Reviewed defects removed from pending queue
- Dataset export generates valid YOLO-format (normalized bbox txt files + images)
- Keyboard shortcuts (C/R/N) work for fast batch review

## 10. Risk Areas
- Bbox coordinates in DB may be in pixel units; YOLO requires normalized (0–1) coordinates — implement transform
- Large frame images may slow the review interface — use lazy loading + thumbnail first
- Dataset export ZIP may be large (GB scale) — implement chunked download or cloud upload

## 11. Rollback Plan
- New standalone page; no changes to existing defect data structure
- `review_status` field is already in schema — additive change

## 12. Completion Checklist
- [ ] Code reviewed
- [ ] Feature implemented
- [ ] Tests passed
- [ ] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
