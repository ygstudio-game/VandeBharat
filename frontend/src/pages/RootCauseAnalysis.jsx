import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell, LineChart, Line, Legend,
} from 'recharts';
import { AlertTriangle, Camera, Train, RefreshCw, Plus, FileText, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const TOKEN = localStorage.getItem('mvis_token') || 'dev';

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

const STRENGTH_COLOR = (v) => {
  if (v >= 0.7) return '#ef4444';
  if (v >= 0.4) return '#f97316';
  if (v >= 0.2) return '#eab308';
  return '#22c55e';
};

const EFFECTIVENESS_CONFIG = {
  effective:    { label: 'Effective',    color: 'bg-green-100 text-green-700' },
  partial:      { label: 'Partial',      color: 'bg-yellow-100 text-yellow-700' },
  ineffective:  { label: 'Ineffective',  color: 'bg-red-100 text-red-700' },
  unknown:      { label: 'Unknown',      color: 'bg-gray-100 text-gray-600' },
};

function StrengthBar({ value }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: STRENGTH_COLOR(value) }} />
      </div>
      <span className="text-xs font-mono w-10 text-right">{pct}%</span>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 uppercase tracking-wide">
          {Icon && <Icon className="w-4 h-4 text-primary" />}
          {title}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function ActionModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    defect_type: '', camera_id: '', coach_number: '', root_cause: '',
    description: '', performed_by: '', performed_at: new Date().toISOString().slice(0, 16),
    effectiveness: 'unknown', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.defect_type || !form.description || !form.performed_by || !form.performed_at) {
      setErr('defect_type, description, performed_by, performed_at required');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/api/rca/corrective-actions', {
        method: 'POST',
        body: JSON.stringify({ ...form, performed_at: new Date(form.performed_at).toISOString() }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
        <h2 className="text-base font-bold mb-4">Log Corrective Action</h2>
        {err && <p className="text-xs text-red-600 mb-3">{err}</p>}
        <div className="space-y-3">
          {[
            ['defect_type', 'Defect Type *', 'text'],
            ['camera_id', 'Camera ID (UUID)', 'text'],
            ['coach_number', 'Coach Number', 'text'],
            ['root_cause', 'Root Cause', 'text'],
          ].map(([k, label, type]) => (
            <div key={k}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input
                type={type}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                value={form[k]}
                onChange={e => set(k, e.target.value)}
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description *</label>
            <textarea
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm resize-none"
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>
          {[
            ['performed_by', 'Performed By *', 'text'],
            ['performed_at', 'Performed At *', 'datetime-local'],
          ].map(([k, label, type]) => (
            <div key={k}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input
                type={type}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                value={form[k]}
                onChange={e => set(k, e.target.value)}
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Effectiveness</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              value={form.effectiveness}
              onChange={e => set('effectiveness', e.target.value)}
            >
              {Object.keys(EFFECTIVENESS_CONFIG).map(k => (
                <option key={k} value={k}>{EFFECTIVENESS_CONFIG[k].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm resize-none"
              rows={2}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RootCauseAnalysis() {
  const [correlation, setCorrelation] = useState(null);
  const [clusters, setClusters]       = useState(null);
  const [trends, setTrends]           = useState(null);
  const [actions, setActions]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [defectFilter, setDefectFilter] = useState('');
  const [showModal, setShowModal]     = useState(false);
  const [activeTab, setActiveTab]     = useState('camera');
  const [fTrain, setFTrain]           = useState('');     // train number filter
  const [fStation, setFStation]       = useState('ALL');  // station (location) filter
  const [fDate, setFDate]             = useState('');     // date filter (YYYY-MM-DD)
  const [stationOptions, setStationOptions] = useState([]);

  useEffect(() => {
    apiFetch('/api/stations')
      .then((list) => setStationOptions((list || []).map((s) => s.station_name).filter(Boolean)))
      .catch(() => setStationOptions([]));
  }, []);

  // Filter aggregated rows by station (location) + train number (substring) + date.
  const applyFilter = (rows = []) => rows.filter((r) => {
    const trains = (r.train_numbers || '').toLowerCase();
    const stations = (r.stations || '').split(',').map((x) => x.trim());
    const matchTrain = !fTrain || trains.includes(fTrain.toLowerCase());
    const matchStation = fStation === 'ALL' || stations.includes(fStation);
    // Date filter only narrows rows that carry a date (clusters: first_seen/last_seen).
    // Rows without a date field (correlation aggregates) are left untouched.
    let matchDate = true;
    if (fDate && (r.first_seen || r.last_seen)) {
      const target = new Date(fDate).setHours(0, 0, 0, 0);
      const first = r.first_seen ? new Date(r.first_seen).setHours(0, 0, 0, 0) : null;
      const last  = r.last_seen  ? new Date(r.last_seen).setHours(0, 0, 0, 0)  : null;
      const lo = first ?? last;
      const hi = last ?? first;
      matchDate = target >= lo && target <= hi;
    }
    return matchTrain && matchStation && matchDate;
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = defectFilter ? `?defect_type=${encodeURIComponent(defectFilter)}` : '';
      const defectQ = defectFilter ? `&defect_type=${encodeURIComponent(defectFilter)}` : '';
      const [corr, clust, trend, acts] = await Promise.all([
        apiFetch(`/api/rca/correlation?limit=15${defectQ}`),
        apiFetch(`/api/rca/defect-clusters${params}`),
        apiFetch(`/api/rca/failure-trends?days=30${defectQ}`),
        apiFetch('/api/rca/corrective-actions?limit=50'),
      ]);
      setCorrelation(corr);
      setClusters(clust);
      setTrends(trend);
      setActions(acts);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [defectFilter]);

  useEffect(() => { load(); }, [load]);

  const generateReport = async () => {
    try {
      const report = await apiFetch('/api/rca/report/generate', {
        method: 'POST',
        body: JSON.stringify({ defect_type: defectFilter || undefined }),
      });
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rca-report-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Report generation failed: ' + e.message);
    }
  };

  // Build trend chart data: pivot by date
  const trendData = (() => {
    if (!trends?.trends?.length) return [];
    const byDate = {};
    trends.trends.forEach(({ date, defect_type, count }) => {
      const d = String(date).slice(0, 10);
      if (!byDate[d]) byDate[d] = { date: d };
      byDate[d][defect_type] = (byDate[d][defect_type] || 0) + count;
    });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  })();

  const trendTypes = [...new Set((trends?.trends || []).map(t => t.defect_type))].slice(0, 6);
  const TREND_COLORS = ['#6366f1', '#f97316', '#22c55e', '#ef4444', '#eab308', '#06b6d4'];

  const kpi = [
    { label: 'Total Sessions', value: correlation?.total_sessions ?? '—' },
    { label: 'Camera Correlations', value: correlation?.camera_correlations?.length ?? '—' },
    { label: 'Defect Clusters', value: clusters?.clusters?.length ?? '—' },
    { label: 'Corrective Actions', value: actions?.total ?? '—' },
  ];

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-72" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />)}
        </div>
        {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-gray-200 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Root Cause Analysis</h1>
          <p className="text-xs text-gray-500 mt-0.5">Defect correlation across cameras, coaches, and sessions — <em>probable causes only</em></p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Filter by defect type…"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-52"
            value={defectFilter}
            onChange={e => setDefectFilter(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
          />
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> Log Action
          </button>
          <button onClick={generateReport} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
            <FileText className="w-3.5 h-3.5" /> Export Report
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpi.map(({ label, value }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Table filters — Train number + Station (apply to correlation + cluster tables) */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Table Filters:</span>
        <select
          className="border border-gray-300 rounded-md px-3 py-1.5 text-xs font-semibold text-primary"
          value={fStation}
          onChange={(e) => setFStation(e.target.value)}
        >
          <option value="ALL">All Stations</option>
          {stationOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="text"
          placeholder="Train number…"
          className="border border-gray-300 rounded-md px-3 py-1.5 text-xs w-40"
          value={fTrain}
          onChange={(e) => setFTrain(e.target.value)}
        />
        <input
          type="date"
          className="border border-gray-300 rounded-md px-3 py-1.5 text-xs"
          value={fDate}
          onChange={(e) => setFDate(e.target.value)}
        />
        {(fTrain || fStation !== 'ALL' || fDate) && (
          <button
            onClick={() => { setFTrain(''); setFStation('ALL'); setFDate(''); }}
            className="text-xs font-bold px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Clear
          </button>
        )}
      </div>

      {/* Failure Trends */}
      <SectionCard title="Failure Trends (30 days)" icon={TrendingUp}>
        {trendData.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No trend data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {trendTypes.map((t, i) => (
                <Line key={t} type="monotone" dataKey={t} stroke={TREND_COLORS[i % TREND_COLORS.length]} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* Correlation Panel */}
      <SectionCard title="Defect Correlation" icon={Camera}>
        <div className="flex gap-2 mb-4">
          {['camera', 'coach', 'type'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                activeTab === tab ? 'bg-primary text-white border-primary' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              By {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'camera' && (
          correlation?.camera_correlations?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 uppercase text-left">
                    <th className="pb-2 pr-4">Camera</th>
                    <th className="pb-2 pr-4">Position</th>
                    <th className="pb-2 pr-4">Train No.</th>
                    <th className="pb-2 pr-4">Location</th>
                    <th className="pb-2 pr-4">Defect Type</th>
                    <th className="pb-2 pr-4">Count</th>
                    <th className="pb-2">Correlation Strength</th>
                  </tr>
                </thead>
                <tbody>
                  {applyFilter(correlation.camera_correlations).map((r, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-4 font-mono font-semibold">{r.camera_code}</td>
                      <td className="py-2 pr-4 text-gray-500">{r.position_label || '—'}</td>
                      <td className="py-2 pr-4 font-mono">{r.train_numbers || '—'}</td>
                      <td className="py-2 pr-4 text-gray-500">{r.stations || '—'}</td>
                      <td className="py-2 pr-4">{r.defect_type}</td>
                      <td className="py-2 pr-4 font-semibold">{r.defect_count}</td>
                      <td className="py-2 w-40"><StrengthBar value={r.correlation_strength} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-gray-400">No camera correlation data.</p>
        )}

        {activeTab === 'coach' && (
          correlation?.coach_correlations?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-gray-500 uppercase text-left">
                    <th className="pb-2 pr-4">Coach No.</th>
                    <th className="pb-2 pr-4">Coach Type</th>
                    <th className="pb-2 pr-4">Train No.</th>
                    <th className="pb-2 pr-4">Location</th>
                    <th className="pb-2 pr-4">Defect Type</th>
                    <th className="pb-2 pr-4">Count</th>
                    <th className="pb-2">Correlation Strength</th>
                  </tr>
                </thead>
                <tbody>
                  {applyFilter(correlation.coach_correlations).map((r, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-4 font-mono font-semibold">{r.coach_number}</td>
                      <td className="py-2 pr-4 text-gray-500">{r.coach_type || '—'}</td>
                      <td className="py-2 pr-4 font-mono">{r.train_numbers || '—'}</td>
                      <td className="py-2 pr-4 text-gray-500">{r.stations || '—'}</td>
                      <td className="py-2 pr-4">{r.defect_type}</td>
                      <td className="py-2 pr-4 font-semibold">{r.defect_count}</td>
                      <td className="py-2 w-40"><StrengthBar value={r.correlation_strength} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-gray-400">No coach correlation data.</p>
        )}

        {activeTab === 'type' && (
          correlation?.type_summary?.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={correlation.type_summary.slice(0, 12)} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="defect_type" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="defect_count" name="Defect Count" radius={[3, 3, 0, 0]}>
                  {correlation.type_summary.slice(0, 12).map((_, i) => (
                    <Cell key={i} fill={TREND_COLORS[i % TREND_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400">No defect type data.</p>
        )}
      </SectionCard>

      {/* Defect Clusters */}
      <SectionCard title="Recurring Defect Clusters" icon={AlertTriangle} defaultOpen={false}>
        {clusters?.clusters?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-gray-500 uppercase text-left">
                  <th className="pb-2 pr-4">Defect Type</th>
                  <th className="pb-2 pr-4">Camera</th>
                  <th className="pb-2 pr-4">Coach Type</th>
                  <th className="pb-2 pr-4">Train No.</th>
                  <th className="pb-2 pr-4">Station</th>
                  <th className="pb-2 pr-4">Occurrences</th>
                  <th className="pb-2 pr-4">First Seen</th>
                  <th className="pb-2">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {applyFilter(clusters.clusters).map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-4 font-semibold">{r.defect_type}</td>
                    <td className="py-2 pr-4 font-mono">{r.camera_code}</td>
                    <td className="py-2 pr-4 text-gray-500">{r.coach_type || '—'}</td>
                    <td className="py-2 pr-4 font-mono">{r.train_numbers || '—'}</td>
                    <td className="py-2 pr-4 text-gray-500">{r.stations || '—'}</td>
                    <td className="py-2 pr-4">
                      <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{r.occurrence_count}</span>
                    </td>
                    <td className="py-2 pr-4 text-gray-400">{r.first_seen ? new Date(r.first_seen).toLocaleDateString() : '—'}</td>
                    <td className="py-2 text-gray-400">{r.last_seen ? new Date(r.last_seen).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-gray-400">No recurring clusters found (need ≥2 occurrences of same defect/camera/coach combination).</p>}
      </SectionCard>

      {/* Corrective Actions */}
      <SectionCard title="Corrective Actions Log" icon={Train} defaultOpen={false}>
        {actions?.corrective_actions?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-gray-500 uppercase text-left">
                  <th className="pb-2 pr-4">Defect Type</th>
                  <th className="pb-2 pr-4">Train No.</th>
                  <th className="pb-2 pr-4">Station</th>
                  <th className="pb-2 pr-4">Description</th>
                  <th className="pb-2 pr-4">Performed By</th>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Effectiveness</th>
                  <th className="pb-2">Root Cause</th>
                </tr>
              </thead>
              <tbody>
                {actions.corrective_actions.map(a => {
                  const eff = EFFECTIVENESS_CONFIG[a.effectiveness] || EFFECTIVENESS_CONFIG.unknown;
                  return (
                    <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-4 font-semibold">{a.defect_type}</td>
                      <td className="py-2 pr-4 font-mono">{a.train_number || '—'}</td>
                      <td className="py-2 pr-4 text-gray-500">{a.station_name || '—'}</td>
                      <td className="py-2 pr-4 max-w-xs truncate text-gray-600">{a.description}</td>
                      <td className="py-2 pr-4">{a.performed_by}</td>
                      <td className="py-2 pr-4 text-gray-400">{new Date(a.performed_at).toLocaleDateString()}</td>
                      <td className="py-2 pr-4">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${eff.color}`}>{eff.label}</span>
                      </td>
                      <td className="py-2 text-gray-500 max-w-xs truncate">{a.root_cause || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">No corrective actions logged yet.</p>
            <button onClick={() => setShowModal(true)} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-md mx-auto hover:bg-primary/90">
              <Plus className="w-3.5 h-3.5" /> Log First Action
            </button>
          </div>
        )}
      </SectionCard>

      {showModal && <ActionModal onClose={() => setShowModal(false)} onSaved={load} />}
    </div>
  );
}
