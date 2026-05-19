import React, { useState } from 'react';
import { 
  TrendingUp, 
  Cpu, 
  Database, 
  Clock, 
  BarChart3, 
  Activity, 
  AlertOctagon, 
  RefreshCw 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export const Analytics = () => {
  const [timeRange, setTimeRange] = useState('7d');

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">ANALYTICS & METRICS</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time telemetry, model latency distribution, and defect statistics.</p>
        </div>
        <div className="flex items-center bg-slate-100 border border-border rounded p-1 text-xs font-bold">
          <button 
            onClick={() => setTimeRange('24h')}
            className={`px-3 py-1 rounded transition-all ${timeRange === '24h' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            24 Hours
          </button>
          <button 
            onClick={() => setTimeRange('7d')}
            className={`px-3 py-1 rounded transition-all ${timeRange === '7d' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            7 Days
          </button>
          <button 
            onClick={() => setTimeRange('30d')}
            className={`px-3 py-1 rounded transition-all ${timeRange === '30d' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            30 Days
          </button>
        </div>
      </div>

      {/* Analytics KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-blue-100 text-blue-700">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">OCR Precision</div>
            <div className="text-xl font-black text-foreground">98.6%</div>
            <div className="text-[10px] text-emerald-600 font-bold mt-0.5">↑ +0.4% from last week</div>
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-purple-100 text-purple-700">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Avg Latency</div>
            <div className="text-xl font-black text-foreground">11.4 ms</div>
            <div className="text-[10px] text-emerald-600 font-bold mt-0.5">Stable under workload</div>
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-amber-100 text-amber-700">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Sync Stability</div>
            <div className="text-xl font-black text-foreground">99.1%</div>
            <div className="text-[10px] text-slate-500 font-bold mt-0.5">14,221 frames mapped</div>
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-rose-100 text-rose-700">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">False Alarm Rate</div>
            <div className="text-xl font-black text-foreground">0.82%</div>
            <div className="text-[10px] text-emerald-600 font-bold mt-0.5">↓ -0.15% threshold tuning</div>
          </div>
        </div>
      </div>

      {/* SVG Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Defect Distribution */}
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Defect Distribution per Component Group
            </CardTitle>
            <CardDescription className="text-xs">Identified defect patterns segmented by structural groups.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700">Brake Pad Fatigue & Wear</span>
                  <span className="font-mono text-slate-600">42% (128 cases)</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full" style={{ width: '42%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700">Suspension Linkage / Missing Pins</span>
                  <span className="font-mono text-slate-600">28% (85 cases)</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-full rounded-full" style={{ width: '28%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700">Loose Bogie Coupling Bolts</span>
                  <span className="font-mono text-slate-600">18% (55 cases)</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-rose-500 h-full rounded-full" style={{ width: '18%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700">OCR Coach Number Mismatch</span>
                  <span className="font-mono text-slate-600">12% (37 cases)</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: '12%' }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chart 2: Latency Distribution Curve (Pure SVG) */}
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Model Inference Latency Trend (last 24 hours)
            </CardTitle>
            <CardDescription className="text-xs">Average execution speed across YOLO, OCR, and Sync components.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            {/* SVG line graph */}
            <svg viewBox="0 0 500 150" className="w-full h-36">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Grid Lines */}
              <line x1="0" y1="30" x2="500" y2="30" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="0" y1="70" x2="500" y2="70" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="0" y1="110" x2="500" y2="110" stroke="#f1f5f9" strokeWidth="1" />
              
              {/* Curve Area */}
              <path 
                d="M 0 110 C 50 90, 100 130, 150 70 C 200 40, 250 80, 300 50 C 350 20, 400 90, 450 60 L 500 65 L 500 130 L 0 130 Z" 
                fill="url(#chartGrad)"
              />
              {/* Curve Line */}
              <path 
                d="M 0 110 C 50 90, 100 130, 150 70 C 200 40, 250 80, 300 50 C 350 20, 400 90, 450 60 L 500 65" 
                fill="none" 
                stroke="#3b82f6" 
                strokeWidth="2.5"
              />
              
              {/* Data points */}
              <circle cx="150" cy="70" r="4" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.5" />
              <circle cx="300" cy="50" r="4" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.5" />
              <circle cx="450" cy="60" r="4" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.5" />
              
              <text x="140" y="55" fontSize="8" fontWeight="bold" fill="#1e293b" className="font-mono">12.4ms</text>
              <text x="290" y="35" fontSize="8" fontWeight="bold" fill="#1e293b" className="font-mono">10.8ms</text>
              <text x="440" y="45" fontSize="8" fontWeight="bold" fill="#1e293b" className="font-mono">11.1ms</text>
            </svg>
            <div className="flex justify-between w-full text-[10px] font-bold text-muted-foreground mt-2 px-1 font-mono uppercase">
              <span>00:00 (Start)</span>
              <span>08:00 (Peak Shift)</span>
              <span>16:00 (Inbound Shift)</span>
              <span>24:00 (End)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inference Processing Breakdown Table */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight">
            Pipeline Workers Performance Registry
          </CardTitle>
          <CardDescription className="text-xs">Active ML pipelines metrics, weights file references, and device allocations.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-border text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">Model Worker ID</th>
                  <th className="p-3">Framework / Version</th>
                  <th className="p-3">Device Allocation</th>
                  <th className="p-3">Weights / Checkpoint File</th>
                  <th className="p-3 text-center">Batch Size</th>
                  <th className="p-3 text-right">Target FPS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium">
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-primary font-mono">yolov8x-brake-pad</td>
                  <td className="p-3">PyTorch v2.1 (TensorRT)</td>
                  <td className="p-3 font-semibold text-slate-600">CUDA Device 0 (RTX 4090)</td>
                  <td className="p-3 font-mono text-slate-500">weights/brakes_v8_best.engine</td>
                  <td className="p-3 text-center font-mono">8</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-600">240 FPS</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-primary font-mono">yolov8x-suspension</td>
                  <td className="p-3">PyTorch v2.1 (TensorRT)</td>
                  <td className="p-3 font-semibold text-slate-600">CUDA Device 1 (RTX 4090)</td>
                  <td className="p-3 font-mono text-slate-500">weights/susp_v11.engine</td>
                  <td className="p-3 text-center font-mono">8</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-600">240 FPS</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-primary font-mono">paddle-ocr-coach-num</td>
                  <td className="p-3">PaddlePaddle v2.5</td>
                  <td className="p-3 font-semibold text-slate-600">CUDA Device 0 (RTX 4090)</td>
                  <td className="p-3 font-mono text-slate-500">weights/ocr_ch_mobile.tar</td>
                  <td className="p-3 text-center font-mono">16</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-600">120 FPS</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
