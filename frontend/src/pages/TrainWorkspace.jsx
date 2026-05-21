import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HierarchyTree } from '../components/workspace/HierarchyTree';
import { usePolling } from '../hooks/usePolling';
import { useSessionSocket } from '../hooks/useSessionSocket';
import { toast } from '../hooks/useToast';
import { getSession, getHierarchy, getIntelligence, generateReport, getFrames, normalizeSession } from '../lib/api';
import {
  ArrowLeft, Cpu, Train, ShieldAlert, Activity, FileCheck,
  ChevronRight, ShieldQuestion, LayoutGrid, Maximize, Sparkles,
  CheckCircle, AlertTriangle, RefreshCw, Camera, ZoomIn, ZoomOut,
  Clock, Inbox, XCircle, Image as ImageIcon
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const PROCESSING_STATUSES = new Set(['extracting', 'extraction_complete', 'ocr_running', 'analysing']);

// ── Stage config ─────────────────────────────────────────────────────────────
const STAGE_META = [
  { key: 'frame_extraction',    label: 'Frame Extraction',    icon: Camera },
  { key: 'ocr_detection',       label: 'OCR Detection',       icon: Sparkles },
  { key: 'synchronization',     label: 'Synchronization',     icon: Activity },
  { key: 'component_detection', label: 'Component Detection', icon: Cpu },
  { key: 'defect_analysis',     label: 'Defect Analysis',     icon: ShieldAlert },
  { key: 'report_generation',   label: 'Report Generation',   icon: FileCheck },
];

// ── Stage status chip ────────────────────────────────────────────────────────
function stageChip(status, label, doneLabel) {
  if (status === 'COMPLETED' || status === 'completed')
    return { text: `✓ ${doneLabel}`, cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
  if (status === 'IN_PROGRESS' || status === 'running')
    return { text: `~ ${label}`, cls: 'border-blue-200 bg-blue-50 text-blue-700 animate-pulse' };
  if (status === 'FAILED' || status === 'failed')
    return { text: `✗ ${label}`, cls: 'border-red-200 bg-red-50 text-red-700' };
  return { text: `• ${label}`, cls: 'border-slate-200 bg-slate-100 text-slate-400' };
}

// ── Pipeline Progress View (shown while processing) ──────────────────────────
function PipelineProgressView({ rawSession, rawStages, sessionCameras, stageProgress }) {
  const statusColor = {
    completed: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    running:   'text-blue-700   bg-blue-50   border-blue-200   animate-pulse',
    failed:    'text-red-700    bg-red-50    border-red-200',
    pending:   'text-slate-400  bg-slate-100 border-slate-200',
  };

  const getStageData = (key) => {
    const s = rawStages.find(r => r.stage === key) || {};
    const ws = stageProgress[key] || {};
    return {
      status:    s.status || 'pending',
      message:   s.detail_message || '',
      stats:     { ...(s.stats || {}), ...ws },
      startedAt: s.started_at,
    };
  };

  const extraction = getStageData('frame_extraction');
  const ocr        = getStageData('ocr_detection');
  const sync       = getStageData('synchronization');
  const component  = getStageData('component_detection');
  const defect     = getStageData('defect_analysis');
  const report     = getStageData('report_generation');

  const totalFrames = rawSession?.total_frames || 0;
  // The extractor writes frames_uploaded + total_video_frames to pipeline_stages.stats on every flush.
  // Use frames_uploaded as the denominator proxy when the video is still running,
  // or fall back to total_video_frames if frame_interval isn't stored.
  // We use totalFrames (DB count) as the numerator — it's the source of truth.
  const statsUploaded  = extraction.stats?.frames_uploaded || 0;
  const statsVideoTotal = extraction.stats?.total_video_frames || 0;
  // After extraction completes, frames_uploaded equals totalFrames.
  // Use the larger of the two as the denominator so the bar doesn't exceed 100%.
  const expectedFrames = Math.max(statsUploaded, totalFrames);
  const extractionPct  = expectedFrames > 0 ? Math.min(100, Math.round((totalFrames / expectedFrames) * 100)) : 0;

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Overall progress */}
        <div className="bg-white border border-border rounded-lg p-4 shadow-sm">
          <div className="flex justify-between items-center mb-2 text-xs font-bold text-slate-600 uppercase">
            <span>Overall Pipeline Progress</span>
            <span className="font-mono">{rawSession?.progress_pct || 0}%</span>
          </div>
          <Progress value={rawSession?.progress_pct || 0} className="h-3" />
          <p className="text-[10px] text-muted-foreground mt-2 font-semibold uppercase">
            Status: <span className="text-foreground">{rawSession?.status || '—'}</span>
            {totalFrames > 0 && <span className="ml-4">Total frames in DB: <span className="text-foreground">{totalFrames}</span></span>}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Frame Extraction Card */}
          <Card className={`border-2 shadow-sm ${extraction.status === 'running' ? 'border-blue-300' : extraction.status === 'completed' ? 'border-emerald-300' : 'border-border'}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-black uppercase tracking-wide flex items-center gap-2">
                  <Camera className="w-4 h-4 text-primary" /> Frame Extraction
                </CardTitle>
                <Badge className={`text-[9px] font-black border ${statusColor[extraction.status] || statusColor.pending}`}>
                  {extraction.status.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {/* Live frame counter — updates every ~10 frames from DB */}
              <div>
                <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                  <span>Frames in DB</span>
                  <span className="font-mono">
                    {totalFrames}
                    {expectedFrames > 0 && <span className="text-slate-400"> / ~{expectedFrames}</span>}
                  </span>
                </div>
                {expectedFrames > 0 ? (
                  <Progress value={extractionPct} className="h-2" />
                ) : (
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full w-1/3 bg-blue-400 rounded-full animate-pulse" />
                  </div>
                )}
                {statsVideoTotal > 0 && (
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">{extractionPct}% — raw video has {statsVideoTotal} frames</p>
                )}
              </div>
              {/* Per-camera: show done/running status */}
              {sessionCameras.length > 0 && (
                <div className="space-y-1">
                  {sessionCameras.map((cam) => (
                    <div key={cam.id} className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                      <span className="truncate max-w-[180px]">{cam.name || cam.camera_type}</span>
                      {cam.frame_count > 0
                        ? <span className="text-emerald-600 font-mono shrink-0 ml-2">✓ {cam.frame_count} frames</span>
                        : <span className="text-blue-500 shrink-0 ml-2 animate-pulse">uploading…</span>
                      }
                    </div>
                  ))}
                </div>
              )}
              {extraction.message && (
                <p className="text-[10px] text-muted-foreground italic">{extraction.message}</p>
              )}
            </CardContent>
          </Card>

          {/* OCR Detection Card */}
          <Card className={`border-2 shadow-sm ${ocr.status === 'running' ? 'border-blue-300' : ocr.status === 'completed' ? 'border-emerald-300' : 'border-border'}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-black uppercase tracking-wide flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> OCR Detection
                </CardTitle>
                <Badge className={`text-[9px] font-black border ${statusColor[ocr.status] || statusColor.pending}`}>
                  {ocr.status.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {ocr.message && (
                <p className="text-[10px] text-muted-foreground font-semibold">{ocr.message}</p>
              )}
              {ocr.stats?.total > 0 && (
                <>
                  <div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                      <span>Frames processed</span>
                      <span className="font-mono">{ocr.stats.processed || 0} / {ocr.stats.total}</span>
                    </div>
                    <Progress value={ocr.stats.progress_pct || 0} className="h-2" />
                  </div>
                  <p className="text-[10px] font-mono text-slate-500">
                    Valid coach detections: <span className="text-foreground font-bold">{ocr.stats.valid || ocr.stats.valid_detections || 0}</span>
                  </p>
                </>
              )}
              {totalFrames > 0 && ocr.status === 'pending' && (
                <p className="text-[10px] text-slate-400 font-semibold">{totalFrames} frames ready — waiting for OCR to start...</p>
              )}
            </CardContent>
          </Card>

          {/* Synchronization Card */}
          <Card className={`border-2 shadow-sm ${sync.status === 'running' ? 'border-blue-300' : sync.status === 'completed' ? 'border-emerald-300' : 'border-border'}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-black uppercase tracking-wide flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" /> Synchronization
                </CardTitle>
                <Badge className={`text-[9px] font-black border ${statusColor[sync.status] || statusColor.pending}`}>
                  {sync.status.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {sync.message
                ? <p className="text-[10px] text-muted-foreground font-semibold">{sync.message}</p>
                : <p className="text-[10px] text-slate-400 font-semibold">Maps OCR anchors to coach boundaries using gap detection.</p>
              }
              {rawSession?.total_coaches > 0 && (
                <p className="text-[10px] font-mono text-emerald-700 font-bold mt-2">
                  {rawSession.total_coaches} coaches mapped
                </p>
              )}
            </CardContent>
          </Card>

          {/* Component + Defect Card */}
          <Card className={`border-2 shadow-sm ${component.status === 'running' || defect.status === 'running' ? 'border-blue-300' : component.status === 'completed' ? 'border-emerald-300' : 'border-border'}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-black uppercase tracking-wide flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary" /> Component & Defect Analysis
                </CardTitle>
                <div className="flex gap-1">
                  <Badge className={`text-[9px] font-black border ${statusColor[component.status] || statusColor.pending}`}>
                    COMP: {component.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              {component.message && <p className="text-[10px] text-muted-foreground font-semibold">{component.message}</p>}
              {defect.message && <p className="text-[10px] text-muted-foreground font-semibold">{defect.message}</p>}
              {component.stats?.coaches_processed > 0 && (
                <p className="text-[10px] font-mono text-slate-500">
                  Coaches processed: {component.stats.coaches_processed} | Defects: {component.stats.total_defects || 0}
                </p>
              )}
              {!component.message && !defect.message && (
                <p className="text-[10px] text-slate-400 font-semibold">YOLO runs per-coach after synchronization completes.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Live WS hint */}
        <p className="text-center text-[10px] text-muted-foreground font-semibold">
          This page auto-refreshes every 3 s and receives live WebSocket events from the pipeline.
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export const TrainWorkspace = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const { data: rawSession } = usePolling(useCallback(() => getSession(sessionId), [sessionId]), 3000);
  const { data: hierarchyData } = usePolling(useCallback(() => getHierarchy(sessionId), [sessionId]), 8000);
  const session       = rawSession ? normalizeSession(rawSession) : null;
  const realCoaches   = hierarchyData?.coaches || [];
  const rawStages     = rawSession?.pipeline_stages || [];
  const sessionCameras = rawSession?.session_cameras || [];

  // Frames for timeline + viewer (loaded when completed)
  const [frames, setFrames]               = useState([]);
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [layoutMode, setLayoutMode]       = useState('single');
  const [zoomLevel, setZoomLevel]         = useState(100);

  // Intelligence for selected coach
  const [intelligence, setIntelligence]               = useState(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [reportLoading, setReportLoading]             = useState(false);

  // Live WS stage overrides + progress
  const [stageOverrides, setStageOverrides] = useState({});
  const [stageProgress, setStageProgress]   = useState({});
  const { lastEvent, connected } = useSessionSocket(sessionId);

  useEffect(() => {
    if (!lastEvent) return;
    const { type, stage, status, message, processed, total, pct } = lastEvent;

    if (type === 'stage_update' && stage) {
      const MAP = { running: 'IN_PROGRESS', completed: 'COMPLETED', failed: 'FAILED' };
      setStageOverrides(prev => ({ ...prev, [stage]: MAP[status] || status?.toUpperCase() }));
      if (status === 'completed') {
        const labels = { frame_extraction: 'Frame Extraction', ocr_detection: 'OCR Detection', synchronization: 'Synchronization', component_detection: 'Component Detection', defect_analysis: 'Defect Analysis' };
        toast.success(message || `${labels[stage] || stage} complete`, labels[stage] || 'Pipeline Update');
      }
    }
    if (type === 'progress_update' && stage) {
      setStageProgress(prev => ({ ...prev, [stage]: { processed, total, pct } }));
    }
    if (type === 'session_completed') {
      toast.success('Inspection pipeline finished.', 'Session Complete');
      setStageOverrides({});
    }
    if (type === 'session_failed') {
      toast.error('Pipeline encountered a fatal error.', 'Session Failed');
    }
  }, [lastEvent]);

  // Load frames when session completes
  useEffect(() => {
    if (session?.status === 'completed' && frames.length === 0) {
      getFrames(sessionId, 200).then(data => {
        const f = data.frames || [];
        setFrames(f);
        if (f.length > 0) setSelectedFrame(f[0]);
      }).catch(() => {});
    }
  }, [session?.status, sessionId, frames.length]);

  const loadIntelligence = useCallback(async (coachId) => {
    setIntelligenceLoading(true);
    try {
      const data = await getIntelligence(sessionId, coachId);
      setIntelligence(data);
    } catch (_) { setIntelligence(null); }
    finally { setIntelligenceLoading(false); }
  }, [sessionId]);

  const handleSelectNode = (type, id, metadata) => {
    if (type === 'coach' && metadata?.id) loadIntelligence(metadata.id);
  };

  // Merged pipeline states (WS overrides polled data)
  const ps = {};
  const WS_KEY_MAP = { frameExtraction: 'frame_extraction', ocrDetection: 'ocr_detection', synchronization: 'synchronization', componentDetection: 'component_detection', defectAnalysis: 'defect_analysis', reportGeneration: 'report_generation' };
  for (const [camel, snake] of Object.entries(WS_KEY_MAP)) {
    ps[camel] = stageOverrides[snake] || session?.pipelineStates?.[camel] || 'PENDING';
  }

  const isProcessing = PROCESSING_STATUSES.has(rawSession?.status || '');
  const isCompleted  = rawSession?.status === 'completed';
  const isFailed     = rawSession?.status === 'failed';

  // ── Shared header ────────────────────────────────────────────────────────
  const header = (
    <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between z-10 shrink-0 shadow-sm">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/sessions')} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-500 hover:text-slate-900 border border-slate-200 bg-white">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="space-y-0.5">
          <div className="flex items-center gap-3">
            <h2 className="text-md font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
              <Train className="w-5 h-5 text-primary" />
              {session?.trainNumber || 'Loading...'}
            </h2>
            <Badge className="font-extrabold text-[9px] uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              {session?.status || '…'}
            </Badge>
            <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
              {sessionId.slice(0, 8)}…
            </span>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${connected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {connected ? 'LIVE' : 'POLLING'}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 font-bold font-mono">
            {session?.totalFrames ?? '—'} FRAMES | {session?.totalCoaches ?? '—'} COACHES | {session?.criticalDefects ?? 0} CRITICAL DEFECTS
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6 text-xs font-mono font-bold">
        <div className="text-right">
          <span className="text-[9px] text-slate-400 block leading-none mb-1">HEALTH SCORE</span>
          <span className="text-slate-900 font-extrabold">{session?.healthScore != null ? `${session.healthScore}%` : '—'}</span>
        </div>
        <div className="text-right">
          <span className="text-[9px] text-slate-400 block leading-none mb-1">OCR CONFIDENCE</span>
          <span className="text-slate-900 font-extrabold">
            {session?.ocrConfidence ? `${(session.ocrConfidence * 100).toFixed(1)}%` : '—'}
          </span>
        </div>
        {isCompleted && (
          <button
            onClick={async () => { setReportLoading(true); try { await generateReport(sessionId); } catch (_) {} finally { setReportLoading(false); } }}
            disabled={reportLoading}
            className="bg-primary hover:bg-slate-800 text-white px-4 py-2 rounded text-[10px] uppercase font-bold tracking-wider shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-60"
          >
            {reportLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
            {reportLoading ? 'Generating...' : 'Export Report'}
          </button>
        )}
      </div>
    </div>
  );

  // ── Pipeline timeline bar ────────────────────────────────────────────────
  const pipelineBar = (
    <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 shrink-0 flex flex-wrap items-center justify-between text-[10px] font-bold text-slate-500 shadow-inner gap-2">
      <div className="flex items-center gap-2 w-full md:w-auto">
        <span className="font-mono text-slate-400">PIPELINE:</span>
        <Progress value={session?.progressPercent ?? 0} className="h-2 bg-slate-200 w-40 rounded-full" />
        <span className="font-mono text-slate-900">{session?.progressPercent ?? 0}%</span>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        {[
          stageChip(ps.frameExtraction,    'FRAMES',     'FRAMES'),
          stageChip(ps.ocrDetection,       'OCR',        'OCR'),
          stageChip(ps.synchronization,    'SYNC',       'SYNC'),
          stageChip(ps.componentDetection, 'COMPONENTS', 'COMPONENTS'),
          stageChip(ps.defectAnalysis,     'DEFECTS',    'DEFECTS'),
          stageChip(ps.reportGeneration,   'REPORT',     'REPORT'),
        ].map((chip, i, arr) => (
          <React.Fragment key={i}>
            <span className={`px-2 py-0.5 rounded border font-black ${chip.cls}`}>{chip.text}</span>
            {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-slate-400" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  // ── Loading state ────────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#faf9ff]">
        {header}
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // ── Pipeline in progress ─────────────────────────────────────────────────
  if (isProcessing) {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#faf9ff] overflow-hidden font-sans">
        {header}
        {pipelineBar}
        <PipelineProgressView
          rawSession={rawSession}
          rawStages={rawStages}
          sessionCameras={sessionCameras}
          stageProgress={stageProgress}
        />
      </div>
    );
  }

  // ── Completed / Failed workspace ─────────────────────────────────────────
  const displayDefects = intelligence?.defects?.map(d => ({
    id:       d.id,
    name:     d.defect_type,
    type:     d.defect_type,
    severity: d.severity,
    conf:     `${Math.round((d.confidence_score || d.confidence || 0) * 100)}%`,
    notes:    d.ai_notes || '',
  })) || [];

  const displayComponents = intelligence?.component_detections?.map(c => ({
    id:       c.id,
    name:     c.component_name || c.component_code,
    detected: c.detected ?? (c.status === 'detected'),
    status:   (c.detected ?? c.status === 'detected') ? 'OK' : 'MISSING',
    conf:     c.confidence_score || c.confidence || 0,
  })) || [];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#faf9ff] overflow-hidden font-sans">
      {header}
      {pipelineBar}

      {/* Three-Panel Grid */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left — Hierarchy Tree */}
        <div className="w-80 border-r border-slate-200 p-4 shrink-0 flex flex-col h-full bg-white">
          <div className="mb-3">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Fleet Hierarchy Tree</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Coaches & Camera Feeds</p>
          </div>
          <div className="flex-1 min-h-0">
            <HierarchyTree
              onSelectNode={handleSelectNode}
              coaches={realCoaches}
              trainNumber={session?.trainNumber}
              sessionId={sessionId}
            />
          </div>
        </div>

        {/* Center — Frame Viewer */}
        <div className="flex-1 flex flex-col min-w-0 p-4 bg-slate-50">
          {/* Controls */}
          <div className="flex justify-between items-center mb-3 shrink-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase">
              {frames.length > 0 ? `${frames.length} frames loaded` : 'No frames loaded'}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-white border border-slate-200 rounded p-0.5 shadow-sm">
                <button onClick={() => setLayoutMode('single')} className={`p-1.5 rounded transition-all ${layoutMode === 'single' ? 'bg-slate-100 text-slate-800' : 'text-slate-400'}`} title="Single frame">
                  <Maximize className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setLayoutMode('grid')} className={`p-1.5 rounded transition-all ${layoutMode === 'grid' ? 'bg-slate-100 text-slate-800' : 'text-slate-400'}`} title="Frame grid">
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded p-1 shadow-sm text-xs font-mono font-bold">
                <button onClick={() => setZoomLevel(p => Math.max(50, p - 10))} className="p-1 hover:bg-slate-50 rounded"><ZoomOut className="w-3.5 h-3.5 text-slate-500" /></button>
                <span className="w-10 text-center">{zoomLevel}%</span>
                <button onClick={() => setZoomLevel(p => Math.min(200, p + 10))} className="p-1 hover:bg-slate-50 rounded"><ZoomIn className="w-3.5 h-3.5 text-slate-500" /></button>
              </div>
            </div>
          </div>

          {/* Viewport */}
          <div className="flex-1 bg-slate-900 rounded-lg flex items-center justify-center relative overflow-hidden shadow-inner border border-slate-950">
            {isFailed ? (
              <div className="text-center space-y-2">
                <XCircle className="w-10 h-10 text-red-500 mx-auto" />
                <p className="text-white text-sm font-bold">Pipeline Failed</p>
                <p className="text-slate-400 text-xs">Check backend logs for details.</p>
              </div>
            ) : frames.length === 0 ? (
              <div className="text-center space-y-2">
                <ImageIcon className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-sm font-bold">No frames loaded</p>
                <p className="text-slate-500 text-xs">Frames appear here after processing completes.</p>
              </div>
            ) : layoutMode === 'single' ? (
              <div className="w-full h-full flex items-center justify-center p-6" style={{ transform: `scale(${zoomLevel / 100})` }}>
                {selectedFrame ? (
                  <img
                    src={selectedFrame.cloudinary_url}
                    alt={`Frame ${selectedFrame.sequence_number}`}
                    className="max-w-full max-h-full object-contain rounded border border-slate-800 shadow-2xl"
                  />
                ) : (
                  <p className="text-slate-500 text-xs">Select a frame from the timeline below</p>
                )}
              </div>
            ) : (
              <div className="w-full h-full grid grid-cols-3 gap-2 p-4 overflow-auto" style={{ transform: `scale(${zoomLevel / 100})` }}>
                {frames.slice(0, 9).map((f) => (
                  <div key={f.id} onClick={() => { setSelectedFrame(f); setLayoutMode('single'); }} className="relative bg-slate-950 border border-slate-800 rounded overflow-hidden cursor-pointer hover:border-primary transition-colors">
                    <img src={f.thumbnail_url || f.cloudinary_url} alt="" className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-1 left-1 bg-slate-950/80 px-1 rounded font-mono text-[8px] text-slate-300">
                      #{f.sequence_number}
                    </div>
                    {f.is_defect_flagged && <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />}
                    {f.is_ocr_candidate && <div className="absolute top-1 left-1 w-2.5 h-2.5 rounded-full bg-blue-500" />}
                  </div>
                ))}
              </div>
            )}

            {/* Frame info overlay */}
            {selectedFrame && layoutMode === 'single' && (
              <div className="absolute top-3 left-3 bg-slate-950/80 text-[9px] font-mono text-slate-300 px-2.5 py-1.5 rounded border border-slate-800 backdrop-blur z-20 space-y-0.5">
                <p><span className="text-slate-500">FRAME:</span> #{selectedFrame.sequence_number}</p>
                <p><span className="text-slate-500">TRIGGER_ID:</span> {selectedFrame.trigger_id}</p>
                {selectedFrame.ocr_results?.[0] && (
                  <p><span className="text-slate-500">OCR:</span> Coach {selectedFrame.ocr_results[0].coach_number} ({(selectedFrame.ocr_results[0].confidence * 100).toFixed(0)}%)</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right — Intelligence Panel */}
        <div className="w-96 border-l border-slate-200 p-4 shrink-0 flex flex-col h-full bg-white overflow-y-auto">
          <div className="mb-4">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">AI Intelligence Feed</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Select a coach from the tree to load</p>
          </div>

          {intelligenceLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : intelligence === null ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Sparkles className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-semibold">No coach selected</p>
              <p className="text-[10px]">Click a coach in the hierarchy tree to load its inspection results.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Defects */}
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-600" /> Detected Defects ({displayDefects.length})
                </h4>
                {displayDefects.length === 0 ? (
                  <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded text-center text-xs text-emerald-800 font-medium">
                    ✓ No defects found for this coach.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {displayDefects.map((d) => (
                      <div key={d.id} className={`p-3 rounded border text-xs ${d.severity === 'CRITICAL' ? 'bg-red-50/50 border-red-200' : 'bg-amber-50/50 border-amber-200'}`}>
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${d.severity === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'}`}>{d.severity}</span>
                          <span className="font-mono text-[9px] text-slate-500">{d.conf}</span>
                        </div>
                        <p className="font-black text-slate-900">{d.name}</p>
                        {d.notes && <p className="text-[10px] text-slate-500 mt-0.5">{d.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Component checklist */}
              {displayComponents.length > 0 && (
                <Card className="border border-slate-200 shadow-sm bg-white">
                  <CardHeader className="p-3 border-b border-slate-100 bg-slate-50/50">
                    <CardTitle className="text-[10px] font-black tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-primary" /> Structural Checklist
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <table className="w-full text-[10px] font-mono text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400">
                          <th className="pb-1.5 font-bold uppercase">Component</th>
                          <th className="pb-1.5 font-bold uppercase text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayComponents.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="py-2 font-bold text-slate-800">{c.name}</td>
                            <td className="py-2 text-right">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${c.status === 'OK' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200 animate-pulse'}`}>
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* Pipeline diagnostics from intelligence */}
              {intelligence.ocr_summary && (
                <Card className="border border-slate-200 shadow-sm">
                  <CardHeader className="p-3 border-b border-slate-100 bg-slate-50/50">
                    <CardTitle className="text-[10px] font-black tracking-wider uppercase text-slate-400">Pipeline Diagnostics</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 text-[10px] text-slate-500 font-medium space-y-1">
                    <p><span className="text-primary font-bold">[OCR]</span> {intelligence.ocr_summary}</p>
                    {intelligence.sync_summary && <p><span className="text-primary font-bold">[SYNC]</span> {intelligence.sync_summary}</p>}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom — Real Frame Timeline */}
      <div className="h-28 bg-slate-900 border-t border-white/10 flex flex-col shrink-0 z-10">
        <div className="px-4 py-1.5 flex items-center justify-between bg-slate-950 border-b border-white/10 shrink-0">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-primary" /> Frame Timeline
          </span>
          <span className="text-[9px] text-slate-500 font-mono">
            {selectedFrame ? `Selected: frame #${selectedFrame.sequence_number}` : 'Click a frame to view'}
          </span>
        </div>

        <div className="flex-1 overflow-x-auto flex items-center px-4 gap-2 py-2 bg-slate-900/90">
          {frames.length === 0 ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-slate-600">
              <Inbox className="w-4 h-4" />
              <span className="text-[10px] font-semibold">No frames yet</span>
            </div>
          ) : (
            frames.map((f) => {
              const isActive = selectedFrame?.id === f.id;
              return (
                <div
                  key={f.id}
                  onClick={() => { setSelectedFrame(f); setLayoutMode('single'); }}
                  className={`flex-none w-20 h-14 rounded border relative cursor-pointer overflow-hidden transition-all ${isActive ? 'border-primary ring-2 ring-primary/40 scale-105' : 'border-white/10 hover:border-white/30'}`}
                >
                  <img
                    src={f.thumbnail_url || f.cloudinary_url}
                    alt=""
                    className={`w-full h-full object-cover transition-opacity ${isActive ? 'opacity-90' : 'opacity-40 hover:opacity-65'}`}
                  />
                  <div className="absolute bottom-0.5 left-0.5 bg-black/70 px-1 rounded text-[7px] font-mono text-white">
                    #{f.sequence_number}
                  </div>
                  {f.is_defect_flagged && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500 block animate-pulse" />}
                  {f.is_ocr_candidate && <span className="absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-blue-500 block" />}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
