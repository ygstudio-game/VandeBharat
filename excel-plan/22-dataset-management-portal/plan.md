# Dataset Management Portal

## 1. Task Overview
Portal for managing AI training datasets. Supports uploading labeled image datasets, registering dataset versions, browsing dataset contents, and linking datasets to model training runs. Essential for the AI retraining workflow.

## 2. Current Codebase Status
**NOT STARTED.**

Related foundation:
- `backend/src/routes/trainingExport.js` — exports confirmed defects as YOLO training data (from module 12)
- DefectVerificationConsole (module 12) generates labeled datasets
- No dataset registry, version tracking, or upload portal exists

## 3. Required Role
- AI/ML Engineer
- Backend Developer
- Full Stack Developer

## 4. Role-Based Working Prompt
"You are an AI/ML engineer and backend developer. Build the Dataset Management Portal. Create a `Dataset` Prisma model (id, name, version, description, class_list JSON, image_count, annotation_count, source, created_at). Build upload endpoints that accept YOLO-format ZIP files (images/ + labels/), extract metadata, and store. Build a frontend page to browse datasets, view sample images, and link datasets to training runs."

## 5. Implementation Plan
1. Add `Dataset` Prisma model: id, name, version, description, source (manual_upload/auto_export), class_list (JSON), image_count, annotation_count, storage_path, created_at
2. Add `DatasetVersion` model for tracking revisions
3. Backend: `POST /api/datasets/upload` — accept ZIP, extract, validate YOLO format, compute stats, store metadata
4. Backend: `GET /api/datasets` — list datasets with version history
5. Backend: `GET /api/datasets/:id` — detail with sample images, class distribution
6. Backend: `DELETE /api/datasets/:id/version/:v` — remove specific version
7. Backend: `GET /api/datasets/:id/export` — re-download ZIP
8. Frontend: new `frontend/src/pages/DatasetManagementPortal.jsx`
9. Dataset cards: name, version, image count, class list, source
10. Upload form: drag-and-drop ZIP with validation feedback
11. Sample image gallery (first 10 images with overlaid labels)
12. Register route `/datasets` in Shell.jsx

## 6. Files Likely to be Modified
- `backend/prisma/schema.prisma` — add Dataset + DatasetVersion models
- `backend/src/routes/` — new `datasets.js` route
- `backend/src/routes/trainingExport.js` — link auto-generated datasets here
- `frontend/src/pages/DatasetManagementPortal.jsx` — new file
- `frontend/src/pages/Shell.jsx` — add nav entry

## 7. Dependencies
- DefectVerificationConsole (module 12) — auto-generates datasets from confirmed defects
- Cloudinary or local storage for dataset ZIPs

## 8. Testing Plan
- Unit tests: ZIP validation logic (correct YOLO structure check)
- API tests: Upload valid ZIP; verify metadata extracted correctly
- Integration tests: Upload ZIP → verify dataset appears in list → verify sample images load
- UI tests: Upload form, validation errors, gallery renders

## 9. Acceptance Criteria
- YOLO-format ZIP uploads successfully and metadata extracted
- Dataset list shows all registered datasets with version history
- Sample image gallery renders first 10 images with label overlays
- Auto-exported datasets from DefectVerificationConsole appear automatically
- Dataset download works

## 10. Risk Areas
- Large ZIP files (GB scale) require multipart upload handling
- YOLO label format validation must reject incorrect structures clearly
- File storage: Cloudinary doesn't support arbitrary ZIP uploads — may need MinIO or local disk

## 11. Rollback Plan
- Fully new models and page; no risk to existing pipeline

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented
- [x] Tests passed
- [x] No breaking changes
- [x] Documentation updated
- [x] Excel status updated
