import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Play, 
  Pause, 
  Trash2, 
  Sliders, 
  Activity, 
  Server, 
  Cpu, 
  HardDrive, 
  Clock, 
  Terminal, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUp, 
  ArrowDown, 
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  ListVideo,
  Train
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export const LiveQueue = () => {
  const navigate = useNavigate();

  // Mock initial queue state
  const [queuedJobs, setQueuedJobs] = useState([
    {
      id: "INS-2026-0045",
      trainNumber: "VB-22901",
      startedAt: "2026-05-20T08:41:00Z",
      status: "PROCESSING",
      progress: 72,
      coaches: 14,
      defects: 2,
      ocrConfidence: 96,
      currentStep: "Synchronization & Coach Mapping",
      priority: "HIGH",
      stages: {
        extraction: "COMPLETED",
        ocr: "COMPLETED",
        sync: "RUNNING",
        component: "PENDING",
        defect: "PENDING",
        report: "PENDING"
      }
    },
    {
      id: "INS-2026-0048",
      trainNumber: "NDLS-1202",
      startedAt: "2026-05-20T08:52:15Z",
      status: "PROCESSING",
      progress: 25,
      coaches: 18,
      defects: 0,
      ocrConfidence: 92,
      currentStep: "OCR OCR Detection",
      priority: "NORMAL",
      stages: {
        extraction: "COMPLETED",
        ocr: "RUNNING",
        sync: "PENDING",
        component: "PENDING",
        defect: "PENDING",
        report: "PENDING"
      }
    },
    {
      id: "INS-2026-0049",
      trainNumber: "VB-22902",
      startedAt: null,
      status: "QUEUED",
      progress: 0,
      coaches: 16,
      defects: 0,
      ocrConfidence: 0,
      currentStep: "Queued in Line",
      priority: "LOW",
      stages: {
        extraction: "PENDING",
        ocr: "PENDING",
        sync: "PENDING",
        component: "PENDING",
        defect: "PENDING",
        report: "PENDING"
      }
    }
  ]);

  // Operational toggles
  const [triggerMode, setTriggerMode] = useState("AUTO_EVENT"); // AUTO_EVENT vs MANUAL
  const [maxConcurrency, setMaxConcurrency] = useState(2);
  const [activeTab, setActiveTab] = useState("active"); // active vs settings
  const [terminalLogs, setTerminalLogs] = useState([
    "[SYSTEM] Ingestion listener initialized on Port 5002.",
    "[SYSTEM] Trigger sensor VB_TRG_09 configured to AUTO mode.",
    "[INS-2026-0045] Frame extraction complete: 14,221 frames saved.",
    "[INS-2026-0045] Running coach identification via OCR...",
    "[INS-2026-0045] OCR anchor mapping: Coach B1-B7 validated.",
    "[INS-2026-0048] Sensor trigger activated: NDLS-1202 arrival detected.",
    "[INS-2026-0048] Streaming multi-cam inputs (CAM_L, CAM_R, CAM_OCR) to buffer.",
    "[INS-2026-0045] Initializing synchronized coach mapping..."
  ]);

  // Simulate pipeline running
  useEffect(() => {
    const timer = setInterval(() => {
      setQueuedJobs(prevJobs => {
        return prevJobs.map(job => {
          if (job.status === "PROCESSING") {
            const nextProgress = Math.min(job.progress + 4, 100);
            let nextStep = job.currentStep;
            const nextStages = { ...job.stages };

            if (nextProgress >= 100) {
              return {
                ...job,
                status: "COMPLETED",
                progress: 100,
                currentStep: "Report Generation Complete",
                stages: {
                  extraction: "COMPLETED",
                  ocr: "COMPLETED",
                  sync: "COMPLETED",
                  component: "COMPLETED",
                  defect: "COMPLETED",
                  report: "COMPLETED"
                }
              };
            }

            // Move stages based on progress
            if (nextProgress > 80) {
              nextStep = "AI Defect Correlation Analysis";
              nextStages.defect = "RUNNING";
              nextStages.component = "COMPLETED";
            } else if (nextProgress > 50) {
              nextStep = "Brake & Suspension Component Detection";
              nextStages.component = "RUNNING";
              nextStages.sync = "COMPLETED";
            } else if (nextProgress > 30) {
              nextStep = "Synchronizing Coach Sequences";
              nextStages.sync = "RUNNING";
              nextStages.ocr = "COMPLETED";
            }

            return {
              ...job,
              progress: nextProgress,
              currentStep: nextStep,
              stages: nextStages
            };
          }
          return job;
        });
      });

      // Stream terminal logs occasionally
      const newLogPool = [
        `[INFERENCE] Analyzing wheels stress index on Coach B${Math.floor(Math.random() * 6) + 1}...`,
        "[SYSTEM] Disk write speed: 412 MB/s | Network intake: 1.2 GB/s",
        "[PIPELINE] Frame grouping verified: Gaps match separation thresholds.",
        "[DATABASE] Uploading frame analytics metadata chunk...",
        "[ML-WORKER] GPU temperature nominal: 68C"
      ];
      const randomLog = newLogPool[Math.floor(Math.random() * newLogPool.length)];
      setTerminalLogs(prev => [...prev.slice(-15), `[${new Date().toLocaleTimeString()}] ${randomLog}`]);

    }, 3000);

    return () => clearInterval(timer);
  }, []);

  const handlePriorityToggle = (id) => {
    setQueuedJobs(prev => prev.map(job => {
      if (job.id === id) {
        const nextPriority = job.priority === "HIGH" ? "NORMAL" : job.priority === "NORMAL" ? "LOW" : "HIGH";
        return { ...job, priority: nextPriority };
      }
      return job;
    }));
  };

  const handlePauseResume = (id) => {
    setQueuedJobs(prev => prev.map(job => {
      if (job.id === id) {
        return { ...job, status: job.status === "PROCESSING" ? "PAUSED" : "PROCESSING" };
      }
      return job;
    }));
  };

  const handleRemove = (id) => {
    setQueuedJobs(prev => prev.filter(job => job.id !== id));
  };

  const getStageBadge = (status) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓</Badge>;
      case 'RUNNING':
        return <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200 animate-pulse">~</Badge>;
      case 'PENDING':
      default:
        return <Badge className="bg-slate-100 text-slate-400 border-slate-200">•</Badge>;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-sans">
      {/* Page Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">Live Ingestion Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time control workspace for processing pipelines and sensor trigger streams</p>
        </div>

        {/* Toggles */}
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
              <h3 className="text-2xl font-black mt-1 text-foreground">
                {queuedJobs.filter(j => j.status === 'PROCESSING').length}
              </h3>
            </div>
            <Activity className="w-8 h-8 text-primary animate-pulse" />
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-sm font-sans">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">GPU Core Load</p>
              <h3 className="text-2xl font-black mt-1 text-success">87.4%</h3>
            </div>
            <Cpu className="w-8 h-8 text-success" />
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-sm font-sans">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Memory Pool</p>
              <h3 className="text-2xl font-black mt-1 text-processing">14.2 / 16 GB</h3>
            </div>
            <Server className="w-8 h-8 text-processing" />
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-sm font-sans">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Ingestion Inflow</p>
              <h3 className="text-2xl font-black mt-1 text-warning">824 MB/s</h3>
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

            {queuedJobs.length === 0 ? (
              <div className="p-8 border border-dashed border-border rounded-lg text-center text-muted-foreground text-xs font-semibold">
                No active or queued inspection sessions in pipeline.
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
                          <span className="text-[9px] font-mono text-muted-foreground font-semibold">({job.id})</span>
                          <Badge className={
                            job.priority === 'HIGH' ? 'bg-red-50 text-red-700 border-red-200' :
                            job.priority === 'NORMAL' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-slate-100 text-slate-500'
                          }>
                            {job.priority} PRIORITY
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handlePauseResume(job.id)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-600"
                            title={job.status === 'PROCESSING' ? 'Pause Pipeline' : 'Resume Pipeline'}
                          >
                            {job.status === 'PROCESSING' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handlePriorityToggle(job.id)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-600"
                            title="Change Priority"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemove(job.id)}
                            className="p-1 hover:bg-slate-100 rounded text-red-600"
                            title="Cancel Job"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="pt-4 space-y-4">
                      {/* Step-by-Step Mini timeline */}
                      <div className="flex justify-between items-center text-[8px] font-bold text-slate-500 uppercase">
                        <div className="flex flex-col items-center gap-1">
                          <span>Frame Extract</span>
                          {getStageBadge(job.stages.extraction)}
                        </div>
                        <div className="h-0.5 w-4 bg-border" />
                        <div className="flex flex-col items-center gap-1">
                          <span>OCR Map</span>
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

                      {/* Progress Bar & Status Text */}
                      <div className="space-y-1.5 font-mono text-[10px]">
                        <div className="flex justify-between font-bold">
                          <span className="text-primary uppercase flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-primary animate-pulse" /> {job.currentStep}
                          </span>
                          <span className="text-slate-600">{job.progress}%</span>
                        </div>
                        <Progress value={job.progress} className="h-2" />
                      </div>

                      {/* Telemetry info */}
                      <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 font-sans uppercase">
                        <span>Coaches identified: {job.coaches}</span>
                        {job.defects > 0 && <span className="text-red-600 animate-pulse">Critical defects: {job.defects}</span>}
                        <span>OCR match: {job.ocrConfidence}%</span>
                        
                        <button
                          onClick={() => navigate(`/train/${job.id}`)}
                          className="flex items-center gap-0.5 text-primary hover:underline font-extrabold"
                        >
                          Workspace <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Real-time Ingestion Logs Console */}
          <div className="space-y-4">
            <h2 className="text-md font-black text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-primary" /> Live Console Stream
            </h2>

            <Card className="border border-border bg-slate-950 text-slate-250 font-mono text-[9px] p-4 h-96 overflow-y-auto leading-relaxed shadow-lg">
              <div className="space-y-1">
                {terminalLogs.map((log, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="text-slate-500 font-bold">▶</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

        </div>
      ) : (
        /* Settings panel */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-sans">
          
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-black text-foreground uppercase tracking-tight">Queue Controller Settings</CardTitle>
              <CardDescription className="text-xs">Adjust parallel pipelines and trigger sensors parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Trigger mode toggle */}
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

              {/* Concurrency slider */}
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
                  <span className="font-bold text-slate-700">TRG_PIN_01 (OCR Camera Right)</span>
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-250">ACTIVE</Badge>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="font-bold text-slate-700">TRG_PIN_02 (Bogie Assembly Left)</span>
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-250">ACTIVE</Badge>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="font-bold text-slate-700">TRG_PIN_03 (Bogie Assembly Right)</span>
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-250">ACTIVE</Badge>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="font-bold text-slate-700">TRG_PIN_04 (Wheel Sensor Gate A)</span>
                  <Badge className="bg-yellow-50 text-yellow-700 border-yellow-250">STANDBY</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      )}

    </div>
  );
};
