import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { KPICard } from '../components/dashboard/KPICard';
import { LiveTrainCard } from '../components/dashboard/LiveTrainCard';
import { DefectPreviewModal } from '../components/dashboard/DefectPreviewModal';
import { RakeVisualization } from '../components/dashboard/RakeVisualization';
import { usePolling } from '../hooks/usePolling';
import { useSessionSocket } from '../hooks/useSessionSocket';
import { toast } from '../hooks/useToast';
import { getDashboardKpis, getLiveQueue, getRecentDefects, getHierarchy, normalizeSession } from '../lib/api';
import DetectionLogTable from '../components/DetectionLogTable';
import { useAuth } from '../contexts/AuthContext';
import { ROLES } from '../lib/roles';
import {
  Train,
  FileCheck,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  Activity,
  Plus,
  Camera,
  ChevronRight,
} from 'lucide-react';

export const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role ?? ROLES.FIELD_STAFF;
  const canSign = role === ROLES.ADMIN || role === ROLES.RDSO_INSPECTOR;
  const { data: kpis,      refresh: refreshKpis }    = usePolling(getDashboardKpis, 10000);
  const { data: queueData, refresh: refreshQueue }   = usePolling(getLiveQueue, 5000);
  const { data: defectsData, refresh: refreshDefects } = usePolling(getRecentDefects, 15000);

  const liveSessions = (queueData?.sessions || []).map(normalizeSession);
  const kv = (key, fallback) => kpis?.[key] ?? fallback;
  const [previewDefect, setPreviewDefect] = useState(null);

  // Rake visualization — fetch hierarchy for the first active (non-completed) session
  const [rakeCoaches, setRakeCoaches]         = useState([]);
  const [rakeSessionId, setRakeSessionId]     = useState(null);

  const activeSession = liveSessions.find(s => s.status === 'PROCESSING')
    || liveSessions.find(s => s.status === 'QUEUED')
    || liveSessions[0];

  const fetchRakeHierarchy = useCallback((sid) => {
    if (!sid) return;
    getHierarchy(sid)
      .then(data => {
        setRakeCoaches(data?.coaches || []);
        setRakeSessionId(sid);
      })
      .catch(() => {});
  }, []);

  // Fetch when active session changes
  useEffect(() => {
    const sid = activeSession?.id;
    if (sid && sid !== rakeSessionId) {
      fetchRakeHierarchy(sid);
    }
    if (!sid) {
      setRakeCoaches([]);
      setRakeSessionId(null);
    }
  }, [activeSession?.id, rakeSessionId, fetchRakeHierarchy]);

  const defectRows = (defectsData?.defects || []).map((d) => {
    const timestamp = d.session_started_at && d.captured_at_ms != null
      ? new Date(new Date(d.session_started_at).getTime() + d.captured_at_ms).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'medium',
        })
      : '—';
    return {
      id: d.id,
      imageId: d.sequence_number != null ? `IMG-${d.sequence_number}` : '—',
      timestamp,
      location: d.station_name || '—',
      trainNo: d.train_number || '—',
      bogieNo: d.coach_number || '—',
      cameraId: d.camera_name || d.camera_type || '—',
      component: '—',
      defect: d.defect_type,
      hasDefect: true,
      severity: d.severity,
      detectionCount: 0,
      sessionId: d.session_id,
      frame: {
        defect_type: d.defect_type,
        severity: d.severity,
        bbox: d.bbox,
        cloudinary_url: d.cloudinary_url,
        thumbnail_url: d.thumbnail_url,
      },
    };
  });

  // Live WS events — immediate refresh on pipeline events
  const { lastEvent, connected } = useSessionSocket(null);
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'session_completed') {
      refreshKpis();
      refreshQueue();
      refreshDefects();
      if (activeSession?.id) fetchRakeHierarchy(activeSession.id);
      toast.success('Train inspection pipeline finished.', 'New Report Ready');
    } else if (lastEvent.type === 'coaches_mapped') {
      refreshQueue();
      if (activeSession?.id) fetchRakeHierarchy(activeSession.id);
    } else if (lastEvent.type === 'session_failed') {
      refreshKpis();
      refreshQueue();
      toast.error('A pipeline session failed.', 'Pipeline Error');
    } else if (lastEvent.type === 'defects_found') {
      refreshDefects();
      if (activeSession?.id) fetchRakeHierarchy(activeSession.id);
      if (lastEvent.critical > 0) {
        toast.warning(`${lastEvent.count} new defect(s), ${lastEvent.critical} critical.`, 'Defect Alert');
      }
    }
  }, [lastEvent, refreshKpis, refreshQueue, refreshDefects, activeSession?.id, fetchRakeHierarchy]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-sans">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">LIVE TRAIN MONITOR</h1>
          <p className="text-sm text-muted-foreground mt-1">Industrial AI pipeline monitoring and queue controller</p>
        </div>
        <div className={`text-xs font-bold text-muted-foreground flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-full shadow-sm`}>
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-amber-400'}`}></div>
          {connected ? 'LIVE ENGINE SYNCED' : 'POLLING MODE'}
        </div>
      </div>

      {/* Quick Actions — task-first shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            show: true,
            primary: true,
            label: 'Start New Inspection',
            sub: 'Upload camera footage',
            icon: <Plus className="w-5 h-5" />,
            onClick: () => navigate('/sessions'),
          },
          {
            show: true,
            label: 'Review Defect Alerts',
            sub: `${kv('critical_defects', 0)} critical`,
            icon: <ShieldAlert className="w-5 h-5 text-destructive" />,
            onClick: () => navigate('/defect-console'),
          },
          {
            show: canSign,
            label: 'Reports to Sign',
            sub: `${kv('unsigned_reports', 0)} awaiting signature`,
            icon: <FileCheck className="w-5 h-5 text-success" />,
            onClick: () => navigate('/reports'),
          },
          {
            show: canSign,
            label: 'Camera Status',
            sub: 'Check cameras online',
            icon: <Camera className="w-5 h-5 text-primary" />,
            onClick: () => navigate('/camera-health'),
          },
        ]
          .filter((a) => a.show)
          .map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={
                a.primary
                  ? 'group flex items-center justify-between gap-3 rounded-lg p-4 text-left bg-primary text-primary-foreground shadow-sm hover:opacity-90 transition'
                  : 'group flex items-center justify-between gap-3 rounded-lg p-4 text-left bg-card border border-border shadow-sm hover:border-primary/40 hover:shadow transition'
              }
            >
              <div className="flex items-center gap-3">
                <span className={a.primary ? 'shrink-0' : 'shrink-0'}>{a.icon}</span>
                <div>
                  <p className="text-sm font-bold leading-tight">{a.label}</p>
                  <p className={`text-xs mt-0.5 ${a.primary ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{a.sub}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 opacity-50 group-hover:translate-x-0.5 transition-transform" />
            </button>
          ))}
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Trains Today"    value={String(kv('sessions_today', '—'))}     icon={<Train className="w-4 h-4 text-primary" />} highlightColor="slate" />
        <KPICard label="Reports Ready"   value={String(kv('completed_sessions', '—'))}  icon={<FileCheck className="w-4 h-4 text-success" />} highlightColor="emerald" />
        <KPICard label="Processing"      value={String(kv('active_sessions', '—'))}     icon={<Loader2 className="w-4 h-4 text-processing animate-spin" />} highlightColor="cyan" />
        <KPICard label="Queued"          value={String(kv('queued_sessions', '—'))}     icon={<Activity className="w-4 h-4 text-muted-foreground" />} highlightColor="slate" />
        <KPICard label="Critical Alerts" value={String(kv('critical_defects', '—'))}   icon={<ShieldAlert className="w-4 h-4 text-destructive" />} highlightColor="red" />
        <KPICard label="Failed Sessions" value={String(kv('failed_sessions', '—'))}    icon={<AlertTriangle className="w-4 h-4 text-warning" />} highlightColor="amber" />
      </div>

      {/* Active Train Rake Visualization */}
      {(activeSession || liveSessions.length > 0) && (
        <div className="bg-card border border-border rounded-lg p-5 shadow-sm space-y-1">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-black text-foreground">ACTIVE TRAIN RAKE</h2>
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">Real-time coach inspection status</p>
            </div>
          </div>
          <RakeVisualization
            session={activeSession || null}
            coaches={activeSession?.id === rakeSessionId ? rakeCoaches : []}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Live Queue */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-foreground">LIVE TRAIN QUEUE</h2>
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">Active event-based capture jobs</p>
            </div>
            <button 
              onClick={() => navigate('/live-queue')}
              className="text-xs font-bold bg-secondary hover:bg-slate-200 px-3 py-1.5 rounded uppercase tracking-wider text-primary border border-border transition-all cursor-pointer"
            >
              Manage Queue
            </button>
          </div>
          
          <div className="space-y-4">
            {liveSessions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm font-medium">
                No active sessions. Upload a video to start an inspection.
              </div>
            ) : (
              liveSessions.map(session => (
                <LiveTrainCard key={session.id} session={session} />
              ))
            )}
          </div>
        </div>

        {/* Right Column: Health & Alerts */}
        <div className="space-y-6">
          {/* <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground uppercase tracking-tight">Pipeline Infrastructure</h2>
            <Card className="border border-border bg-card shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-black tracking-wider uppercase text-muted-foreground flex items-center gap-1.5">
                  <Server className="w-4 h-4" /> Node Telemetry
                </CardTitle>
                <CardDescription className="text-[10px] font-bold">Real-time load balancing of GPU instances</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 font-mono text-xs">
                {/* GPU Inference Workers */}
                {/* <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-bold flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5 text-success" />
                      GPU_INFERENCE_NODES
                    </span>
                    <span className="text-success font-extrabold">8/8 OK</span>
                  </div>
                  <Progress value={100} className="h-1.5 bg-slate-100" />
                </div> */}
                
                {/* Synchronization Engine */}
                {/* <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-bold flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-processing animate-pulse" />
                      SYNC_COACH_ENGINES
                    </span>
                    <span className="text-processing font-extrabold">65% CAP</span>
                  </div>
                  <Progress value={65} className="h-1.5 bg-slate-100" />
                </div> */}
                
                {/* Storage Capacity */}
                {/* <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-bold flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5 text-warning" />
                      STORAGE_POOL_WR
                    </span>
                    <span className="text-warning font-extrabold">82% FULL</span>
                  </div>
                  <Progress value={82} className="h-1.5 bg-slate-100" />
                </div>
              </CardContent>
            </Card> 
          </section> */}

          {/* <section className="space-y-3">
            <h2 className="text-lg font-black text-foreground uppercase tracking-tight">Active Operations Feed</h2>
            <Card className="border border-border bg-card shadow-sm overflow-hidden">
              <CardHeader className="pb-3 border-b border-border bg-slate-50/50">
                <CardTitle className="text-xs font-black tracking-wider uppercase text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Live Events Log
                </CardTitle>
                <CardDescription className="text-[10px] font-bold">Unacknowledged pipeline detections</CardDescription>
              </CardHeader>
              
              <div className="divide-y divide-border">
                
                <div className="p-4 bg-destructive/5 flex gap-3">
                  <ShieldAlert className="w-5 h-5 text-destructive shrink-0" />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black text-destructive-foreground bg-destructive px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide">
                        Critical Defect
                      </p>
                      <span className="text-[10px] font-mono font-bold text-muted-foreground">14m ago</span>
                    </div>
                    <p className="text-xs font-bold text-foreground">Missing Suspension Component</p>
                    <p className="text-[10px] font-mono text-muted-foreground font-bold">Train VB-22804 • Coach C3 • Cam 3</p>
                  </div>
                </div>

                
                <div className="p-4 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black text-warning-foreground bg-warning px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide">
                        Warning
                      </p>
                      <span className="text-[10px] font-mono font-bold text-muted-foreground">22m ago</span>
                    </div>
                    <p className="text-xs font-bold text-foreground">Low Coach Number Confidence (62%)</p>
                    <p className="text-[10px] font-mono text-muted-foreground font-bold">Train VB-22901 • Coach B1 • Camera 4</p>
                  </div>
                </div>
              </div>

              <button className="w-full py-3 text-[10px] font-extrabold text-muted-foreground hover:bg-slate-50 uppercase tracking-widest border-t border-border transition-colors text-center">
                Acknowledge All Alerts
              </button>
            </Card>
          </section> */}
        </div>
      </div>

      {/* Recent Defects Across All Sessions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-foreground">RECENT DEFECTS</h2>
            <p className="text-xs text-muted-foreground font-semibold mt-0.5">Latest flagged anomalies across all inspections</p>
          </div>
          <button
            onClick={() => navigate('/defect-console')}
            className="text-xs font-bold bg-secondary hover:bg-slate-200 px-3 py-1.5 rounded uppercase tracking-wider text-primary border border-border transition-all cursor-pointer"
          >
            View All
          </button>
        </div>
        <div className="h-[420px]">
          <DetectionLogTable
            rows={defectRows}
            onViewFrame={(frame) => setPreviewDefect(frame)}
            onGoToReport={(row) => row.sessionId && navigate(`/reports?session=${row.sessionId}`)}
          />
        </div>
      </div>

      {previewDefect && (
        <DefectPreviewModal defect={previewDefect} onClose={() => setPreviewDefect(null)} />
      )}
    </div>
  );
};
