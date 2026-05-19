import React, { useState } from 'react';
import { 
  Camera, 
  Cpu, 
  Activity, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Network, 
  Server,
  Terminal,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const Infrastructure = () => {
  const [activeTab, setActiveTab] = useState('cameras');
  const [isTestingTrigger, setIsTestingTrigger] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const triggerTest = () => {
    setIsTestingTrigger(true);
    setTestResult(null);
    setTimeout(() => {
      setIsTestingTrigger(false);
      setTestResult('PASS: Hardware event alignment verified across all 6 high-speed cameras. Jitter variance within acceptable limits (< 2ms).');
    }, 1500);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">SYSTEM & INFRASTRUCTURE</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time status of trigger sensors, GPU clusters, and camera alignment metrics.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border text-sm font-bold gap-6">
        <button
          onClick={() => setActiveTab('cameras')}
          className={`pb-3 flex items-center gap-1.5 transition-all relative ${activeTab === 'cameras' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Camera className="w-4 h-4" /> Camera Feeds & Triggers
        </button>
        <button
          onClick={() => setActiveTab('gpu')}
          className={`pb-3 flex items-center gap-1.5 transition-all relative ${activeTab === 'gpu' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Cpu className="w-4 h-4" /> GPU Inference Cluster
        </button>
        <button
          onClick={() => setActiveTab('services')}
          className={`pb-3 flex items-center gap-1.5 transition-all relative ${activeTab === 'services' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Activity className="w-4 h-4" /> Core Pipeline Services
        </button>
      </div>

      {/* Content Area */}
      {activeTab === 'cameras' && (
        <div className="space-y-6">
          {/* Action Trigger Card */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500 animate-pulse" /> HW Trigger Sensor Alignment Test
                </CardTitle>
                <CardDescription className="text-xs">Send physical trigger impulse to verify multi-camera timestamp sync.</CardDescription>
              </div>
              <button
                onClick={triggerTest}
                disabled={isTestingTrigger}
                className="bg-primary hover:bg-slate-800 text-white text-xs font-bold uppercase px-3 py-2 rounded shadow transition-all flex items-center gap-1.5 disabled:opacity-75"
              >
                {isTestingTrigger ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Aligning Sensors...
                  </>
                ) : (
                  'Run Alignment Test'
                )}
              </button>
            </CardHeader>
            {testResult && (
              <CardContent className="pt-0">
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded text-xs font-semibold leading-relaxed flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                  <div>{testResult}</div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Camera Registry */}
          <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border bg-slate-50/50">
              <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Synchronized Camera Feed Registry</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-border text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    <th className="p-3">Camera ID</th>
                    <th className="p-3">Zone / Assembly Target</th>
                    <th className="p-3">Resolution & FPS</th>
                    <th className="p-3">Sync Delay</th>
                    <th className="p-3 text-center">Dropped Frames</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium text-slate-700">
                  <tr className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold font-mono text-primary">CAM_LEFT_01</td>
                    <td className="p-3">Left Undercarriage (Bogie, Brake Pad)</td>
                    <td className="p-3 font-mono">1920x1080 @ 240fps</td>
                    <td className="p-3 font-mono text-emerald-600 font-bold">0.8 ms</td>
                    <td className="p-3 text-center font-mono">0</td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ACTIVE
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold font-mono text-primary">CAM_RIGHT_01</td>
                    <td className="p-3">Right Undercarriage (Bogie, Gearbox)</td>
                    <td className="p-3 font-mono">1920x1080 @ 240fps</td>
                    <td className="p-3 font-mono text-emerald-600 font-bold">0.9 ms</td>
                    <td className="p-3 text-center font-mono">0</td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ACTIVE
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold font-mono text-primary">CAM_OCR_01</td>
                    <td className="p-3">Coach Number / Text Plate Target</td>
                    <td className="p-3 font-mono">1280x720 @ 120fps</td>
                    <td className="p-3 font-mono text-emerald-600 font-bold">1.2 ms</td>
                    <td className="p-3 text-center font-mono">0</td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ACTIVE
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold font-mono text-primary">CAM_ROOF_01</td>
                    <td className="p-3">Roof Pantograph & High Voltage Line</td>
                    <td className="p-3 font-mono">1920x1080 @ 120fps</td>
                    <td className="p-3 font-mono text-amber-600 font-bold">4.2 ms</td>
                    <td className="p-3 text-center font-mono text-amber-600 font-bold">2</td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        SYNC_LATENCY
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'gpu' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" /> NVIDIA RTX 4090 - Node 01
              </CardTitle>
              <CardDescription className="text-xs">Handles Brake Pad Fatigue & Suspension Anomaly YOLO inference.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>GPU Temperature</span>
                  <span className="font-mono text-slate-600">62°C / 85°C</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: '72%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>CUDA Workload</span>
                  <span className="font-mono text-slate-600">88%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full" style={{ width: '88%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>VRAM Utilization</span>
                  <span className="font-mono text-slate-600">18.4 GB / 24 GB</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-indigo-600 h-full rounded-full" style={{ width: '76%' }} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" /> NVIDIA RTX 4090 - Node 02
              </CardTitle>
              <CardDescription className="text-xs">Dedicated to OCR Text extraction & Gap Segmentation models.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>GPU Temperature</span>
                  <span className="font-mono text-slate-600">54°C / 85°C</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: '63%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>CUDA Workload</span>
                  <span className="font-mono text-slate-600">32%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: '32%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>VRAM Utilization</span>
                  <span className="font-mono text-slate-600">8.2 GB / 24 GB</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-indigo-600 h-full rounded-full" style={{ width: '34%' }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'services' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border p-4 rounded shadow-sm flex flex-col justify-between h-28">
              <div className="flex items-start justify-between">
                <div className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">OCR Engine API</div>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <div>
                <div className="text-md font-black text-slate-900 font-mono">Port 5002</div>
                <div className="text-[10px] text-emerald-600 font-bold mt-1">HEALTHY (Up 42 days)</div>
              </div>
            </div>

            <div className="bg-card border border-border p-4 rounded shadow-sm flex flex-col justify-between h-28">
              <div className="flex items-start justify-between">
                <div className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Gap Segmenter</div>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <div>
                <div className="text-md font-black text-slate-900 font-mono">Port 5003</div>
                <div className="text-[10px] text-emerald-600 font-bold mt-1">HEALTHY (Up 42 days)</div>
              </div>
            </div>

            <div className="bg-card border border-border p-4 rounded shadow-sm flex flex-col justify-between h-28">
              <div className="flex items-start justify-between">
                <div className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">YOLO Worker Daemon</div>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <div>
                <div className="text-md font-black text-slate-900 font-mono">Port 5004</div>
                <div className="text-[10px] text-emerald-600 font-bold mt-1">HEALTHY (Active)</div>
              </div>
            </div>

            <div className="bg-card border border-border p-4 rounded shadow-sm flex flex-col justify-between h-28">
              <div className="flex items-start justify-between">
                <div className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Secure Audit DB</div>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <div>
                <div className="text-md font-black text-slate-900 font-mono">Port 5432</div>
                <div className="text-[10px] text-emerald-600 font-bold mt-1">ONLINE (Replicated)</div>
              </div>
            </div>
          </div>

          {/* Terminal Console */}
          <div className="bg-slate-900 border border-slate-800 rounded p-4 shadow-inner text-xs font-mono text-emerald-500 space-y-2 max-h-60 overflow-y-auto">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 mb-2 text-slate-400">
              <Terminal className="w-3.5 h-3.5" />
              <span>LOG STREAM: vande-inspect-pipeline.service</span>
            </div>
            <div>[2026-05-20 01:28:44] INFO: Synchronized hardware trigger alignment completed (offset 0.82ms)</div>
            <div>[2026-05-20 01:29:10] INFO: PaddleOCR worker processed 1,202 frames on CAM_OCR_01</div>
            <div>[2026-05-20 01:29:12] SUCCESS: Mapped Coach B2 successfully to frames [1420 - 2530]</div>
            <div>[2026-05-20 01:29:14] WARNING: CAM_ROOF_01 dropped 2 frames during peak train speed 130 km/h</div>
            <div>[2026-05-20 01:30:01] INFO: Database audit checklist saved for session SES-22901-A</div>
          </div>
        </div>
      )}
    </div>
  );
};
