const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';

async function _fetch(path, opts = {}) {
  const resp = await fetch(`${BASE}${path}`, opts);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`API ${resp.status} ${path}: ${text}`);
  }
  return resp.json();
}

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

// ── Config ──────────────────────────────────────────────────────────────────
export const getConfig = () => _fetch('/api/config');

// ── Dashboard ───────────────────────────────────────────────────────────────
export const getDashboardKpis   = () => _fetch('/api/dashboard/kpis');
export const getLiveQueue       = () => _fetch('/api/dashboard/live-queue');
export const getServicesHealth  = () => _fetch('/api/health/services');
export const getFrames          = (id, limit = 100, offset = 0) => _fetch(`/api/sessions/${id}/frames?limit=${limit}&offset=${offset}`);
export const getCoachFrames     = (id, coachId, limit = 200)   => _fetch(`/api/sessions/${id}/coaches/${coachId}/frames?limit=${limit}`);

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
