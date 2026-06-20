# AI Model Training Workbench

## 1. Task Overview
End-to-end AI model training management interface. Covers dataset selection, hyperparameter configuration, GPU resource allocation, training job launch, experiment tracking (loss/mAP curves), model evaluation, comparison across runs, and model registry integration with automated deployment pipeline.

## 2. Current Codebase Status
**NOT STARTED.**

Related foundation:
- `GPU/yolo/server.py` — YOLOv8 inference service (not training)
- `backend/src/routes/modelVersions.js` — model version registry (partial)
- `backend/src/routes/trainingExport.js` — labeled dataset export
- Dataset Management Portal (module 22) — dataset source

No training pipeline, job management, experiment tracking, or training UI exists.

## 3. Required Role
- AI/ML Engineer
- Backend Developer
- Frontend Developer
- DevOps Engineer

## 4. Role-Based Working Prompt
"You are a senior AI/ML engineer. Build the AI Model Training Workbench. Create a Python FastAPI training service that: (1) accepts a training configuration (dataset_id, model_base, epochs, batch_size, learning_rate, image_size), (2) launches a YOLOv8 training run via Ultralytics Python API, (3) streams training progress (loss, mAP per epoch) to the backend via WebSocket or polling, (4) saves the trained model to the model registry. Build a React frontend with a training config form, live training progress chart, and experiment history table."

## 5. Implementation Plan
1. Create new Python service `GPU/training/server.py` — FastAPI training orchestrator
2. Implement `POST /train` — launches `yolo train model=yolov8n.pt data=dataset.yaml epochs=100` via Python subprocess
3. Implement `GET /train/:job_id/status` — returns current epoch, loss, mAP, ETA
4. Stream training logs via SSE or WebSocket
5. On completion: save model to `GPU/yolo/models/`, register in `ModelVersion` table
6. Backend (Node.js): `POST /api/training/jobs` — create training job, dispatch to GPU training service
7. Backend: `GET /api/training/jobs` — list all training runs
8. Backend: `GET /api/training/jobs/:id` — detail with metrics per epoch
9. Frontend: new `frontend/src/pages/AiTrainingWorkbench.jsx`
10. Training config form: dataset selector, base model, hyperparameters
11. Live training progress: loss/mAP chart updating per epoch (Recharts LineChart)
12. Experiment table: all runs, sortable by mAP
13. Model comparison: select 2+ runs, side-by-side P/R/F1/mAP
14. "Deploy" button: mark a trained model as active in production
15. Register route `/training` in Shell.jsx

## 6. Files Likely to be Modified
- `GPU/training/server.py` — new training service
- `GPU/training/requirements.txt` — ultralytics, fastapi, uvicorn
- `backend/src/routes/` — new `trainingJobs.js` route
- `backend/prisma/schema.prisma` — add TrainingJob model with hyperparams + metrics JSON
- `frontend/src/pages/AiTrainingWorkbench.jsx` — new file
- `frontend/src/pages/Shell.jsx` — add nav entry

## 7. Dependencies
- Dataset Management Portal (module 22) — dataset source
- Model Registry / `modelVersions.js` (partial, extend)
- GPU hardware with CUDA + Ultralytics installed
- AI Performance Analytics (module 16) — post-training evaluation

## 8. Testing Plan
- Unit tests: Config validation (valid hyperparameter ranges)
- Integration tests: Launch a training job with a small dataset (10 images, 2 epochs); verify completion and model saved
- API tests: `GET /training/jobs/:id` returns correct epoch metrics
- UI tests: Config form validation, live chart updates, deploy button activates model

## 9. Acceptance Criteria
- Training job launches with configured hyperparameters
- Live progress chart updates per epoch (loss, mAP)
- Training completion saves model to registry
- Experiment history shows all past runs
- "Deploy" button sets trained model as active in YOLO service
- Keyboard shortcut to cancel running training job

## 10. Risk Areas
- GPU training requires significant compute — add job queue to prevent concurrent training conflicts
- Training a large dataset takes hours — UI must handle long-running jobs gracefully (do not timeout)
- YOLOv8 training subprocess may crash — add proper error capture and surfacing
- Model file sizes are large (50–200MB) — storage management needed

## 11. Rollback Plan
- Training service is a new isolated GPU service — no risk to inference pipeline
- Model deployment is explicit (user presses Deploy) — never automatic

## 12. Completion Checklist
- [ ] Code reviewed
- [ ] Feature implemented
- [ ] Tests passed
- [ ] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
