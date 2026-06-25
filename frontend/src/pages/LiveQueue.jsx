import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLiveQueue } from '../lib/api';
import { useSessionSocket } from '../hooks/useSessionSocket';
import {
  Play,
  Pause,
  Trash2,
  Activity,
  Server,
  Cpu,
  HardDrive,
  Terminal,
  ChevronRight,
  ListVideo,
  Train,
  SlidersHorizontal,
  Inbox
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export const LiveQueue = () => {
  const navigate = useNavigate();

  const [queuedJobs, setQueuedJobs]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState("active");
  const [triggerMode, setTriggerMode]   = useState("MANUAL");
  const [maxConcurrency, setMaxConcurrency] = useState(2);

  // Normalise API queue item → display shape
  const normalizeJob = (s) => {
    const stageMap = {};
    (s.pipeline_stages || []).forEach(ps => { stageMap[ps.stage] = ps.status; });
    const currentStage = (s.pipeline_stages || []).find(ps => ps.status === 'running');
    return {
      id:          s.id,
      sessionCode: s.session_code,
      trainNumber: s.train_number || '—',
      startedAt:   s.started_at,
      status:      s.status,
      progress:    s.progress_pct || 0,
      currentStep: currentStage
        ? currentStage.stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        : s.status === 'extracting' ? 'Frame Extraction' : 'Queued',
      stages: {
        extraction: stageMap['frame_extraction']    || 'pending',
        ocr:        stageMap['ocr_detection']       || 'pending',
        sync:       stageMap['coach_mapping']       || 'pending',
        component:  stageMap['component_detection'] || 'pending',
        defect:     stageMap['defect_analysis']     || 'pending',
        report:     stageMap['report_generation']   || 'pending',
      },
    };
  };

  const loadQueue = useCallback(async () => {
    try {
      const data = await getLiveQueue();
      setQueuedJobs((data.queue || []).map(normalizeJob));
    } catch (_) { /* keep stale data on transient errors */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadQueue();
    const t = setInterval(loadQueue, 5000);
    return () => clearInterval(t);
  }, [loadQueue]);

  // Refresh immediately on any pipeline event
  const { lastEvent } = useSessionSocket(null);
  useEffect(() => {
    if (lastEvent) loadQueue();
  }, [lastEvent, loadQueue]);

  const getStageBadge = (status) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓</Badge>;
      case 'running':
        return <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200 animate-pulse">~</Badge>;
      case 'failed':
        return <Badge className="bg-red-50 text-red-700 border-red-200">✗</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-400 border-slate-200">•</Badge>;
    }
  };

  const activeCount = queuedJobs.filter(j =>
    ['extracting', 'ocr_running', 'processing', 'running'].includes(j.status)
  ).length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-sans">
      {/* Page Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">Live Ingestion Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time control workspace for processing pipelines and sensor trigger streams</p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-border">
          <button
            onClick={() => setActiveTab("active")}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition-all ${activeTab === 'active' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Queue Control
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition-all ${activeTab === 'settings' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Pipeline Settings
          </button>
        </div>
      </div>

      {/* Telemetry Metrics Panel */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border border-border bg-card shadow-sm font-sans">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Active Jobs</p>
              <h3 className="text-2xl font-black mt-1 text-foreground">{activeCount}</h3>
            </div>
            <Activity className="w-8 h-8 text-primary animate-pulse" />
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-sm font-sans">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Queued</p>
              <h3 className="text-2xl font-black mt-1 text-foreground">{queuedJobs.length}</h3>
            </div>
            <ListVideo className="w-8 h-8 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-sm font-sans">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Max Concurrency</p>
              <h3 className="text-2xl font-black mt-1 text-processing">{maxConcurrency} Streams</h3>
            </div>
            <Server className="w-8 h-8 text-processing" />
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-sm font-sans">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Trigger Mode</p>
              <h3 className="text-lg font-black mt-1 text-warning">{triggerMode === 'MANUAL' ? 'Manual' : 'Auto Sensor'}</h3>
            </div>
            <HardDrive className="w-8 h-8 text-warning" />
          </CardContent>
        </Card>
      </div>

      {activeTab === 'active' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Active Job Cards */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-md font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ListVideo className="w-4 h-4 text-primary" /> Current Processing Queue
            </h2>

            {loading ? (
              <div className="p-8 border border-dashed border-border rounded-lg text-center text-muted-foreground text-xs font-semibold">
                Loading queue...
              </div>
            ) : queuedJobs.length === 0 ? (
              <div className="p-12 border border-dashed border-border rounded-lg text-center space-y-2">
                <Inbox className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-xs font-semibold text-muted-foreground">No active or queued inspection sessions.</p>
                <p className="text-[10px] text-muted-foreground">Upload a video from the Sessions page to start a pipeline.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {queuedJobs.map(job => (
                  <Card key={job.id} className="border border-border bg-card shadow-sm font-sans">
                    <CardHeader className="pb-2 border-b border-border bg-slate-50/40">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Train className="w-4 h-4 text-primary" />
                          <span className="text-xs font-black text-foreground">{job.trainNumber}</span>
                          <span className="text-[9px] font-mono text-muted-foreground font-semibold">
                            {job.sessionCode}
                          </span>
                          <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[9px] font-black uppercase">
                            {job.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/train/${job.id}`)}
                            className="flex items-center gap-0.5 text-[10px] text-primary hover:underline font-extrabold px-1"
                          >
                            Workspace <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-4 space-y-4">
                      {/* Stage mini-timeline */}
                      <div className="flex justify-between items-center text-[8px] font-bold text-slate-500 uppercase">
                        <div className="flex flex-col items-center gap-1">
                          <span>Frame Extract</span>
                          {getStageBadge(job.stages.extraction)}
                        </div>
                        <div className="h-0.5 w-4 bg-border" />
                        <div className="flex flex-col items-center gap-1">
                          <span>Coach #</span>
                          {getStageBadge(job.stages.ocr)}
                        </div>
                        <div className="h-0.5 w-4 bg-border" />
                        <div className="flex flex-col items-center gap-1">
                          <span>Synchronize</span>
                          {getStageBadge(job.stages.sync)}
                        </div>
                        <div className="h-0.5 w-4 bg-border" />
                        <div className="flex flex-col items-center gap-1">
                          <span>Components</span>
                          {getStageBadge(job.stages.component)}
                        </div>
                        <div className="h-0.5 w-4 bg-border" />
                        <div className="flex flex-col items-center gap-1">
                          <span>Defects</span>
                          {getStageBadge(job.stages.defect)}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-1.5 font-mono text-[10px]">
                        <div className="flex justify-between font-bold">
                          <span className="text-primary uppercase flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-primary animate-pulse" /> {job.currentStep}
                          </span>
                          <span className="text-slate-600">{job.progress}%</span>
                        </div>
                        <Progress value={job.progress} className="h-2" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Console — static; no mock log simulation */}
          {/* <div className="space-y-4">
            <h2 className="text-md font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-primary" /> Live Console Stream
            </h2>

            <Card className="border border-border bg-slate-950 text-slate-400 font-mono text-[9px] p-4 h-96 flex items-center justify-center shadow-lg">
              <div className="text-center space-y-2">
                <Terminal className="w-6 h-6 text-slate-600 mx-auto" />
                <p className="text-slate-500">WebSocket log stream not connected.</p>
                <p className="text-slate-600 text-[8px]">Backend event streaming to be wired in next sprint.</p>
              </div>
            </Card>
          </div> */}

        </div>
      ) : (
        /* Settings panel — UI-only controls, no backend wiring yet */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-sans">

          <Card className="border border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-black text-foreground uppercase tracking-tight">Queue Controller Settings</CardTitle>
              <CardDescription className="text-xs">Adjust parallel pipelines and trigger sensor parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase">Trigger Capture Source</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTriggerMode("AUTO_EVENT")}
                    className={`py-2 px-3 border rounded text-xs font-bold uppercase transition-all ${triggerMode === 'AUTO_EVENT' ? 'bg-primary text-white border-primary shadow' : 'bg-white hover:bg-slate-50'}`}
                  >
                    Auto Sensor Event
                  </button>
                  <button
                    onClick={() => setTriggerMode("MANUAL")}
                    className={`py-2 px-3 border rounded text-xs font-bold uppercase transition-all ${triggerMode === 'MANUAL' ? 'bg-primary text-white border-primary shadow' : 'bg-white hover:bg-slate-50'}`}
                  >
                    Manual File Upload
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Auto Sensor Event monitors hardware wheel sensors for train arrival triggers automatically.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span className="uppercase">Max Concurrent Session Pipelines</span>
                  <span>{maxConcurrency} Streams</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="4"
                  value={maxConcurrency}
                  onChange={(e) => setMaxConcurrency(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <p className="text-[10px] text-muted-foreground">
                  Limits concurrent GPU inference workloads to balance latency and throughput.
                </p>
              </div>

            </CardContent>
          </Card>

          <Card className="border border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-black text-foreground uppercase tracking-tight">Hardware Sensor Registers</CardTitle>
              <CardDescription className="text-xs">Physical trigger pins mapping list</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs font-mono">
              <div className="divide-y divide-border">
                <div className="py-2 flex justify-between">
                  <span className="font-bold text-slate-700">TRG_PIN_01 (Coach Number Camera Right)</span>
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">ACTIVE</Badge>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="font-bold text-slate-700">TRG_PIN_02 (Bogie Assembly Left)</span>
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">ACTIVE</Badge>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="font-bold text-slate-700">TRG_PIN_03 (Bogie Assembly Right)</span>
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">ACTIVE</Badge>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="font-bold text-slate-700">TRG_PIN_04 (Wheel Sensor Gate A)</span>
                  <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200">STANDBY</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      )}

    </div>
  );
};
