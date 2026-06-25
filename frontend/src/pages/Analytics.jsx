import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  TrendingUp,
  Database,
  BarChart3,
  Activity,
  AlertOctagon,
  Inbox,
  Download,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  getDashboardKpis,
  getDefectsOverTime,
  getDefectsByType,
  getDefectsByCoachClass,
  getInferenceLatency,
} from '../lib/api';
import { exportToCSV, exportToJSON, exportToXLSX } from '../lib/export';

const CHART_COLOR = '#1d4ed8';

function ChartCard({ icon: Icon, title, description, data, children, emptyLabel }) {
  return (
    <Card className="border border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" /> {title}
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <Inbox className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-semibold">{emptyLabel || 'No data yet.'}</p>
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              {children}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const Analytics = () => {
  const [timeRange, setTimeRange] = useState('7d');
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);

  const [overTime, setOverTime] = useState([]);
  const [byType, setByType] = useState([]);
  const [byCoachClass, setByCoachClass] = useState([]);
  const [latency, setLatency] = useState([]);

  useEffect(() => {
    getDashboardKpis().then(setKpis).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getDefectsOverTime(timeRange).then((d) => setOverTime(d.series || [])).catch(() => setOverTime([]));
    getDefectsByType(timeRange).then((d) => setByType(d.series || [])).catch(() => setByType([]));
    getDefectsByCoachClass(timeRange).then((d) => setByCoachClass(d.series || [])).catch(() => setByCoachClass([]));
    getInferenceLatency(timeRange).then((d) => setLatency(d.series || [])).catch(() => setLatency([]));
  }, [timeRange]);

  const fmt = (v, suffix = '') => (v == null ? '—' : `${v}${suffix}`);

  const handleExport = (format) => {
    const rows = [
      ...overTime.map((r) => ({ chart: 'defects_over_time', ...r })),
      ...byType.map((r) => ({ chart: 'defects_by_type', ...r })),
      ...byCoachClass.map((r) => ({ chart: 'defects_by_coach_class', ...r })),
      ...latency.map((r) => ({ chart: 'inference_latency', ...r })),
    ];
    if (format === 'csv') exportToCSV(rows, `defect_analytics_${timeRange}.csv`);
    else if (format === 'json') exportToJSON(rows, `defect_analytics_${timeRange}.json`);
    else exportToXLSX(rows, `defect_analytics_${timeRange}.xlsx`, 'Defect Analytics');
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">DEFECT ANALYTICS</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time telemetry, model latency distribution, and defect statistics.</p>
        </div>
        <div className="flex items-center gap-3">
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
          <div className="flex gap-1.5">
            <button onClick={() => handleExport('csv')} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 border border-border rounded hover:bg-secondary">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={() => handleExport('json')} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 border border-border rounded hover:bg-secondary">
              <Download className="w-3.5 h-3.5" /> JSON
            </button>
            <button onClick={() => handleExport('xlsx')} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 border border-border rounded hover:bg-secondary">
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          </div>
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

      {/* Charts area — wired to /api/analytics endpoints */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          icon={TrendingUp}
          title="Defect Trends Over Time"
          description="Defects detected per bucket across all inspections."
          data={overTime}
          emptyLabel="No defect data yet for this range."
        >
          <LineChart data={overTime}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke={CHART_COLOR} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>

        <ChartCard
          icon={BarChart3}
          title="Defect Distribution by Type"
          description="Identified defect patterns segmented by defect type."
          data={byType}
          emptyLabel="No defect data yet."
        >
          <BarChart data={byType}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="defect_type" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill={CHART_COLOR} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard
          icon={BarChart3}
          title="Defects per Coach Class"
          description="Defect volume segmented by coach type."
          data={byCoachClass}
          emptyLabel="No coach classification data yet."
        >
          <BarChart data={byCoachClass}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="coach_class" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#7c3aed" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard
          icon={Activity}
          title="Model Inference Latency Trend"
          description="Average execution speed across pipeline stages (Custom Model, Coach Reader, Sync, etc.)."
          data={latency}
          emptyLabel="No latency data yet. Populates after the first pipeline runs."
        >
          <BarChart data={latency}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="stage" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} unit="ms" />
            <Tooltip />
            <Bar dataKey="avg_duration_ms" fill="#059669" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      {/* Model registry — static config documentation — hidden */}
      {false && (
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
                  <td className="p-3 font-bold text-primary font-mono">custom-model-defect</td>
                  <td className="p-3">PyTorch + Custom Model</td>
                  <td className="p-3 font-semibold text-slate-600">CUDA 0 (RTX series)</td>
                  <td className="p-3 font-mono text-slate-500">GPU/custom-model/models/best.pt</td>
                  <td className="p-3 text-right font-mono font-bold">5002</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-primary font-mono">custom-model-ocr-roi</td>
                  <td className="p-3">PyTorch + Custom Model</td>
                  <td className="p-3 font-semibold text-slate-600">CUDA 0 (RTX series)</td>
                  <td className="p-3 font-mono text-slate-500">GPU/custom-model/models/train_num_detector.pt</td>
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
      )}
    </div>
  );
};
