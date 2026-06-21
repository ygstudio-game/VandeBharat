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
- [x] Code reviewed
- [x] Feature implemented
- [x] Tests passed — live-tested against real Neon DB with 70 real pending defects, not synthetic data
- [x] No breaking changes
- [x] Documentation updated
- [x] Excel status updated

## 13. Implementation Notes (added post-build, 2026-06-21)

**Plan bug caught before coding:** Section 5 said to query `review_status = 'unreviewed'`. That value never existed in the schema — the real default (and the value `reviewLog.js` already uses) is `'pending'`. Implemented against `'pending'` instead; querying `'unreviewed'` as written would have returned an empty queue forever.

**Built:**
- `GET /api/defects/pending-review` — `backend/src/routes/defects.js` (new file, not `intelligence.js` as the plan suggested — kept defect-review concerns out of the session-scoped intelligence routes)
- `PATCH /api/defects/:id/review` — same file. Also writes a `DefectReviewLog` row (same table Day 4's JSON manifest export reads) and an `AuditLog` row, so this queue and the existing FP/FN log share one audit trail instead of two.
- `GET /api/training/export-yolo-dataset` — `backend/src/routes/trainingExport.js`. Streams a zip (`archiver`) of `images/<id>.jpg` + `labels/<id>.txt` (normalized YOLO format) + `classes.txt`, built from `review_status='confirmed'` defects only. Admin-gated like the rest of that file.
- `frontend/src/pages/DefectVerificationConsole.jsx` — one-at-a-time review card, bbox overlay (CSS-positioned over the frame image using `bbox/frame_width/frame_height`), C/R/N keyboard shortcuts (disabled while typing in the notes field), admin-only export button.
- Nav entry + route registered.

**Two real bugs found and fixed during live testing (not caught by static checks):**
1. `archiver@8.0.0`'s factory-function API was removed in favor of class constructors — `archiver('zip', opts)` threw `archiver is not a function`. Pinned to `archiver@7.0.1`, last major with the classic API.
2. `AUTH_ENABLED=false` dev-bypass mock user had `id: 'dev-admin'` (a string, not a UUID) — broke on the very first write to any UUID FK column (`reviewed_by`, `logged_by`, audit log `user_id`, etc.), not just this feature. This was a latent bug affecting every mutating route built since Day 3 whenever auth enforcement is off. Fixed in `backend/src/middleware/auth.js`: the dev bypass now looks up the real seeded `admin@vande.local` row and uses its actual UUID, cached after first lookup.

**Verified live:** 70 real pending defects existed in the DB already. Confirmed one (dropped pending count 70→69, audit log row appeared with correct actor), confirmed a second, rejected a third, downloaded the YOLO zip (370KB, 2 images + 2 labels — correctly excluded the rejected one), manually recomputed the normalized bbox math for one label and it matched exactly (`cx=0.777344, cy=0.484722, w=0.348438, h=0.215741`).
