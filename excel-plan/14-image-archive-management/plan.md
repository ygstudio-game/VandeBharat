# Image Archive Management

## 1. Task Overview
Long-term image archive system for storing, retrieving, and managing captured inspection frames beyond the active session lifecycle. Defines retention policies, supports fast lookup by session/coach/date, and monitors storage usage.

## 2. Current Codebase Status
**NOT STARTED.**

Current state:
- Frames are uploaded to Cloudinary during frame extraction (short-term)
- No retention policy exists
- No archive-specific storage tier
- No storage monitoring dashboard
- PostgreSQL `frames` table stores Cloudinary URLs but no archive metadata

## 3. Required Role
- Backend Developer
- DevOps Engineer
- Full Stack Developer

## 4. Role-Based Working Prompt
"You are a backend developer and DevOps engineer. Design and implement the Image Archive Management system. Define a retention policy: active frames stay on Cloudinary for 30 days, then are moved to a cold storage tier (MinIO or Cloudinary long-term). Build an archive service that runs on a schedule to migrate old frames. Create a backend API for querying archived images by session/coach/date. Build a simple frontend page showing archive statistics (total images, storage used, retention breakdown)."

## 5. Implementation Plan
1. Define retention policy configuration (default: 30 days active, 90 days cold, delete after)
2. Add `archived_at`, `storage_tier` fields to `frames` Prisma model via migration
3. Backend: `backend/src/services/archiveService.js` — scheduled job to move frames beyond retention window
4. Backend: `GET /api/archive/stats` — total frames, storage used, frames by tier
5. Backend: `GET /api/archive/frames?session_id=&coach_id=&date=` — query archived frames
6. Backend: `POST /api/archive/restore/:frameId` — restore archived frame to active tier
7. Frontend: new `frontend/src/pages/ImageArchiveManagement.jsx` — stats dashboard + search
8. Register route `/image-archive` in Shell.jsx
9. Configure MinIO as cold storage (or use Cloudinary archive tier)

## 6. Files Likely to be Modified
- `backend/prisma/schema.prisma` — add archive fields to Frame model
- `backend/src/services/archiveService.js` — new file
- `backend/src/routes/` — new archiveRoutes.js
- `frontend/src/pages/ImageArchiveManagement.jsx` — new file
- `frontend/src/pages/Shell.jsx` — add nav entry

## 7. Dependencies
- Cloudinary integration (done)
- PostgreSQL frames table (done)
- MinIO (optional cold storage, not currently deployed)

## 8. Testing Plan
- Unit tests: Retention policy calculation (is frame older than threshold?)
- API tests: Archive stats endpoint returns valid numbers
- Integration tests: Run archive service on frames older than threshold; verify `storage_tier` updated
- UI tests: Stats page renders; search by date returns correct frames

## 9. Acceptance Criteria
- Retention policy configurable via env variables
- Archive service correctly identifies and migrates old frames
- Archive stats page shows total images, storage used, breakdown by tier
- Search returns correct archived frames within 1 second

## 10. Risk Areas
- Cloudinary does not natively support cold storage tiers — may need MinIO for true archiving
- Migrating frames in bulk may cause Cloudinary API rate limits
- Restoring frames from cold storage may have latency (minutes, not seconds)

## 11. Rollback Plan
- `archived_at` and `storage_tier` fields are additive — no breaking change
- Archive service can be disabled via env flag without affecting active pipeline

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented
- [x] Tests passed
- [x] No breaking changes
- [x] Documentation updated
- [x] Excel status updated
