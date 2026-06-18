import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Cpu,
  Database,
  Clock,
  BarChart3,
  Activity,
  AlertOctagon,
  RefreshCw,
  Inbox
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getDashboardKpis } from '../lib/api';

export const Analytics = () => {
  const [timeRange, setTimeRange] = useState('7d');
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardKpis()
      .then(setKpis)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmt = (v, suffix = '') => (v == null ? '—' : `${v}${suffix}`);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">DEFECT ANALYTICS</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time telemetry, model latency distribution, and defect statistics.</p>
        </div>
        <div className="flex items-center bg-slate-100 border border-border rounded p-1 text-xs font-bold">
          {['24h', '7d', '30d'].map(r => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1 rounded transition-all ${timeRange === r ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground'}`}
            >
              {r === '24h' ? '24 Hours' : r === '7d' ? '7 Days' : '30 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip — real data from /api/dashboard/kpis */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-blue-100 text-blue-700">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Total Sessions</div>
            <div className="text-xl font-black text-foreground">
              {loading ? '—' : fmt(kpis?.total_sessions)}
            </div>
            <div className="text-[10px] text-slate-500 font-bold mt-0.5">All time</div>
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-purple-100 text-purple-700">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Sessions Today</div>
            <div className="text-xl font-black text-foreground">
              {loading ? '—' : fmt(kpis?.sessions_today)}
            </div>
            <div className="text-[10px] text-slate-500 font-bold mt-0.5">Since midnight</div>
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-rose-100 text-rose-700">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Critical Defects</div>
            <div className="text-xl font-black text-foreground">
              {loading ? '—' : fmt(kpis?.critical_defects)}
            </div>
            <div className="text-[10px] text-slate-500 font-bold mt-0.5">Cumulative</div>
          </div>
        </div>

        <div className="bg-card border border-border p-4 rounded shadow-sm flex items-center gap-4">
          <div className="p-3 rounded bg-amber-100 text-amber-700">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Avg Health Score</div>
            <div className="text-xl font-black text-foreground">
              {loading ? '—' : kpis?.avg_health_score != null ? `${kpis.avg_health_score}%` : '—'}
            </div>
            <div className="text-[10px] text-slate-500 font-bold mt-0.5">Across all sessions</div>
          </div>
        </div>
      </div>

      {/* Charts area — empty state until historical data API exists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Defect Distribution per Component Group
            </CardTitle>
            <CardDescription className="text-xs">Identified defect patterns segmented by structural groups.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Inbox className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-semibold">No defect data yet.</p>
              <p className="text-[10px]">Populates after inspection sessions complete processing.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Model Inference Latency Trend
            </CardTitle>
            <CardDescription className="text-xs">Average execution speed across YOLO, OCR, and Sync components.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Inbox className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-semibold">No latency data yet.</p>
              <p className="text-[10px]">Time-series metrics will appear after the first pipeline runs.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Model registry — static config documentation */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight">
            Pipeline Workers — Model Registry
          </CardTitle>
          <CardDescription className="text-xs">Deployed ML worker configuration and device allocations.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-border text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">Worker</th>
                  <th className="p-3">Framework</th>
                  <th className="p-3">Device</th>
                  <th className="p-3">Weights File</th>
                  <th className="p-3 text-right">Port</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium">
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-primary font-mono">yolo-defect</td>
                  <td className="p-3">PyTorch + Ultralytics YOLO</td>
                  <td className="p-3 font-semibold text-slate-600">CUDA 0 (RTX series)</td>
                  <td className="p-3 font-mono text-slate-500">GPU/yolo/models/best.pt</td>
                  <td className="p-3 text-right font-mono font-bold">5002</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-primary font-mono">yolo-ocr-roi</td>
                  <td className="p-3">PyTorch + Ultralytics YOLO</td>
                  <td className="p-3 font-semibold text-slate-600">CUDA 0 (RTX series)</td>
                  <td className="p-3 font-mono text-slate-500">GPU/yolo/models/train_num_detector.pt</td>
                  <td className="p-3 text-right font-mono font-bold">5002</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-primary font-mono">paddle-ocr</td>
                  <td className="p-3">PaddlePaddle 2.6 (GPU)</td>
                  <td className="p-3 font-semibold text-slate-600">CUDA 0 (RTX series)</td>
                  <td className="p-3 font-mono text-slate-500">GPU/ocr/models/ (auto-download)</td>
                  <td className="p-3 text-right font-mono font-bold">5000</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
