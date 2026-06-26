import React, { useState, useEffect } from 'react';
import {
  Brain, Target, TrendingUp, RefreshCw, AlertTriangle, CheckCircle,
  XCircle, BarChart2, Cpu, Info,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAiPerformance, getAiPerformanceHistory, getModelComparison } from '../lib/api';

// ── helpers ───────────────────────────────────────────────────────────────────

function pct(v) {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function MetricBar({ value, color }) {
  const pctVal = value !== null ? Math.round(value * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pctVal}%`, background: color }} />
      </div>
      <span className="text-xs font-mono w-10 text-right" style={{ color }}>{pct(value)}</span>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color, tooltip }) {
  return (
    <Card className="border-slate-700">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: color + '20' }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          {tooltip && (
            <div className="group relative">
              <Info className="w-3.5 h-3.5 text-slate-600 cursor-help" />
              <div className="absolute right-0 top-5 z-10 w-56 p-2 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                {tooltip}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-bold" style={{ color }}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const RANGE_OPTIONS = [
  { label: '7 days',  value: '7d'  },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
];

// ── component ─────────────────────────────────────────────────────────────────

export function AiPerformanceAnalytics() {
  const [summary,    setSummary]    = useState(null);
  const [byType,     setByType]     = useState([]);
  const [history,    setHistory]    = useState([]);
  const [models,     setModels]     = useState([]);
  const [range,      setRange]      = useState('30d');
  const [loading,    setLoading]    = useState(true);
  const [histLoading,setHistLoading]= useState(false);
  const [error,      setError]      = useState(null);

  useEffect(() => {
    Promise.all([
      getAiPerformance(),
      getAiPerformanceHistory(range),
      getModelComparison(),
    ])
      .then(([perf, hist, comp]) => {
        setSummary(perf.summary);
        setByType(perf.by_type || []);
        setHistory(hist.data_points || []);
        setModels(comp.models || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleRangeChange = async (r) => {
    setRange(r);
    setHistLoading(true);
    try {
      const hist = await getAiPerformanceHistory(r);
      setHistory(hist.data_points || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setHistLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Computing AI metrics…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-400">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
        <p className="font-semibold">{error}</p>
      </div>
    );
  }

  // Prepare radar data for visual summary
  const radarData = summary ? [
    { metric: 'Precision', value: summary.precision !== null ? Math.round(summary.precision * 100) : 0 },
    { metric: 'Recall',    value: summary.recall    !== null ? Math.round(summary.recall    * 100) : 0 },
    { metric: 'F1 Score',  value: summary.f1        !== null ? Math.round(summary.f1        * 100) : 0 },
    { metric: 'Coverage',  value: summary.coverage_pct ? Math.round(summary.coverage_pct * 100) : 0 },
  ] : [];

  const hasHistoryData = history.some(p => p.precision !== null || p.recall !== null || p.f1 !== null);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
          <Brain className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">AI Performance Analytics</h1>
          <p className="text-xs text-muted-foreground">Precision · Recall · F1-Score · Model comparison</p>
        </div>
      </div>

      {/* Low coverage warning */}
      {summary && summary.coverage_pct < 0.1 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <b>Low review coverage ({pct(summary.coverage_pct)}).</b> Precision/Recall metrics require human-reviewed defects.
            Use the Defect Verification Console to review detections and improve metric accuracy.
          </div>
        </div>
      )}

      {/* KPI cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            icon={Target}
            label="Precision"
            value={pct(summary.precision)}
            sub={`${summary.tp} TP, ${summary.fp} FP`}
            color="#6366f1"
            tooltip="TP / (TP + FP) — of all AI detections, fraction that were real defects."
          />
          <KpiCard
            icon={TrendingUp}
            label="Recall"
            value={pct(summary.recall)}
            sub={`${summary.tp} TP, ${summary.fn} FN`}
            color="#10b981"
            tooltip="TP / (TP + FN) — of all real defects, fraction the AI detected."
          />
          <KpiCard
            icon={BarChart2}
            label="F1 Score"
            value={pct(summary.f1)}
            sub="Harmonic mean of P & R"
            color="#f59e0b"
            tooltip="2 × (Precision × Recall) / (Precision + Recall)"
          />
          <KpiCard
            icon={CheckCircle}
            label="Review Coverage"
            value={pct(summary.coverage_pct)}
            sub={`${summary.reviewed_count} / ${summary.total_defects} reviewed`}
            color="#3b82f6"
            tooltip="Fraction of total AI detections that have been manually reviewed."
          />
        </div>
      )}

      {/* Raw counts */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Detections', value: summary.total_defects, color: '#94a3b8' },
            { label: 'True Positives',   value: summary.tp,            color: '#10b981' },
            { label: 'False Positives',  value: summary.fp,            color: '#ef4444' },
            { label: 'False Negatives',  value: summary.fn,            color: '#f59e0b' },
            { label: 'Pending Review',   value: summary.pending_count, color: '#6366f1' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg bg-slate-800 border border-slate-700 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className="text-xl font-bold" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Trend chart + Radar side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trend chart */}
        <Card className="lg:col-span-2 border-slate-700">
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">P / R / F1 Trend</CardTitle>
            <div className="flex gap-1">
              {RANGE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => handleRangeChange(o.value)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                    range === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {histLoading ? (
              <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : !hasHistoryData ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
                <Info className="w-5 h-5" />
                <p>No reviewed defects in range — metrics unavailable.</p>
                <p className="text-xs text-center max-w-xs">
                  Health score trend is shown below. Review defects in the Verification Console to unlock P/R/F1 metrics.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis domain={[0, 1]} tickFormatter={v => `${Math.round(v*100)}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip
                    formatter={(v, name) => [pct(v), name]}
                    labelFormatter={d => fmtDate(d)}
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="precision" stroke="#6366f1" strokeWidth={2} dot={false} name="Precision" connectNulls />
                  <Line type="monotone" dataKey="recall"    stroke="#10b981" strokeWidth={2} dot={false} name="Recall"    connectNulls />
                  <Line type="monotone" dataKey="f1"        stroke="#f59e0b" strokeWidth={2} dot={false} name="F1"        connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}

            {/* Health score trend (always available) */}
            {history.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Session Health Score Trend</p>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 9, fill: '#64748b' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} unit="%" />
                    <Tooltip
                      formatter={(v) => [`${Math.round(v)}%`, 'Health']}
                      labelFormatter={d => fmtDate(d)}
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11 }}
                    />
                    <Line type="monotone" dataKey="health_score" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 2, fill: '#3b82f6' }} name="Health" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Radar */}
        <Card className="border-slate-700">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Overall Metrics Radar</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} />
                <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Per-defect-type breakdown */}
      {byType.length > 0 && (
        <Card className="border-slate-700">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Performance by Defect Type</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-muted-foreground">
                  <th className="text-left py-2 px-2 font-semibold">Defect Type</th>
                  <th className="text-right py-2 px-2 font-semibold">Total</th>
                  <th className="text-right py-2 px-2 font-semibold">TP</th>
                  <th className="text-right py-2 px-2 font-semibold">FP</th>
                  <th className="text-right py-2 px-2 font-semibold">Pending</th>
                  <th className="py-2 px-3 font-semibold w-40">Precision</th>
                  <th className="py-2 px-3 font-semibold w-40">Recall</th>
                  <th className="py-2 px-3 font-semibold w-40">F1</th>
                </tr>
              </thead>
              <tbody>
                {byType.map(t => (
                  <tr key={t.defect_type} className="border-b border-slate-800 hover:bg-slate-800/40">
                    <td className="py-2 px-2 font-medium text-slate-300">{t.defect_type}</td>
                    <td className="py-2 px-2 text-right text-slate-400">{t.total}</td>
                    <td className="py-2 px-2 text-right text-emerald-400 font-semibold">{t.tp}</td>
                    <td className="py-2 px-2 text-right text-red-400 font-semibold">{t.fp}</td>
                    <td className="py-2 px-2 text-right text-slate-500">{t.pending}</td>
                    <td className="py-2 px-3"><MetricBar value={t.precision} color="#6366f1" /></td>
                    <td className="py-2 px-3"><MetricBar value={t.recall}    color="#10b981" /></td>
                    <td className="py-2 px-3"><MetricBar value={t.f1}        color="#f59e0b" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Model version comparison */}
      <Card className="border-slate-700">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Cpu className="w-4 h-4 text-muted-foreground" />
            Model Version
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {models.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <p>No model versions registered.</p>
              <p className="text-xs mt-1">Register versions via AI Inference Management to compare performance.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-muted-foreground">
                    <th className="text-left py-2 px-2 font-semibold">Model</th>
                    <th className="text-left py-2 px-2 font-semibold">Version</th>
                    <th className="text-left py-2 px-2 font-semibold">Status</th>
                    <th className="text-right py-2 px-2 font-semibold">Precision</th>
                    <th className="text-right py-2 px-2 font-semibold">Recall</th>
                    <th className="text-right py-2 px-2 font-semibold">F1</th>
                    <th className="text-right py-2 px-2 font-semibold">mAP50</th>
                    <th className="text-right py-2 px-2 font-semibold">Eval Set</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map(m => (
                    <tr key={m.id} className={`border-b border-slate-800 hover:bg-slate-800/40 ${m.status === 'active' ? 'bg-emerald-900/10' : ''}`}>
                      <td className="py-2 px-2 text-slate-300 font-medium">{m.model_name}</td>
                      <td className="py-2 px-2 font-mono text-slate-400">{m.version}</td>
                      <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                          m.status === 'active'      ? 'bg-emerald-500/10 text-emerald-400' :
                          m.status === 'staging'     ? 'bg-amber-500/10  text-amber-400'   :
                          m.status === 'rolled_back' ? 'bg-red-500/10    text-red-400'     :
                          'bg-slate-500/10 text-slate-400'
                        }`}>{m.status}</span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-indigo-400">{m.precision !== null ? pct(m.precision) : '—'}</td>
                      <td className="py-2 px-2 text-right font-mono text-emerald-400">{m.recall    !== null ? pct(m.recall)    : '—'}</td>
                      <td className="py-2 px-2 text-right font-mono text-amber-400">{m.f1         !== null ? pct(m.f1)         : '—'}</td>
                      <td className="py-2 px-2 text-right font-mono text-blue-400">{m.map50       !== null ? pct(m.map50)      : '—'}</td>
                      <td className="py-2 px-2 text-right text-slate-500">{m.eval_set ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
