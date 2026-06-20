# System Health Dashboard

## 1. Task Overview
Infrastructure health dashboard showing CPU, GPU, RAM, SSD, and UPS telemetry. Currently returns simulated data (no physical Jetson/GPU hardware available). Includes model inference latency table (reuses analytics endpoint). Displays `SIMULATED` disclosure banner.

## 2. Current Codebase Status
**DONE (with simulated data).** Implemented in Dashboard modules Phase 3B.

Completed:
- `frontend/src/pages/Infrastructure.jsx` — GPU/Node Telemetry tab with MetricBar components
- Backend: `GET /api/health/system` in `backend/src/routes/health.js` — simulated metrics, `simulated: true` flag
- SSD health % + storage used/total
- UPS battery % + mains/battery source
- Model inference latency reuses `GET /api/analytics/inference-latency`
- "Camera Feeds & Triggers" tab removed (moved to CameraHealthMonitor)
- `SIMULATED` disclosure banner shown

Pending (deferred to when hardware is available):
- Replace simulated metrics with real `nvidia-smi` / Jetson sensor reads

## 3. Required Role
- DevOps Engineer (future hardware integration)
- Frontend Developer (maintenance)
- QA Engineer

## 4. Role-Based Working Prompt
"You are a DevOps engineer. Your task is to prepare the system health endpoint to support both simulated and real hardware data. Add a configuration flag in `config.js` that switches between simulated and real reads. When real hardware is available, implement `nvidia-smi` integration for GPU metrics and system sensor reads for CPU/RAM/SSD/UPS. For now, validate the simulated path works correctly and the disclosure banner is visible."

## 5. Implementation Plan
1. Verify simulated endpoint returns plausible values
2. Add `USE_REAL_HARDWARE=false` env flag to `backend/src/config.js`
3. Create `backend/src/services/hardwareMetrics.js` with real vs simulated switch
4. Document the `nvidia-smi` command needed for GPU metrics
5. Verify `SIMULATED` banner is visible in UI
6. Plan the swap: when real hardware arrives, flip env flag and implement real reads

## 6. Files Likely to be Modified
- `backend/src/routes/health.js`
- `backend/src/services/hardwareMetrics.js` (new file)
- `backend/src/config.js`
- `frontend/src/pages/Infrastructure.jsx` (bug fixes)

## 7. Dependencies
- `GET /api/analytics/inference-latency` (done), system hardware (future)

## 8. Testing Plan
- API tests: `GET /api/health/system` returns valid JSON with all fields
- Unit tests: Simulated metric generators return values in expected ranges
- UI tests: MetricBar components render, SIMULATED banner visible

## 9. Acceptance Criteria
- API returns CPU, GPU, RAM, SSD, UPS metrics
- `simulated: true` flag present in response
- UI shows SIMULATED banner when simulated data is active
- Model inference table populated from analytics endpoint

## 10. Risk Areas
- Real hardware integration (nvidia-smi) will require root access on Jetson
- SSD SMART data requires `smartctl` tool on the host

## 11. Rollback Plan
- Revert `health.js` and `Infrastructure.jsx`; simulated path is always safe fallback

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented
- [ ] Tests passed
- [x] No breaking changes
- [ ] Documentation updated
- [ ] Excel status updated
