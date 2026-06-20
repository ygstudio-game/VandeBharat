# AI Inference Management

## 1. Task Overview
Management panel for deployed AI models. Shows the active YOLO and OCR model versions, monitors real-time inference metrics (FPS, latency, GPU utilization), supports model version switching, and displays accuracy benchmarking history.

## 2. Current Codebase Status
**NOT STARTED.**

Partial foundation exists:
- `backend/src/routes/modelVersions.js` — basic model version CRUD (check actual implementation)
- `backend/src/routes/trainingExport.js` — export logic for training data
- YOLO service at port 5002 reports `best.pt` + `train_num_detector.pt` loaded at startup

No frontend page exists. No GPU utilization monitoring endpoint. No model switching endpoint.

## 3. Required Role
- AI/ML Engineer
- Backend Developer
- Frontend Developer
- DevOps Engineer

## 4. Role-Based Working Prompt
"You are a senior AI/ML engineer and backend developer. Your task is to build the AI Inference Management panel. Create a backend API that: (1) returns all registered model versions with their status (active/archived), (2) returns live inference metrics from the YOLO and OCR services (avg latency, FPS, GPU memory usage), (3) supports switching the active model. Build a React frontend page that displays this data with Recharts for latency trends. The YOLO service is at port 5002 and OCR at port 5000 — query their health endpoints for live metrics."

## 5. Implementation Plan
1. Add `/health` + `/metrics` endpoints to GPU YOLO service (`GPU/yolo/server.py`) — return avg_latency_ms, fps, gpu_memory_mb, model_loaded
2. Add `/health` + `/metrics` to OCR service (`GPU/ocr/server.py`) — return similar fields
3. Backend: `GET /api/ai/models` — list all model versions from `ModelVersion` table
4. Backend: `GET /api/ai/metrics` — aggregate metrics from YOLO (5002) + OCR (5000) health endpoints
5. Backend: `POST /api/ai/models/:id/activate` — switch active model (update `ModelVersion.is_active`)
6. Frontend: new `frontend/src/pages/AiInferenceManagement.jsx` page
7. Frontend: model cards (name, version, loaded, accuracy), metrics gauges (FPS, latency, GPU%), accuracy chart
8. Register route `/ai-inference` in Shell.jsx

## 6. Files Likely to be Modified
- `GPU/yolo/server.py` — add `/metrics` endpoint
- `GPU/ocr/server.py` — add `/metrics` endpoint
- `backend/src/routes/modelVersions.js` — extend with metrics aggregation
- `frontend/src/pages/AiInferenceManagement.jsx` — new file
- `frontend/src/pages/Shell.jsx` — add nav entry

## 7. Dependencies
- GPU/yolo and GPU/ocr services running (done)
- `ModelVersion` Prisma model (verify in schema)
- Recharts (already installed)

## 8. Testing Plan
- Unit tests: Metrics aggregation logic
- API tests: `GET /api/ai/metrics` returns valid fields; YOLO `/metrics` returns latency
- Integration tests: Activate a model version; verify YOLO service loads new model
- UI tests: Metrics gauges update on page refresh; model switch button works

## 9. Acceptance Criteria
- All registered model versions visible with status
- Live metrics (FPS, latency, GPU%) displayed from running services
- Model activation updates DB and triggers service reload
- Accuracy benchmarking history shown (precision/recall from past runs)

## 10. Risk Areas
- GPU services may not have metrics endpoints yet — requires Python code addition
- Model hot-swap may require YOLO service restart — plan graceful reload
- GPU memory usage requires `nvidia-smi` or `torch.cuda.memory_allocated()` — may not work without GPU

## 11. Rollback Plan
- Frontend page is a new file — safe to revert
- Metrics endpoints on Python services are additive — no breaking changes

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented
  - GPU/yolo/server.py: request timing + `GET /metrics` (latency, FPS, GPU mem, model loaded flags)
  - GPU/ocr/server.py: request timing + `GET /metrics` (latency, valid_pct, requests)
  - backend/routes/modelVersions.js: `GET /api/models/metrics` aggregates from both services; removed duplicate authenticate hook
  - frontend/src/pages/AiInferenceManagement.jsx: gauges, latency trend chart, model version cards with activate button
  - frontend/src/lib/api.js: getModelVersions, getModelMetrics, activateModelVersion
  - frontend/src/App.jsx: /ai-inference route added
  - frontend/src/components/layout/Shell.jsx: AI Inference nav entry added
- [x] ESLint: 0 errors
- [x] No breaking changes — additive only
- [ ] Browser test — verify at localhost:5173/ai-inference
- [x] Excel status updated
