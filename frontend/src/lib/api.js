const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';
const TOKEN_KEY = 'vi_auth_token';

function authHeader() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function _fetch(path, opts = {}) {
  const headers = { ...authHeader(), ...(opts.headers || {}) };
  const resp = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`API ${resp.status} ${path}: ${text}`);
  }
  return resp.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export const getMe = () => _fetch('/api/auth/me');

// ── AI / Model Versions ───────────────────────────────────────────────────────
export const getModelVersions    = (model_name) => _fetch(`/api/models${model_name ? `?model_name=${model_name}` : ''}`);
export const getModelMetrics     = () => _fetch('/api/models/metrics');
export const activateModelVersion = (id) => _fetch(`/api/models/${id}/activate`, { method: 'PATCH' });

// ── Users (admin only) ────────────────────────────────────────────────────────
export const getUsers = () => _fetch('/api/users');
export const createUser = (payload) => _fetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
export const patchUserRole = (id, role) => _fetch(`/api/users/${id}/role`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ role }),
});
export const patchUserActive = (id, is_active) => _fetch(`/api/users/${id}/active`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ is_active }),
});

// ── 2FA ───────────────────────────────────────────────────────────────────────
export const setup2fa   = () => _fetch('/api/auth/2fa/setup', { method: 'POST' });
export const verify2fa  = (code) => _fetch('/api/auth/2fa/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code }),
});
export const disable2fa = () => _fetch('/api/auth/2fa/disable', { method: 'POST' });

// ── Audit Log ─────────────────────────────────────────────────────────────────
export const getAuditLog = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return _fetch(`/api/audit-log${qs ? `?${qs}` : ''}`);
};
export const getAuditLogActions = () => _fetch('/api/audit-log/actions');
export const exportAuditLog = async (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  const resp = await fetch(`${BASE}/api/audit-log/export${qs ? `?${qs}` : ''}`, { headers: authHeader() });
  if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit_log_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// ── Sessions ────────────────────────────────────────────────────────────────
export const getSessions    = ()        => _fetch('/api/sessions');
export const getSession     = (id)      => _fetch(`/api/sessions/${id}`);
export const uploadSession  = (fd)      => _fetch('/api/sessions/upload',   { method: 'POST', body: fd });
export const processSession = (id)      => _fetch(`/api/sessions/${id}/process`, { method: 'POST' });
export const getHierarchy   = (id)      => _fetch(`/api/sessions/${id}/hierarchy`);
export const getIntelligence= (id, cid) => _fetch(`/api/sessions/${id}/coaches/${cid}/intelligence`);
export const getTimeline    = (id)      => _fetch(`/api/sessions/${id}/timeline-events`);
export const generateReport = (id)      => _fetch(`/api/sessions/${id}/report`, { method: 'POST' });
export const getReport      = (id)      => _fetch(`/api/sessions/${id}/report`);
export const deleteSession  = (id)      => _fetch(`/api/sessions/${id}`, { method: 'DELETE' });
export const signReport     = (id, notes) => _fetch(`/api/sessions/${id}/report/sign`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) });
export const exportEvidence = (id)      => _fetch(`/api/sessions/${id}/evidence`);

// ── Config ──────────────────────────────────────────────────────────────────
export const getConfig = () => _fetch('/api/config');

// ── Dashboard ───────────────────────────────────────────────────────────────
export const getDashboardKpis   = (station = '') => _fetch(`/api/dashboard/kpis${station ? `?station=${encodeURIComponent(station)}` : ''}`);
export const getLiveQueue       = (station = '') => _fetch(`/api/dashboard/live-queue${station ? `?station=${encodeURIComponent(station)}` : ''}`);
export const getRecentDefects   = (limit = 30, station = '') => _fetch(`/api/dashboard/recent-defects?limit=${limit}${station ? `&station=${encodeURIComponent(station)}` : ''}`);
export const getServicesHealth  = () => _fetch('/api/health/services');
export const getSystemHealth    = () => _fetch('/api/health/system');
export const getCameraHealth    = () => _fetch('/api/cameras/health');
export const getFrames          = (id, limit = 100, offset = 0) => _fetch(`/api/sessions/${id}/frames?limit=${limit}&offset=${offset}`);
export const getCoachFrames     = (id, coachId, limit = 200)   => _fetch(`/api/sessions/${id}/coaches/${coachId}/frames?limit=${limit}`);

// ── Coach Search ────────────────────────────────────────────────────────────
export const searchCoaches = (q) => _fetch(`/api/coaches/search?q=${encodeURIComponent(q)}`);

// ── OCR Results Log ────────────────────────────────────────────────────────
export const getOcrResults = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return _fetch(`/api/ocr-results${qs ? `?${qs}` : ''}`);
};

// ── Defect Analytics ────────────────────────────────────────────────────────
export const getDefectsOverTime    = (range = '7d') => _fetch(`/api/analytics/defects-over-time?range=${range}`);
export const getDefectsByType      = (range = '7d') => _fetch(`/api/analytics/defects-by-type?range=${range}`);
export const getDefectsByCoachClass = (range = '7d') => _fetch(`/api/analytics/defects-by-coach-class?range=${range}`);
export const getInferenceLatency   = (range = '7d') => _fetch(`/api/analytics/inference-latency?range=${range}`);

// ── FP/FN Review Log ────────────────────────────────────────────────────────
export const addReviewLogEntry  = (sessionId, payload) => _fetch(`/api/sessions/${sessionId}/review-log`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
export const getSessionReviewLog = (sessionId) => _fetch(`/api/sessions/${sessionId}/review-log`);
export const getReviewLog = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return _fetch(`/api/review-log${qs ? `?${qs}` : ''}`);
};

// ── Defect Verification Console ──────────────────────────────────────────────
export const getPendingReviewDefects = (limit = 50, offset = 0) =>
  _fetch(`/api/defects/pending-review?limit=${limit}&offset=${offset}`);
export const reviewDefect = (id, status, notes) => _fetch(`/api/defects/${id}/review`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ status, notes }),
});
// Binary response (zip) — _fetch's json() parser would break on this, so this
// triggers a real browser download instead of returning parsed data.
export const downloadYoloDataset = async () => {
  const resp = await fetch(`${BASE}/api/training/export-yolo-dataset`, { headers: authHeader() });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`API ${resp.status} /api/training/export-yolo-dataset: ${text}`);
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'yolo_dataset.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// ── AI Performance Analytics ──────────────────────────────────────────────────
export const getAiPerformance        = () => _fetch('/api/ai/performance');
export const getAiPerformanceHistory = (range = '30d') => _fetch(`/api/ai/performance/history?range=${range}`);
export const getModelComparison      = () => _fetch('/api/ai/performance/model-comparison');

// ── Train Passage History ─────────────────────────────────────────────────────
export const getPassages = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return _fetch(`/api/history/passages${qs ? `?${qs}` : ''}`);
};
export const getTrainTrend   = (trainNumber) => _fetch(`/api/history/train/${encodeURIComponent(trainNumber)}/trend`);
export const comparePassages = (sessionA, sessionB) => _fetch(`/api/history/compare?session_a=${sessionA}&session_b=${sessionB}`);

// ── Image Archive ────────────────────────────────────────────────────────────
export const getArchiveStats  = () => _fetch('/api/archive/stats');
export const getArchiveFrames = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return _fetch(`/api/archive/frames${qs ? `?${qs}` : ''}`);
};
export const runArchivePass   = () => _fetch('/api/archive/run', { method: 'POST' });
export const restoreFrame     = (frameId) => _fetch(`/api/archive/restore/${frameId}`, { method: 'POST' });

// ── Periodic (Historical) Reports ───────────────────────────────────────────
export const getPeriodicReports = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return _fetch(`/api/periodic-reports${qs ? `?${qs}` : ''}`);
};
export const generatePeriodicReport = (periodType) => _fetch('/api/periodic-reports/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ periodType }),
});

// ── Data Sync Hub ────────────────────────────────────────────────────────────
export const getSync = (station = '') => _fetch(`/api/sync/status${station ? `?station=${encodeURIComponent(station)}` : ''}`);
export const getSyncHistory = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return _fetch(`/api/sync/history${qs ? `?${qs}` : ''}`);
};
export const retrySyncDlq = (stage) => _fetch(`/api/sync/retry-dlq/${stage}`, { method: 'POST' });

// ── Incidents ────────────────────────────────────────────────────────────────
export const getIncidents = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return _fetch(`/api/incidents${qs ? `?${qs}` : ''}`);
};
export const getIncidentSummary = () => _fetch('/api/incidents/summary');
export const createIncident = (payload) => _fetch('/api/incidents', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
export const updateIncident = (id, payload) => _fetch(`/api/incidents/${id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
export const deleteIncident = (id) => _fetch(`/api/incidents/${id}`, { method: 'DELETE' });

// ── Assets ────────────────────────────────────────────────────────────────────
export const getAssets = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString();
  return _fetch(`/api/assets${qs ? `?${qs}` : ''}`);
};
export const getOverdueAssets   = () => _fetch('/api/assets/overdue');
export const getAssetTypes      = () => _fetch('/api/assets/types');
export const getAsset           = (id) => _fetch(`/api/assets/${id}`);
export const createAsset        = (payload) => _fetch('/api/assets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
export const updateAsset        = (id, payload) => _fetch(`/api/assets/${id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
export const deleteAsset        = (id) => _fetch(`/api/assets/${id}`, { method: 'DELETE' });
export const addMaintenanceLog  = (id, payload) => _fetch(`/api/assets/${id}/maintenance-log`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
export const getMaintenanceLogs = (id) => _fetch(`/api/assets/${id}/maintenance-log`);

// ── Stations ──────────────────────────────────────────────────────────────────
export const getStations         = ()     => _fetch('/api/stations');
export const getStationsOverview = ()     => _fetch('/api/stations/overview');
export const getStationDetail    = (code) => _fetch(`/api/stations/${code}`);

// ── Normalisation ────────────────────────────────────────────────────────────
const STATUS_MAP = {
  extracting:  'PROCESSING',
  ocr_running: 'PROCESSING',
  analysing:   'PROCESSING',
  completed:   'COMPLETED',
  failed:      'FAILED',
  queued:      'QUEUED',
};

const STAGE_STATUS_MAP = {
  pending:   'PENDING',
  running:   'IN_PROGRESS',
  completed: 'COMPLETED',
  failed:    'FAILED',
};

export function normalizeSession(s) {
  const stageMap = {};
  for (const st of s.pipeline_stages || []) {
    stageMap[st.stage] = STAGE_STATUS_MAP[st.status] || 'PENDING';
  }

  const criticalDefects = s.critical_defects || 0;

  return {
    id:            s.id,
    trainNumber:   s.train_number,
    stationName:   s.station_name || '—',
    startedAt:     s.started_at,
    completedAt:   s.completed_at,
    status:        STATUS_MAP[s.status] || s.status?.toUpperCase() || 'UNKNOWN',
    progressPercent: s.progress_pct || 0,
    totalCoaches:  s.total_coaches || 0,
    coachesCount:  s.total_coaches || 0,
    totalFrames:   s.total_frames  || 0,
    criticalDefects,
    missingComponentsCount: s.missing_components_count || 0,
    healthScore:   s.health_score ? Number(s.health_score) : null,
    ocrConfidence: s.ocr_confidence ? Number(s.ocr_confidence) : 0,
    syncHealth:    s.sync_confidence ? Number(s.sync_confidence) : 0,
    mlAccuracy:    s.ocr_confidence ? Number(s.ocr_confidence) : 0,
    mappedCoaches: s.total_coaches || 0,
    severity:      criticalDefects > 0 ? 'CRITICAL' : 'NONE',
    defectsText:   criticalDefects > 0 ? `${criticalDefects} CRIT` : 'None',
    pipelineStates: {
      frameExtraction:   stageMap.frame_extraction   || 'PENDING',
      ocrDetection:      stageMap.ocr_detection      || 'PENDING',
      synchronization:   stageMap.synchronization    || 'PENDING',
      componentDetection:stageMap.component_detection|| 'PENDING',
      defectAnalysis:    stageMap.defect_analysis    || 'PENDING',
      reportGeneration:  stageMap.report_generation  || 'PENDING',
    },
    stats: {
      totalCoaches:             s.total_coaches    || 0,
      framesCaptured:           s.total_frames     || 0,
      criticalDefects,
      ocrConfidence:            s.ocr_confidence   ? Number(s.ocr_confidence) : 0,
      synchronizationConfidence:s.sync_confidence  ? Number(s.sync_confidence) : 0,
    },
    // raw pipeline_stages for workspace detail view
    pipeline_stages: s.pipeline_stages || [],
  };
}
