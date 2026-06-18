import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HierarchyTree } from '../components/workspace/HierarchyTree';
import { usePolling } from '../hooks/usePolling';
import { useSessionSocket } from '../hooks/useSessionSocket';
import { toast } from '../hooks/useToast';
import { getSession, getHierarchy, getIntelligence, generateReport, getFrames, getCoachFrames, normalizeSession } from '../lib/api';
import {
  ArrowLeft, Cpu, Train, ShieldAlert, Activity, FileCheck,
  ChevronRight, ChevronLeft, ShieldQuestion, LayoutGrid, Maximize, Sparkles,
  CheckCircle, AlertTriangle, RefreshCw, Camera, ZoomIn, ZoomOut,
  Clock, Inbox, XCircle, Image as ImageIcon, ScanSearch, Minimize2, Maximize2, FolderTree
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
  let dotColor = 'bg-slate-300';
  let dotShadow = '';
  let dotAnimation = '';
  let textColor = 'text-slate-500';
  let text = label;

  if (status === 'COMPLETED' || status === 'completed') {
    dotColor = 'bg-emerald-500';
    dotShadow = 'shadow-[0_0_6px_rgba(16,185,129,0.4)]';
    textColor = 'text-slate-800';
    text = doneLabel;
  } else if (status === 'IN_PROGRESS' || status === 'running') {
    dotColor = 'bg-blue-500';
    dotShadow = 'shadow-[0_0_6px_rgba(59,130,246,0.4)]';
    dotAnimation = 'animate-pulse';
    textColor = 'text-slate-800';
  } else if (status === 'FAILED' || status === 'failed') {
    dotColor = 'bg-red-500';
    dotShadow = 'shadow-[0_0_6px_rgba(239,68,68,0.4)]';
    textColor = 'text-slate-800';
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider shadow-sm transition-all hover:border-slate-300">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${dotShadow} ${dotAnimation}`} />
      <span className={textColor}>{text}</span>
    </span>
  );
}

// ── Pipeline Progress View (shown while processing) ──────────────────────────
function PipelineProgressView({ rawSession, rawStages, sessionCameras, stageProgress }) {
  const statusColor = {
    completed: 'text-slate-800 bg-white border-slate-200',
    running:   'text-slate-800 bg-white border-slate-200',
    failed:    'text-slate-800 bg-white border-slate-200',
    pending:   'text-slate-400 bg-slate-50 border-slate-200',
  };

  const statusDot = (status) => {
    let dotColor = 'bg-slate-300';
    let dotShadow = '';
    let dotAnimation = '';
    if (status === 'completed') {
      dotColor = 'bg-emerald-500';
      dotShadow = 'shadow-[0_0_6px_rgba(16,185,129,0.4)]';
    } else if (status === 'running') {
      dotColor = 'bg-blue-500';
      dotShadow = 'shadow-[0_0_6px_rgba(59,130,246,0.4)]';
      dotAnimation = 'animate-pulse';
    } else if (status === 'failed') {
      dotColor = 'bg-red-500';
      dotShadow = 'shadow-[0_0_6px_rgba(239,68,68,0.4)]';
    }
    return <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${dotShadow} ${dotAnimation}`} />;
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
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <div className="flex justify-between items-center mb-2 text-xs font-bold text-slate-600 uppercase">
            <span>Overall Pipeline Progress</span>
            <span className="font-mono">{rawSession?.progress_pct || 0}%</span>
          </div>
          <Progress value={rawSession?.progress_pct || 0} className="h-3 rounded-full" />
          <div className="text-[10px] text-muted-foreground mt-3 font-semibold uppercase flex items-center gap-3">
            <span>Status:</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700">
              <span className={`w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse`} />
              {rawSession?.status || '—'}
            </span>
            {totalFrames > 0 && (
              <span className="ml-4">
                Total frames in DB: <span className="text-foreground font-bold">{totalFrames}</span>
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Frame Extraction Card */}
          <Card className={`border shadow-sm transition-all duration-300 ${extraction.status === 'running' ? 'border-blue-200 shadow-blue-50/50' : extraction.status === 'completed' ? 'border-emerald-100 shadow-emerald-50/20' : 'border-slate-200'}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-black uppercase tracking-wide flex items-center gap-2 text-slate-800">
                  <Camera className="w-4 h-4 text-primary" /> Frame Extraction
                </CardTitle>
                <Badge className={`text-[9px] font-black border flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${statusColor[extraction.status] || statusColor.pending}`}>
                  {statusDot(extraction.status)}
                  {extraction.status.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {/* Live frame counter */}
              <div>
                <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                  <span>Frames in DB</span>
                  <span className="font-mono">
                    {totalFrames}
                    {expectedFrames > 0 && <span className="text-slate-400"> / ~{expectedFrames}</span>}
                  </span>
                </div>
                {expectedFrames > 0 ? (
                  <Progress value={extractionPct} className="h-2 rounded-full" />
                ) : (
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full w-1/3 bg-blue-400 rounded-full animate-pulse" />
                  </div>
                )}
                {statsVideoTotal > 0 && (
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">{extractionPct}% — raw video has {statsVideoTotal} frames</p>
                )}
              </div>
              {/* Per-camera */}
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
          <Card className={`border shadow-sm transition-all duration-300 ${ocr.status === 'running' ? 'border-blue-200 shadow-blue-50/50' : ocr.status === 'completed' ? 'border-emerald-100 shadow-emerald-50/20' : 'border-slate-200'}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-black uppercase tracking-wide flex items-center gap-2 text-slate-800">
                  <Sparkles className="w-4 h-4 text-primary" /> OCR Detection
                </CardTitle>
                <Badge className={`text-[9px] font-black border flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${statusColor[ocr.status] || statusColor.pending}`}>
                  {statusDot(ocr.status)}
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
                    <Progress value={ocr.stats.progress_pct || 0} className="h-2 rounded-full" />
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
          <Card className={`border shadow-sm transition-all duration-300 ${sync.status === 'running' ? 'border-blue-200 shadow-blue-50/50' : sync.status === 'completed' ? 'border-emerald-100 shadow-emerald-50/20' : 'border-slate-200'}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-black uppercase tracking-wide flex items-center gap-2 text-slate-800">
                  <Activity className="w-4 h-4 text-primary" /> Synchronization
                </CardTitle>
                <Badge className={`text-[9px] font-black border flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${statusColor[sync.status] || statusColor.pending}`}>
                  {statusDot(sync.status)}
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
          <Card className={`border shadow-sm transition-all duration-300 ${component.status === 'running' || defect.status === 'running' ? 'border-blue-200 shadow-blue-50/50' : component.status === 'completed' ? 'border-emerald-100 shadow-emerald-50/20' : 'border-slate-200'}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-black uppercase tracking-wide flex items-center gap-2 text-slate-800">
                  <Cpu className="w-4 h-4 text-primary" /> Component & Defect Analysis
                </CardTitle>
                <div className="flex gap-1">
                  <Badge className={`text-[9px] font-black border flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${statusColor[component.status] || statusColor.pending}`}>
                    {statusDot(component.status)}
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

  // Component frames mode — active when user clicks "Component Frames" in tree
  const [componentMode,        setComponentMode]        = useState(false);
  const [ocrMode,              setOcrMode]              = useState(false);
  const [componentFrames,      setComponentFrames]      = useState([]); // frames for selected coach
  const [componentDetectionMap, setComponentDetectionMap] = useState({}); // frameId → detections[]
  const [componentFramesLoading, setComponentFramesLoading] = useState(false);

  // Per-camera timeline tracks — populated when a coach is selected
  const [coachCameraGroups, setCoachCameraGroups] = useState([]); // [{ cameraType, cameraName, frames[] }]

  // Fullscreen and Collapsible Sidebar
  const [isFullscreen,         setIsFullscreen]         = useState(false);
  const [sidebarCollapsed,     setSidebarCollapsed]     = useState(false);
  const [fullscreenLeftOpen,   setFullscreenLeftOpen]   = useState(false);
  const [fullscreenRightOpen,  setFullscreenRightOpen]  = useState(false);

  // Bounding box overlays
  const [showOcrBoxes,        setShowOcrBoxes]        = useState(false);
  const [showDefectBoxes,     setShowDefectBoxes]     = useState(false);
  const [showComponentBoxes,  setShowComponentBoxes]  = useState(true);
  const imgRef    = useRef(null);
  const canvasRef = useRef(null);
  const fullscreenImgRef    = useRef(null);
  const fullscreenCanvasRef = useRef(null);

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
    if (session?.status === 'COMPLETED' && frames.length === 0) {
      getFrames(sessionId, 200).then(data => {
        const f = data.frames || [];
        setFrames(f);
        if (f.length > 0) setSelectedFrame(f[0]);
      }).catch(() => {});
    }
  }, [session?.status, sessionId, frames.length]);

  // Draw OCR / defect bounding boxes on the canvas overlay
  const drawOverlay = useCallback(() => {
    const img    = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    canvas.width  = img.offsetWidth;
    canvas.height = img.offsetHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showOcrBoxes && !showDefectBoxes && !showComponentBoxes) return;
    if (!img.naturalWidth) return;

    // Compute letterbox offsets for object-contain scaling
    const scaleX  = img.offsetWidth  / img.naturalWidth;
    const scaleY  = img.offsetHeight / img.naturalHeight;
    const scale   = Math.min(scaleX, scaleY);
    const offX    = (img.offsetWidth  - img.naturalWidth  * scale) / 2;
    const offY    = (img.offsetHeight - img.naturalHeight * scale) / 2;

    const drawBox = (bx, by, bw, bh, color, label) => {
      if (bx == null) return;
      const x = bx * scale + offX;
      const y = by * scale + offY;
      const w = bw * scale;
      const h = bh * scale;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle   = color.replace(')', ', 0.08)').replace('rgb', 'rgba');
      ctx.fillRect(x, y, w, h);
      if (label) {
        ctx.font      = 'bold 11px monospace';
        ctx.fillStyle = color;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(x, y > 14 ? y - 14 : y, tw + 4, 13);
        ctx.fillStyle = color;
        ctx.fillText(label, x + 2, y > 14 ? y - 3 : y + 10);
      }
    };

    if (showOcrBoxes) {
      for (const r of selectedFrame?.ocr_results || []) {
        const label = r.is_valid
          ? `Coach ${r.coach_number} (${Math.round(r.confidence * 100)}%)`
          : `? (${Math.round(r.confidence * 100)}%)`;
        drawBox(r.bbox_x, r.bbox_y, r.bbox_w, r.bbox_h, 'rgb(59,130,246)', label);
      }
    }

    if (showComponentBoxes && selectedFrame) {
      const dets = componentDetectionMap[selectedFrame.id] || [];
      for (const d of dets) {
        const label = `${d.component_name ?? d.component_code} ${Math.round(d.confidence * 100)}%`;
        drawBox(d.bbox.x, d.bbox.y, d.bbox.w, d.bbox.h, 'rgb(163,230,53)', label); // lime-400
      }
    }

    if (showDefectBoxes) {
      for (const d of selectedFrame?.defects || []) {
        const color = d.severity === 'CRITICAL' ? 'rgb(239,68,68)' : 'rgb(245,158,11)';
        drawBox(d.bbox_x, d.bbox_y, d.bbox_w, d.bbox_h, color, d.defect_type);
      }
    }
  }, [showOcrBoxes, showDefectBoxes, showComponentBoxes, selectedFrame, componentDetectionMap]);

  useEffect(() => { drawOverlay(); }, [drawOverlay]);

  const drawFullscreenOverlay = useCallback(() => {
    const img    = fullscreenImgRef.current;
    const canvas = fullscreenCanvasRef.current;
    if (!img || !canvas || !isFullscreen) return;

    canvas.width  = img.offsetWidth;
    canvas.height = img.offsetHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showOcrBoxes && !showDefectBoxes && !showComponentBoxes) return;
    if (!img.naturalWidth) return;

    // Compute letterbox offsets for object-contain scaling
    const scaleX  = img.offsetWidth  / img.naturalWidth;
    const scaleY  = img.offsetHeight / img.naturalHeight;
    const scale   = Math.min(scaleX, scaleY);
    const offX    = (img.offsetWidth  - img.naturalWidth  * scale) / 2;
    const offY    = (img.offsetHeight - img.naturalHeight * scale) / 2;

    const drawBox = (bx, by, bw, bh, color, label) => {
      if (bx == null) return;
      const x = bx * scale + offX;
      const y = by * scale + offY;
      const w = bw * scale;
      const h = bh * scale;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2.5; // Slightly thicker for fullscreen view
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle   = color.replace(')', ', 0.12)').replace('rgb', 'rgba');
      ctx.fillRect(x, y, w, h);
      if (label) {
        ctx.font      = 'bold 12px monospace';
        ctx.fillStyle = color;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(x, y > 15 ? y - 15 : y, tw + 4, 14);
        ctx.fillStyle = color;
        ctx.fillText(label, x + 2, y > 15 ? y - 3 : y + 11);
      }
    };

    if (showOcrBoxes) {
      for (const r of selectedFrame?.ocr_results || []) {
        const label = r.is_valid
          ? `Coach ${r.coach_number} (${Math.round(r.confidence * 100)}%)`
          : `? (${Math.round(r.confidence * 100)}%)`;
        drawBox(r.bbox_x, r.bbox_y, r.bbox_w, r.bbox_h, 'rgb(59,130,246)', label);
      }
    }

    if (showComponentBoxes && selectedFrame) {
      const dets = componentDetectionMap[selectedFrame.id] || [];
      for (const d of dets) {
        const label = `${d.component_name ?? d.component_code} ${Math.round(d.confidence * 100)}%`;
        drawBox(d.bbox.x, d.bbox.y, d.bbox.w, d.bbox.h, 'rgb(163,230,53)', label);
      }
    }

    if (showDefectBoxes) {
      for (const d of selectedFrame?.defects || []) {
        const color = d.severity === 'CRITICAL' ? 'rgb(239,68,68)' : 'rgb(245,158,11)';
        drawBox(d.bbox_x, d.bbox_y, d.bbox_w, d.bbox_h, color, d.defect_type);
      }
    }
  }, [showOcrBoxes, showDefectBoxes, showComponentBoxes, selectedFrame, componentDetectionMap, isFullscreen]);

  useEffect(() => {
    if (isFullscreen) {
      const timer = setTimeout(() => {
        drawFullscreenOverlay();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [drawFullscreenOverlay, isFullscreen, selectedFrame]);

  useEffect(() => {
    const handleResize = () => {
      drawOverlay();
      if (isFullscreen) drawFullscreenOverlay();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawOverlay, drawFullscreenOverlay, isFullscreen]);

  // Arrow key frame navigation & fullscreen exit
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore key events if focused on input/textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      const list = (componentMode || ocrMode) ? componentFrames : frames;
      if (!list || list.length === 0 || !selectedFrame) return;

      const currentIndex = list.findIndex((f) => f.id === selectedFrame.id);
      if (currentIndex === -1) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % list.length;
        setSelectedFrame(list[nextIndex]);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + list.length) % list.length;
        setSelectedFrame(list[prevIndex]);
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [componentMode, ocrMode, componentFrames, frames, selectedFrame, isFullscreen]);

  const loadIntelligence = useCallback(async (coachId) => {
    setIntelligenceLoading(true);
    try {
      const data = await getIntelligence(sessionId, coachId);
      setIntelligence(data);
    } catch (_) { setIntelligence(null); }
    finally { setIntelligenceLoading(false); }
  }, [sessionId]);

  const handleSelectNode = async (type, id, metadata) => {
    if (type === 'coach' && metadata?.id) {
      setComponentMode(false);
      setOcrMode(false);
      setShowOcrBoxes(true);
      setShowDefectBoxes(true);
      setShowComponentBoxes(true);
      setComponentFramesLoading(true);
      try {
        const [framesData, intel] = await Promise.all([
          getCoachFrames(sessionId, metadata.id, 300),
          getIntelligence(sessionId, metadata.id),
        ]);
        setIntelligence(intel);

        // Build frame URL → id map from loaded coach frames
        const allCoachFrames = framesData.frames || framesData || [];

        // Build componentDetectionMap so boxes render immediately on coach click
        const detMap = {};
        for (const det of intel.components_detected || []) {
          const frame = allCoachFrames.find(f => f.cloudinary_url === det.frame_url);
          if (frame) {
            if (!detMap[frame.id]) detMap[frame.id] = [];
            detMap[frame.id].push(det);
          }
        }
        setComponentDetectionMap(detMap);

        // Group frames by camera for the multi-track timeline
        const groups = {};
        for (const f of allCoachFrames) {
          const key = f.camera_type ?? 'unknown';
          if (!groups[key]) groups[key] = { cameraType: key, cameraName: f.camera_name ?? key, frames: [] };
          groups[key].frames.push(f);
        }
        setCoachCameraGroups(Object.values(groups));

        // Show the first frame that has detections, or just first frame
        const firstWithDets = allCoachFrames.find(f => detMap[f.id]?.length > 0) || allCoachFrames[0];
        if (firstWithDets) setSelectedFrame(firstWithDets);
      } catch (_) {
        setIntelligence(null);
      } finally {
        setComponentFramesLoading(false);
      }
    }

    if (type === 'ocr' && metadata?.coachId) {
      setComponentMode(false);
      setOcrMode(true);
      setCoachCameraGroups([]);
      setComponentFrames([]);
      setComponentDetectionMap({});
      setSelectedFrame(null);
      setComponentFramesLoading(true);

      try {
        const [framesData, intel] = await Promise.all([
          getCoachFrames(sessionId, metadata.coachId),
          getIntelligence(sessionId, metadata.coachId),
        ]);

        const allFrames = framesData.frames || framesData || [];
        const ocrFrames = allFrames.filter(
          (f) => f.is_ocr_candidate || (f.ocr_results && f.ocr_results.length > 0)
        );

        setComponentFrames(ocrFrames);
        if (ocrFrames.length > 0) setSelectedFrame(ocrFrames[0]);

        setIntelligence(intel);
        setShowOcrBoxes(true);
        setShowDefectBoxes(false);
        setShowComponentBoxes(false);
      } catch (_) {
        setOcrMode(false);
      } finally {
        setComponentFramesLoading(false);
      }
    }

    if (type === 'components' && metadata?.coachId) {
      setComponentMode(true);
      setOcrMode(false);
      setCoachCameraGroups([]);
      setComponentFrames([]);
      setComponentDetectionMap({});
      setSelectedFrame(null);
      setComponentFramesLoading(true);

      try {
        // Load frames for this coach and intelligence in parallel
        const [framesData, intel] = await Promise.all([
          getCoachFrames(sessionId, metadata.coachId),
          getIntelligence(sessionId, metadata.coachId),
        ]);

        // Build frameId → component detections map from intelligence
        const detMap = {};
        for (const det of intel.components_detected || []) {
          // Match detection to frame by frame_url
          const frame = (framesData.frames || framesData || []).find(
            (f) => f.cloudinary_url === det.frame_url
          );
          if (frame) {
            if (!detMap[frame.id]) detMap[frame.id] = [];
            detMap[frame.id].push(det);
          }
        }

        setComponentDetectionMap(detMap);
        const allFrames = framesData.frames || framesData || [];
        setComponentFrames(allFrames);
        // Auto-select first frame that has detections, else first frame
        const firstWithDets = allFrames.find((f) => detMap[f.id]?.length > 0) || allFrames[0];
        if (firstWithDets) setSelectedFrame(firstWithDets);

        setIntelligence(intel);
        setShowComponentBoxes(true);
        setShowDefectBoxes(true);
        setShowOcrBoxes(false);
      } catch (_) {
        setComponentMode(false);
      } finally {
        setComponentFramesLoading(false);
      }
    }
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
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button onClick={() => navigate('/sessions')} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-500 hover:text-slate-900 border border-slate-200 bg-white shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="space-y-0.5 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-wider text-primary/70 leading-none">
            Virtual Train Inspection Portal
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-md font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5 shrink-0">
              <Train className="w-5 h-5 text-primary" />
              {session?.trainNumber || 'Loading...'}
            </h2>
            <Badge className="font-extrabold text-[9px] uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
              {session?.status || '…'}
            </Badge>
            <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-50 border border-slate-200 px-2 py-0.5 rounded shrink-0">
              {sessionId.slice(0, 8)}…
            </span>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 ${connected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {connected ? 'LIVE' : 'POLLING'}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 font-bold font-mono truncate">
            {session?.totalFrames ?? '—'} FRAMES | {session?.totalCoaches ?? '—'} COACHES | {session?.criticalDefects ?? 0} CRITICAL
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 font-sans shrink-0">
        <div className="bg-[#faf9ff] border border-[#c3c6d6]/60 px-3 py-1.5 rounded-sm shadow-sm flex flex-col justify-center shrink-0">
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">HEALTH SCORE</span>
          <span className="text-sm font-black text-[#003d9b] leading-none">
            {session?.healthScore != null ? `${session.healthScore}%` : '—'}
          </span>
        </div>
        <div className="bg-[#faf9ff] border border-[#c3c6d6]/60 px-3 py-1.5 rounded-sm shadow-sm flex flex-col justify-center shrink-0">
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">OCR CONFIDENCE</span>
          <span className="text-sm font-black text-[#003d9b] leading-none">
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
        <Progress value={session?.progressPercent ?? 0} className="h-2 bg-slate-200 w-28 rounded-full" />
        <span className="font-mono text-slate-900">{session?.progressPercent ?? 0}%</span>
      </div>
      <div className="flex gap-1.5 items-center flex-wrap">
        {[
          stageChip(ps.frameExtraction,    'FRAMES',     'FRAMES'),
          stageChip(ps.ocrDetection,       'OCR',        'OCR'),
          stageChip(ps.synchronization,    'SYNC',       'SYNC'),
          stageChip(ps.componentDetection, 'COMPONENTS', 'COMPONENTS'),
          stageChip(ps.defectAnalysis,     'DEFECTS',    'DEFECTS'),
          stageChip(ps.reportGeneration,   'REPORT',     'REPORT'),
        ].map((chip, i, arr) => (
          <React.Fragment key={i}>
            {chip}
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
      <div className="flex-1 flex overflow-hidden min-h-0 relative">

        {/* Left — Hierarchy Tree */}
        <div className={`border-r border-slate-200 shrink-0 flex flex-col h-full bg-white transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'w-0 overflow-hidden opacity-0 border-r-0 p-0' : 'w-80 p-4'}`}>
          <div className="mb-3 flex justify-between items-center">
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Fleet Hierarchy Tree</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Coaches & Camera Feeds</p>
            </div>
            <button 
              onClick={() => setSidebarCollapsed(true)}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title="Collapse Sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
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

        {/* Floating Expand Sidebar Button when collapsed */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="absolute left-0 top-1/2 -translate-y-1/2 bg-white hover:bg-slate-50 border border-l-0 border-slate-200 text-slate-500 hover:text-slate-800 p-1.5 py-3 rounded-r-md shadow-md z-30 transition-all cursor-pointer flex items-center justify-center"
            title="Expand Sidebar"
          >
            <ChevronRight className="w-4.5 h-4.5 animate-pulse" />
          </button>
        )}

        {/* Center — Frame Viewer */}
        <div className="flex-1 flex flex-col min-w-0 p-4 bg-slate-50">
          {/* Controls */}
          <div className="flex flex-wrap justify-between items-center mb-2 shrink-0 gap-y-1.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase">
              {frames.length > 0 ? `${frames.length} frames loaded` : 'No frames loaded'}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {/* Overlay toggles — only useful in single-frame mode */}
              {layoutMode === 'single' && (
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded p-0.5 shadow-sm">
                  <button
                    onClick={() => setShowOcrBoxes(p => !p)}
                    title="Toggle OCR bounding boxes"
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all ${showOcrBoxes ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <ScanSearch className="w-3 h-3" /> OCR
                  </button>
                  <button
                    onClick={() => setShowDefectBoxes(p => !p)}
                    title="Toggle defect bounding boxes"
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all ${showDefectBoxes ? 'bg-red-100 text-red-700 border border-red-300' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <ShieldAlert className="w-3 h-3" /> Defects
                  </button>
                  <button
                    onClick={() => setShowComponentBoxes(p => !p)}
                    title="Toggle component detection boxes"
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all ${showComponentBoxes ? 'bg-lime-100 text-lime-700 border border-lime-300' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <Cpu className="w-3 h-3" /> Components
                  </button>
                </div>
              )}
              <div className="flex items-center bg-white border border-slate-200 rounded p-0.5 shadow-sm">
                <button onClick={() => setLayoutMode('single')} className={`p-1.5 rounded transition-all ${layoutMode === 'single' ? 'bg-slate-100 text-slate-800' : 'text-slate-400'}`} title="Single frame">
                  <Maximize className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setLayoutMode('grid')} className={`p-1.5 rounded transition-all ${layoutMode === 'grid' ? 'bg-slate-100 text-slate-800' : 'text-slate-400'}`} title="Frame grid">
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
              {layoutMode === 'single' && (
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="p-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded shadow-sm text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
                  title="Toggle Fullscreen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded p-1 shadow-sm text-xs font-mono font-bold">
                <button onClick={() => setZoomLevel(p => Math.max(50, p - 10))} className="p-1 hover:bg-slate-50 rounded"><ZoomOut className="w-3.5 h-3.5 text-slate-500" /></button>
                <span className="w-10 text-center">{zoomLevel}%</span>
                <button onClick={() => setZoomLevel(p => Math.min(200, p + 10))} className="p-1 hover:bg-slate-50 rounded"><ZoomIn className="w-3.5 h-3.5 text-slate-500" /></button>
              </div>
            </div>
          </div>

          {/* Component mode banner */}
          {componentMode && (
            <div className="mb-2 shrink-0 flex items-center justify-between px-3 py-1.5 bg-lime-950 border border-lime-800 rounded text-[10px] font-bold text-lime-300">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3 h-3" />
                {componentFramesLoading
                  ? 'Loading component frames…'
                  : `${componentFrames.length} component frames · ${Object.values(componentDetectionMap).flat().length} detections`}
              </span>
              <button
                onClick={() => { setComponentMode(false); setSelectedFrame(frames[0] || null); }}
                className="text-lime-500 hover:text-lime-200 transition-colors"
              >
                ✕ Exit component view
              </button>
            </div>
          )}

          {/* Timeline — above frame viewport */}
          {(() => {
            const showCameraGroups = coachCameraGroups.length > 0 && !componentMode && !ocrMode;
            const showComponentTimeline = componentMode;

            const allTriggerIds = showCameraGroups
              ? [...new Set(coachCameraGroups.flatMap(g => g.frames.map(f => f.trigger_id)))].sort((a, b) => a - b)
              : [];

            const THUMB_W = 72;

            return (
              <div
                className="bg-slate-900 rounded-lg flex flex-col shrink-0 overflow-hidden mb-2"
                style={{ height: showCameraGroups ? `${28 + 16 + Math.min(coachCameraGroups.length, 4) * 68}px` : '88px' }}
              >
                <div className="px-4 py-1.5 flex items-center justify-between bg-slate-950 border-b border-white/10 shrink-0">
                  <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${componentMode ? 'text-lime-400' : showCameraGroups ? 'text-cyan-400' : 'text-slate-400'}`}>
                    {componentMode
                      ? <><Cpu className="w-4 h-4" /> Component Frames</>
                      : showCameraGroups
                        ? <><Camera className="w-4 h-4" /> Camera Tracks</>
                        : <><Activity className="w-4 h-4 text-primary" /> Frame Timeline</>}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">
                    {componentFramesLoading
                      ? 'Loading…'
                      : selectedFrame
                        ? `T:${selectedFrame.trigger_id} · #${selectedFrame.sequence_number ?? '—'}`
                        : 'Click a frame to view'}
                  </span>
                </div>

                {showCameraGroups ? (
                  componentFramesLoading ? (
                    <div className="flex-1 flex items-center justify-center gap-2 text-cyan-700">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span className="text-[10px] font-semibold">Loading coach frames…</span>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-hidden">
                      <div style={{ display: 'grid', gridTemplateColumns: `72px repeat(${allTriggerIds.length}, ${THUMB_W}px)`, width: `${72 + allTriggerIds.length * THUMB_W}px` }}>
                        <div className="h-4 bg-slate-950 border-b border-white/5 flex items-center px-1">
                          <span className="text-[7px] text-slate-600 font-mono uppercase">TRIGGER</span>
                        </div>
                        {allTriggerIds.map((tid) => (
                          <div key={tid} className={`h-4 bg-slate-950 border-b border-white/5 flex items-center justify-center text-[7px] font-mono transition-colors ${selectedFrame?.trigger_id === tid ? 'text-cyan-400 font-bold' : 'text-slate-700'}`}>
                            {tid}
                          </div>
                        ))}
                        {coachCameraGroups.map(({ cameraType, cameraName, frames: camFrames }) => {
                          const triggerMap = Object.fromEntries(camFrames.map(f => [f.trigger_id, f]));
                          const isOcrCam = cameraType === 'ocr';
                          return (
                            <React.Fragment key={cameraType}>
                              <div className="h-16 bg-slate-950/60 border-b border-white/5 border-r border-white/5 flex flex-col items-start justify-center px-2 gap-0.5 shrink-0">
                                <span className={`text-[8px] font-black uppercase tracking-wider truncate max-w-[64px] ${isOcrCam ? 'text-blue-400' : 'text-slate-400'}`}>{cameraType}</span>
                                {cameraName && cameraName !== cameraType && (
                                  <span className="text-[7px] text-slate-600 truncate max-w-[64px]">{cameraName}</span>
                                )}
                              </div>
                              {allTriggerIds.map((tid) => {
                                const f = triggerMap[tid];
                                if (!f) {
                                  return (
                                    <div key={tid} className="h-16 border-b border-white/5 bg-slate-900/50 flex items-center justify-center">
                                      <span className="w-1 h-1 rounded-full bg-white/10" />
                                    </div>
                                  );
                                }
                                const isActive = selectedFrame?.id === f.id;
                                const detCount = componentDetectionMap[f.id]?.length ?? 0;
                                return (
                                  <div key={tid} onClick={() => { setSelectedFrame(f); setLayoutMode('single'); }} className={`h-16 border-b border-white/5 relative cursor-pointer overflow-hidden transition-all ${isActive ? 'ring-2 ring-inset ring-cyan-400' : 'hover:ring-1 hover:ring-inset hover:ring-white/20'}`}>
                                    <img src={f.thumbnail_url || f.cloudinary_url} alt="" className={`w-full h-full object-cover transition-opacity ${isActive ? 'opacity-100' : 'opacity-45 hover:opacity-70'}`} />
                                    {f.is_defect_flagged && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse block" />}
                                    {isOcrCam && <span className="absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-blue-400 block" />}
                                    {detCount > 0 && <span className="absolute bottom-0.5 right-0.5 bg-lime-500 text-black text-[7px] font-black px-1 rounded-full">{detCount}</span>}
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  )
                ) : showComponentTimeline ? (
                  componentFramesLoading ? (
                    <div className="flex-1 flex items-center justify-center gap-2 text-lime-700">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span className="text-[10px] font-semibold">Loading…</span>
                    </div>
                  ) : componentFrames.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center gap-2 text-slate-600">
                      <Inbox className="w-4 h-4" />
                      <span className="text-[10px] font-semibold">No component frames</span>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-hidden flex items-center px-4 gap-1 py-2 bg-slate-900/90">
                      {componentFrames.map((f) => {
                        const isActive = selectedFrame?.id === f.id;
                        const detCount = componentDetectionMap[f.id]?.length ?? 0;
                        return (
                          <div key={f.id} onClick={() => { setSelectedFrame(f); setLayoutMode('single'); }} className={`flex-none w-20 h-14 rounded border relative cursor-pointer overflow-hidden transition-all ${isActive ? 'border-lime-400 ring-2 ring-lime-400/40 scale-105' : 'border-white/10 hover:border-lime-600'}`}>
                            <img src={f.thumbnail_url || f.cloudinary_url} alt="" className={`w-full h-full object-cover transition-opacity ${isActive ? 'opacity-90' : 'opacity-40 hover:opacity-65'}`} />
                            <div className="absolute bottom-0.5 left-0.5 bg-black/70 px-1 rounded text-[7px] font-mono text-white">T:{f.trigger_id}</div>
                            {detCount > 0 && <span className="absolute top-0.5 right-0.5 bg-lime-500 text-black text-[7px] font-black px-1 rounded-full">{detCount}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  frames.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center gap-2 text-slate-600">
                      <Inbox className="w-4 h-4" />
                      <span className="text-[10px] font-semibold">No frames yet</span>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-hidden flex items-center px-4 gap-1 py-2 bg-slate-900/90">
                      {frames.map((f) => {
                        const isActive = selectedFrame?.id === f.id;
                        return (
                          <div key={f.id} onClick={() => { setSelectedFrame(f); setLayoutMode('single'); }} className={`flex-none w-20 h-14 rounded border relative cursor-pointer overflow-hidden transition-all ${isActive ? 'border-primary ring-2 ring-primary/40 scale-105' : 'border-white/10 hover:border-white/30'}`}>
                            <img src={f.thumbnail_url || f.cloudinary_url} alt="" className={`w-full h-full object-cover transition-opacity ${isActive ? 'opacity-90' : 'opacity-40 hover:opacity-65'}`} />
                            <div className="absolute bottom-0.5 left-0.5 bg-black/70 px-1 rounded text-[7px] font-mono text-white">T:{f.trigger_id}</div>
                            {f.is_defect_flagged && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500 block animate-pulse" />}
                            {f.is_ocr_candidate && <span className="absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-blue-500 block" />}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            );
          })()}

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
              <div className="absolute inset-0 flex items-center justify-center p-4" style={{ transform: `scale(${zoomLevel / 100})`, transition: 'transform 0.15s ease-out' }}>
                {selectedFrame ? (
                  <div className="relative max-w-full max-h-full flex items-center justify-center">
                    <img
                      ref={imgRef}
                      src={selectedFrame.cloudinary_url}
                      alt={`Frame ${selectedFrame.sequence_number}`}
                      className="max-w-full max-h-full object-contain rounded border border-slate-800 shadow-2xl block mx-auto"
                      onLoad={drawOverlay}
                    />
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 pointer-events-none rounded"
                    />
                  </div>
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
                {selectedFrame.ocr_results?.filter(r => r.is_valid).map((r, i) => (
                  <p key={i}><span className="text-blue-400">OCR:</span> Coach {r.coach_number} ({(r.confidence * 100).toFixed(0)}%)</p>
                ))}
                {selectedFrame.ocr_results?.some(r => !r.is_valid && r.bbox_x != null) && (
                  <p className="text-slate-500">+ {selectedFrame.ocr_results.filter(r => !r.is_valid && r.bbox_x != null).length} low-conf detection(s)</p>
                )}
                {selectedFrame.defects?.length > 0 && (
                  <p><span className="text-red-400">DEFECTS:</span> {selectedFrame.defects.length} found</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right — Intelligence Panel */}
        <div className="w-72 border-l border-slate-200 p-3 shrink-0 flex flex-col h-full bg-white overflow-y-auto">
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

      {/* Fullscreen Overlay Viewport */}
      {isFullscreen && (
        <div className="fixed inset-0 bg-[#faf9ff] text-[#051a3e] z-[9999] flex flex-col justify-between p-6 select-none animate-in fade-in duration-200 font-sans">
          {/* Top floating control panel */}
          <div className="flex items-center justify-between bg-white border border-[#c3c6d6]/60 rounded-sm p-3 px-4 shadow-sm shrink-0">
            <div className="flex items-center gap-3">
              <span className="bg-[#003d9b]/10 text-[#003d9b] border border-[#003d9b]/20 text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-sm">
                FULLSCREEN
              </span>
              <div>
                <h4 className="text-xs font-black text-[#051a3e] uppercase tracking-wider">
                  {selectedFrame ? `Frame #${selectedFrame.sequence_number}` : 'Loading...'}
                </h4>
                <p className="text-[9px] text-[#737685] font-mono">
                  {selectedFrame ? `TRIGGER_ID: ${selectedFrame.trigger_id}` : '—'}
                </p>
              </div>
            </div>

            {/* Bounding box toggles & Zoom in Fullscreen */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 bg-[#e9edff] border border-[#c3c6d6]/50 rounded-sm p-0.5 shadow-sm">
                <button
                  onClick={() => setShowOcrBoxes(p => !p)}
                  title="Toggle OCR bounding boxes"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-sm text-[10px] font-bold transition-all cursor-pointer ${showOcrBoxes ? 'bg-[#003d9b] text-white' : 'text-[#434654] hover:text-[#051a3e]'}`}
                >
                  <ScanSearch className="w-3.5 h-3.5" /> OCR
                </button>
                <button
                  onClick={() => setShowDefectBoxes(p => !p)}
                  title="Toggle defect bounding boxes"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-sm text-[10px] font-bold transition-all cursor-pointer ${showDefectBoxes ? 'bg-[#ba1a1a] text-white' : 'text-[#434654] hover:text-[#051a3e]'}`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" /> Defects
                </button>
                <button
                  onClick={() => setShowComponentBoxes(p => !p)}
                  title="Toggle component detection boxes"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-sm text-[10px] font-bold transition-all cursor-pointer ${showComponentBoxes ? 'bg-[#004b59] text-white' : 'text-[#434654] hover:text-[#051a3e]'}`}
                >
                  <Cpu className="w-3.5 h-3.5" /> Components
                </button>
              </div>

              <div className="flex items-center gap-1.5 bg-[#e9edff] border border-[#c3c6d6]/50 rounded-sm p-1 shadow-sm text-xs font-mono font-bold text-[#051a3e]">
                <button onClick={() => setZoomLevel(p => Math.max(50, p - 10))} className="p-1 hover:bg-[#d8e2ff] rounded-sm cursor-pointer"><ZoomOut className="w-3.5 h-3.5 text-[#434654]" /></button>
                <span className="w-10 text-center">{zoomLevel}%</span>
                <button onClick={() => setZoomLevel(p => Math.min(200, p + 10))} className="p-1 hover:bg-[#d8e2ff] rounded-sm cursor-pointer"><ZoomIn className="w-3.5 h-3.5 text-[#434654]" /></button>
              </div>
            </div>

            {/* Exit fullscreen button */}
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-1.5 rounded-sm bg-white hover:bg-[#e9edff] text-[#434654] hover:text-[#051a3e] transition-all cursor-pointer border border-[#c3c6d6]/60 shadow-sm"
              title="Exit Fullscreen (Esc)"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Main viewport area with drawers */}
          <div className="flex-1 flex overflow-hidden min-h-0 relative my-4 gap-4">
            
            {/* Fullscreen Left Drawer: Hierarchy Tree */}
            <div 
              style={{ width: fullscreenLeftOpen ? '320px' : '0px', minWidth: fullscreenLeftOpen ? '320px' : '0px' }}
              className="bg-white border border-[#c3c6d6]/60 rounded-sm shrink-0 flex flex-col h-full overflow-hidden transition-all duration-300 ease-in-out shadow-sm z-40"
            >
              <div className="p-4 flex-1 flex flex-col min-h-0">
                <div className="mb-3 flex justify-between items-center shrink-0">
                  <div>
                    <h3 className="text-xs font-black text-[#051a3e] uppercase tracking-wider">Fleet Hierarchy Tree</h3>
                    <p className="text-[10px] text-[#737685] font-bold uppercase">Coaches & Camera Feeds</p>
                  </div>
                  <button 
                    onClick={() => setFullscreenLeftOpen(false)}
                    className="p-1 rounded-sm hover:bg-[#e9edff] text-[#434654] hover:text-[#051a3e] transition-colors cursor-pointer"
                    title="Collapse Hierarchy"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <HierarchyTree
                    onSelectNode={handleSelectNode}
                    coaches={realCoaches}
                    trainNumber={session?.trainNumber}
                    sessionId={sessionId}
                  />
                </div>
              </div>
            </div>

            {/* Left expand handle */}
            {!fullscreenLeftOpen && (
              <button
                onClick={() => setFullscreenLeftOpen(true)}
                className="absolute left-0 top-1/2 -translate-y-1/2 bg-white hover:bg-[#f1f3ff] border border-l-0 border-[#c3c6d6] text-[#003d9b] p-1.5 py-4 rounded-r-md shadow-md z-35 transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5"
                title="Expand Hierarchy"
              >
                <FolderTree className="w-4 h-4" />
                <ChevronRight className="w-3.5 h-3.5 animate-pulse" />
              </button>
            )}

            {/* Center: Scaled Image & Canvas Overlay */}
            <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-slate-950 rounded-lg border border-slate-900 shadow-inner">
              {componentFramesLoading || !selectedFrame ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <RefreshCw className="w-8 h-8 animate-spin text-[#003d9b]" />
                  <span className="text-xs font-bold font-sans">Loading coach data...</span>
                </div>
              ) : (
                <>
                  {/* Step navigation overlay left */}
                  <button
                    onClick={() => {
                      const list = (componentMode || ocrMode) ? componentFrames : frames;
                      const idx = list.findIndex(f => f.id === selectedFrame.id);
                      if (idx !== -1) {
                        const prevIdx = (idx - 1 + list.length) % list.length;
                        setSelectedFrame(list[prevIdx]);
                      }
                    }}
                    className="absolute left-3 w-8 h-8 bg-slate-900/40 hover:bg-slate-900/80 text-white rounded-full border border-slate-800/40 z-30 transition-all cursor-pointer flex items-center justify-center hover:scale-105"
                    title="Previous Frame (ArrowLeft)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="w-full h-full flex items-center justify-center p-8 transition-transform duration-200" style={{ transform: `scale(${zoomLevel / 100})` }}>
                    <div className="relative max-w-full max-h-full">
                      <img
                        ref={fullscreenImgRef}
                        src={selectedFrame.cloudinary_url}
                        alt={`Fullscreen Frame ${selectedFrame.sequence_number}`}
                        className="max-w-full max-h-full object-contain rounded border border-slate-900 shadow-2xl block"
                        onLoad={drawFullscreenOverlay}
                      />
                      <canvas
                        ref={fullscreenCanvasRef}
                        className="absolute inset-0 pointer-events-none rounded"
                      />
                    </div>
                  </div>

                  {/* Step navigation overlay right */}
                  <button
                    onClick={() => {
                      const list = (componentMode || ocrMode) ? componentFrames : frames;
                      const idx = list.findIndex(f => f.id === selectedFrame.id);
                      if (idx !== -1) {
                        const nextIdx = (idx + 1) % list.length;
                        setSelectedFrame(list[nextIdx]);
                      }
                    }}
                    className="absolute right-3 w-8 h-8 bg-slate-900/40 hover:bg-slate-900/80 text-white rounded-full border border-slate-800/40 z-30 transition-all cursor-pointer flex items-center justify-center hover:scale-105"
                    title="Next Frame (ArrowRight)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {/* Right expand handle */}
            {!fullscreenRightOpen && (
              <button
                onClick={() => setFullscreenRightOpen(true)}
                className="absolute right-0 top-1/2 -translate-y-1/2 bg-white hover:bg-[#f1f3ff] border border-r-0 border-[#c3c6d6] text-[#003d9b] p-1.5 py-4 rounded-l-md shadow-md z-35 transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5"
                title="Expand Intelligence"
              >
                <Sparkles className="w-4 h-4" />
                <ChevronLeft className="w-3.5 h-3.5 animate-pulse" />
              </button>
            )}

            {/* Fullscreen Right Drawer: AI Intelligence Feed */}
            <div 
              style={{ width: fullscreenRightOpen ? '384px' : '0px', minWidth: fullscreenRightOpen ? '384px' : '0px' }}
              className="bg-white border border-[#c3c6d6]/60 rounded-sm shrink-0 flex flex-col h-full overflow-hidden transition-all duration-300 ease-in-out shadow-sm z-40"
            >
              <div className="p-4 flex-1 flex flex-col min-h-0 overflow-y-auto">
                <div className="mb-3 flex justify-between items-center shrink-0">
                  <div>
                    <h3 className="text-xs font-black text-[#051a3e] uppercase tracking-wider">AI Intelligence Feed</h3>
                    <p className="text-[10px] text-[#737685] font-bold uppercase">Select a coach from the tree to load</p>
                  </div>
                  <button 
                    onClick={() => setFullscreenRightOpen(false)}
                    className="p-1 rounded-sm hover:bg-[#e9edff] text-[#434654] hover:text-[#051a3e] transition-colors cursor-pointer"
                    title="Collapse Intelligence"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {intelligenceLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                  </div>
                ) : intelligence === null ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#737685]">
                    <Sparkles className="w-8 h-8 text-[#c3c6d6]" />
                    <p className="text-xs font-semibold">No coach selected</p>
                    <p className="text-[10px] text-center">Click a coach in the hierarchy tree to load its inspection results.</p>
                  </div>
                ) : (
                  <div className="space-y-4 text-[#051a3e]">
                    {/* Defects */}
                    <div>
                      <h4 className="text-[10px] font-black text-[#737685] uppercase tracking-wider mb-2 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-[#ba1a1a]" /> Detected Defects ({displayDefects.length})
                      </h4>
                      {displayDefects.length === 0 ? (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-sm text-center text-xs text-emerald-700 font-medium">
                          ✓ No defects found for this coach.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {displayDefects.map((d) => (
                            <div key={d.id} className={`p-3 rounded-sm border text-xs ${d.severity === 'CRITICAL' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-905'}`}>
                              <div className="flex justify-between items-start gap-2 mb-1">
                                <span className={`px-1.5 py-0.5 rounded-sm text-[8px] font-black uppercase ${d.severity === 'CRITICAL' ? 'bg-[#ba1a1a] text-white' : 'bg-amber-600 text-white'}`}>{d.severity}</span>
                                <span className="font-mono text-[9px] text-[#737685]">{d.conf}</span>
                              </div>
                              <p className="font-black text-[#051a3e]">{d.name}</p>
                              {d.notes && <p className="text-[10px] text-[#737685] mt-0.5">{d.notes}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Component checklist */}
                    {displayComponents.length > 0 && (
                      <Card className="border border-[#c3c6d6]/60 shadow-sm bg-white rounded-sm">
                        <CardHeader className="p-3 border-b border-[#c3c6d6]/60 bg-[#f1f3ff]/50">
                          <CardTitle className="text-[10px] font-black tracking-wider uppercase text-[#003d9b] flex items-center gap-1.5">
                            <FileCheck className="w-4 h-4 text-primary" /> Structural Checklist
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3">
                          <table className="w-full text-[10px] font-mono text-left">
                            <thead>
                              <tr className="border-b border-[#c3c6d6]/65 text-[#737685]">
                                <th className="pb-1.5 font-bold uppercase">Component</th>
                                <th className="pb-1.5 font-bold uppercase text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#c3c6d6]/40">
                              {displayComponents.map((c) => (
                                <tr key={c.id} className="hover:bg-[#f1f3ff]/30">
                                  <td className="py-2 font-bold text-[#051a3e]">{c.name}</td>
                                  <td className="py-2 text-right">
                                    <span className={`px-1.5 py-0.5 rounded-sm text-[8px] font-black uppercase ${c.status === 'OK' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200 animate-pulse'}`}>
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

                    {/* Pipeline diagnostics */}
                    {intelligence.ocr_summary && (
                      <Card className="border border-[#c3c6d6]/60 shadow-sm bg-white rounded-sm">
                        <CardHeader className="p-3 border-b border-[#c3c6d6]/60 bg-[#f1f3ff]/50">
                          <CardTitle className="text-[10px] font-black tracking-wider uppercase text-[#051a3e]">Pipeline Diagnostics</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 text-[10px] text-[#737685] font-medium space-y-1">
                          <p><span className="text-primary font-bold">[OCR]</span> {intelligence.ocr_summary}</p>
                          {intelligence.sync_summary && <p><span className="text-primary font-bold">[SYNC]</span> {intelligence.sync_summary}</p>}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom metadata feed info */}
          <div className="text-center font-mono text-[10px] text-[#737685] py-1 shrink-0">
            Use Left/Right arrow keys to step frames · Zoom: scroll/buttons · Press ESC to exit
          </div>
        </div>
      )}
    </div>
  );
};
