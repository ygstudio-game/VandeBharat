import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Train, Search, TrendingUp, GitCompare, RefreshCw, ExternalLink,
  ChevronLeft, ChevronRight, X, CheckCircle, AlertTriangle, XCircle,
  BarChart2, Calendar, Filter,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getPassages, getTrainTrend, comparePassages, getStations } from '../lib/api';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function healthColor(score) {
  if (score === null || score === undefined) return '#94a3b8';
  if (score >= 80) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function HealthBadge({ score }) {
  const color = healthColor(score);
  return (
    <span className="font-bold text-sm" style={{ color }}>
      {score !== null && score !== undefined ? `${Math.round(score)}%` : '—'}
    </span>
  );
}

function StatusChip({ status }) {
  const map = {
    completed:  { label: 'Completed', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    failed:     { label: 'Failed',    cls: 'bg-red-500/10    text-red-400    border-red-500/20'    },
    processing: { label: 'Running',   cls: 'bg-amber-500/10  text-amber-400  border-amber-500/20'  },
    queued:     { label: 'Queued',    cls: 'bg-slate-500/10  text-slate-400  border-slate-500/20'  },
  };
  const cfg = map[status] || map.queued;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Compare panel ─────────────────────────────────────────────────────────────

function ComparePanel({ data, onClose }) {
  const { session_a: a, session_b: b } = data;

  const defectTypes = [...new Set([
    ...a.defects.map(d => d.defect_type),
    ...b.defects.map(d => d.defect_type),
  ])].sort();

  function countBySeverity(defects, sev) {
    return defects.filter(d => d.severity === sev).length;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-900">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Comparison: {a.train_number} — {a.session_code} vs {b.session_code}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-700 transition">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-4">
          {/* Summary cards */}
          {[a, b].map((s, i) => (
            <div key={i} className="rounded-lg bg-slate-800 border border-slate-700 p-4">
              <p className="text-xs text-muted-foreground mb-1">{i === 0 ? 'Session A' : 'Session B'}</p>
              <p className="font-bold text-foreground">{s.session_code}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{fmtDateTime(s.started_at)}</p>
              <div className="mt-3 flex gap-6 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Health</p>
                  <HealthBadge score={s.health_score} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Critical</p>
                  <span className={`font-bold ${s.critical_defects > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {s.critical_defects}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Defects</p>
                  <span className="font-bold text-foreground">{s.defects.length}</span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Coaches</p>
                  <span className="font-bold text-foreground">{s.total_coaches || s.coaches.length}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Defect type diff */}
        <div className="px-4 pb-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Defect Type Breakdown</p>
          {defectTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No defects in either session.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-muted-foreground">
                    <th className="text-left py-2 px-3 font-semibold">Defect Type</th>
                    <th className="text-right py-2 px-3 font-semibold">{a.session_code}</th>
                    <th className="text-right py-2 px-3 font-semibold">{b.session_code}</th>
                    <th className="text-right py-2 px-3 font-semibold">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {defectTypes.map(type => {
                    const ca = a.defects.filter(d => d.defect_type === type).length;
                    const cb = b.defects.filter(d => d.defect_type === type).length;
                    const delta = cb - ca;
                    return (
                      <tr key={type} className="border-b border-slate-800 hover:bg-slate-800/40">
                        <td className="py-2 px-3 text-slate-300">{type}</td>
                        <td className="py-2 px-3 text-right font-mono">{ca}</td>
                        <td className="py-2 px-3 text-right font-mono">{cb}</td>
                        <td className={`py-2 px-3 text-right font-bold ${delta > 0 ? 'text-red-400' : delta < 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {delta > 0 ? `+${delta}` : delta}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Severity summary */}
        <div className="px-4 pb-4 grid grid-cols-3 gap-3">
          {['critical', 'major', 'minor'].map(sev => (
            <div key={sev} className="rounded-lg bg-slate-800 border border-slate-700 p-3">
              <p className="text-xs text-muted-foreground capitalize mb-2">{sev}</p>
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-slate-300">{a.session_code}: <b>{countBySeverity(a.defects, sev)}</b></span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-300">{b.session_code}: <b>{countBySeverity(b.defects, sev)}</b></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Trend panel ───────────────────────────────────────────────────────────────

function TrendPanel({ trainNumber, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr]   = useState(null);

  useEffect(() => {
    getTrainTrend(trainNumber)
      .then(setData)
      .catch(e => setErr(e.message));
  }, [trainNumber]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-900">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Health Trend — Train {trainNumber}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-700 transition">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="p-6">
          {err && <p className="text-red-400 text-sm">{err}</p>}
          {!data && !err && <p className="text-muted-foreground text-sm">Loading…</p>}
          {data && data.data_points.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">No completed inspection data for this train number.</p>
          )}
          {data && data.data_points.length > 0 && (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.data_points}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => fmtDate(d)}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} unit="%" />
                  <Tooltip
                    formatter={(v) => [`${Math.round(v)}%`, 'Health Score']}
                    labelFormatter={d => fmtDate(d)}
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 12 }}
                  />
                  <ReferenceLine y={80} stroke="#10b981" strokeDasharray="4 2" strokeOpacity={0.5} />
                  <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="4 2" strokeOpacity={0.5} />
                  <Line
                    type="monotone"
                    dataKey="health_score"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ fill: '#6366f1', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700 text-muted-foreground">
                      <th className="text-left py-2 px-2">Session</th>
                      <th className="text-left py-2 px-2">Date</th>
                      <th className="text-right py-2 px-2">Health</th>
                      <th className="text-right py-2 px-2">Critical</th>
                      <th className="text-right py-2 px-2">Defects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data_points.map(p => (
                      <tr key={p.id} className="border-b border-slate-800">
                        <td className="py-2 px-2 text-slate-300">{p.session_code}</td>
                        <td className="py-2 px-2 text-slate-400">{fmtDate(p.date)}</td>
                        <td className="py-2 px-2 text-right"><HealthBadge score={p.health_score} /></td>
                        <td className={`py-2 px-2 text-right font-bold ${p.critical_defects > 0 ? 'text-red-400' : 'text-slate-500'}`}>{p.critical_defects}</td>
                        <td className="py-2 px-2 text-right text-slate-400">{p.total_defects}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TrainPassageHistory({ lockedStation = null }) {
  const navigate = useNavigate();
  const embedded = !!lockedStation;

  const [passages, setPassages]   = useState([]);
  const [total,    setTotal]      = useState(0);
  const [loading,  setLoading]    = useState(true);
  const [error,    setError]      = useState(null);

  const [filters, setFilters] = useState({
    train_number: '',
    station:      '',
    date_from:    '',
    date_to:      '',
    status:       'completed',
    limit:        '25',
    offset:       '0',
  });
  const [stationOptions, setStationOptions] = useState([]);

  useEffect(() => {
    getStations()
      .then((list) => setStationOptions((list || []).map((s) => s.station_name).filter(Boolean)))
      .catch(() => setStationOptions([]));
  }, []);

  const [trendTrain,   setTrendTrain]   = useState(null);
  const [compareMode,  setCompareMode]  = useState(false);
  const [selected,     setSelected]     = useState([]);   // max 2 session IDs
  const [compareData,  setCompareData]  = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const load = useCallback(async (f = filters) => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (f.train_number) params.train_number = f.train_number;
      const stationParam = lockedStation || f.station;
      if (stationParam)   params.station      = stationParam;
      if (f.date_from)    params.date_from    = f.date_from;
      if (f.date_to)      params.date_to      = f.date_to;
      if (f.status)       params.status       = f.status;
      params.limit  = f.limit;
      params.offset = f.offset;
      const data = await getPassages(params);
      setPassages(data.passages || []);
      setTotal(data.total      || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, []);

  const handleSearch = () => {
    const updated = { ...filters, offset: '0' };
    setFilters(updated);
    load(updated);
  };

  const handlePageChange = (dir) => {
    const lim = parseInt(filters.limit, 10);
    const off = parseInt(filters.offset, 10);
    const updated = { ...filters, offset: String(Math.max(0, off + dir * lim)) };
    setFilters(updated);
    load(updated);
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2)  return [prev[1], id];
      return [...prev, id];
    });
  };

  const handleCompare = async () => {
    if (selected.length !== 2) return;
    setCompareLoading(true);
    try {
      const data = await comparePassages(selected[0], selected[1]);
      setCompareData(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCompareLoading(false);
    }
  };

  const currentPage = Math.floor(parseInt(filters.offset, 10) / parseInt(filters.limit, 10)) + 1;
  const totalPages  = Math.max(1, Math.ceil(total / parseInt(filters.limit, 10)));

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Modals */}
      {trendTrain  && <TrendPanel trainNumber={trendTrain} onClose={() => setTrendTrain(null)} />}
      {compareData && <ComparePanel data={compareData} onClose={() => { setCompareData(null); setSelected([]); setCompareMode(false); }} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
            <Train className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Train Passage History</h1>
            <p className="text-xs text-muted-foreground">Browse past inspections · trend analysis · session comparison</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCompareMode(m => !m); setSelected([]); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition ${
              compareMode
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-muted-foreground border-slate-700 hover:border-slate-500'
            }`}
          >
            <GitCompare className="w-4 h-4" />
            {compareMode ? 'Comparing…' : 'Compare Mode'}
          </button>
          {compareMode && selected.length === 2 && (
            <button
              onClick={handleCompare}
              disabled={compareLoading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
            >
              {compareLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
              Show Diff
            </button>
          )}
        </div>
      </div>

      {/* Compare hint */}
      {compareMode && (
        <div className="px-4 py-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-center gap-2">
          <GitCompare className="w-3.5 h-3.5 shrink-0" />
          Select exactly 2 sessions to compare defect diffs.
          {selected.length > 0 && <span className="ml-2 font-semibold">{selected.length}/2 selected</span>}
        </div>
      )}

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Train Number</label>
              <input
                type="text"
                placeholder="e.g. 50777"
                value={filters.train_number}
                onChange={e => setFilters(f => ({ ...f, train_number: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-slate-200 w-44"
              />
            </div>
            {!embedded && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Station</label>
                <select
                  value={filters.station}
                  onChange={e => setFilters(f => ({ ...f, station: e.target.value }))}
                  className="text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-slate-200"
                >
                  <option value="">All stations</option>
                  {stationOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">From</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
                className="text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-slate-200"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">To</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
                className="text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-slate-200"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Status</label>
              <select
                value={filters.status}
                onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                className="text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-slate-200"
              >
                <option value="">All statuses</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="processing">Processing</option>
                <option value="queued">Queued</option>
              </select>
            </div>
            <button
              onClick={handleSearch}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition self-end"
            >
              <Search className="w-3.5 h-3.5" /> Search
            </button>
            {(filters.train_number || filters.station || filters.date_from || filters.date_to || filters.status !== 'completed') && (
              <button
                onClick={() => {
                  const reset = { train_number: '', station: '', date_from: '', date_to: '', status: 'completed', limit: '25', offset: '0' };
                  setFilters(reset);
                  load(reset);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-slate-400 hover:text-slate-200 text-sm self-end transition"
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>
              {loading ? 'Loading…' : `${total} passage${total !== 1 ? 's' : ''} found`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          {loading ? (
            <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading passages…
            </div>
          ) : passages.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No passages found. Try adjusting filters.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700 text-muted-foreground">
                      {compareMode && <th className="py-2 px-2 w-8" />}
                      <th className="text-left py-2 px-2 font-semibold">Session</th>
                      <th className="text-left py-2 px-2 font-semibold">Train #</th>
                      <th className="text-left py-2 px-2 font-semibold">Station</th>
                      <th className="text-left py-2 px-2 font-semibold">Date</th>
                      <th className="text-left py-2 px-2 font-semibold">Status</th>
                      <th className="text-right py-2 px-2 font-semibold">Health</th>
                      <th className="text-right py-2 px-2 font-semibold">Coaches</th>
                      <th className="text-right py-2 px-2 font-semibold">Defects</th>
                      <th className="text-right py-2 px-2 font-semibold">Critical</th>
                      <th className="text-center py-2 px-2 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passages.map(p => {
                      const isSelected = selected.includes(p.id);
                      return (
                        <tr
                          key={p.id}
                          className={`border-b border-slate-800 hover:bg-slate-800/40 transition ${isSelected ? 'bg-indigo-900/20' : ''}`}
                        >
                          {compareMode && (
                            <td className="py-2 px-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(p.id)}
                                disabled={!isSelected && selected.length >= 2}
                                className="rounded"
                              />
                            </td>
                          )}
                          <td className="py-2 px-2 font-mono text-slate-300 text-xs">{p.session_code || p.id.slice(0, 8) + '…'}</td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1">
                              <span className="font-semibold text-foreground">{p.train_number}</span>
                              <button
                                title="View health trend"
                                onClick={() => setTrendTrain(p.train_number)}
                                className="p-0.5 rounded hover:bg-slate-700 text-slate-500 hover:text-indigo-400 transition"
                              >
                                <TrendingUp className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-slate-400">{p.station_name || '—'}</td>
                          <td className="py-2 px-2 text-slate-400">{fmtDate(p.started_at)}</td>
                          <td className="py-2 px-2"><StatusChip status={p.status} /></td>
                          <td className="py-2 px-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ background: healthColor(p.health_score) }}
                              />
                              <HealthBadge score={p.health_score} />
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right text-slate-400">{p.total_coaches ?? p.coaches_count ?? '—'}</td>
                          <td className="py-2 px-2 text-right text-slate-400">{p.defects_count ?? '—'}</td>
                          <td className={`py-2 px-2 text-right font-bold ${p.critical_defects > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                            {p.critical_defects ?? 0}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => navigate(`/train/${p.id}`)}
                                title="Open workspace"
                                className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-200 transition"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                              {p.report_pdf_url && (
                                <a
                                  href={p.report_pdf_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Open PDF report"
                                  className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-amber-400 transition"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                <span>{total} total · showing {parseInt(filters.offset, 10) + 1}–{Math.min(parseInt(filters.offset, 10) + parseInt(filters.limit, 10), total)}</span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => handlePageChange(-1)}
                    className="flex items-center gap-1 px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition text-slate-200"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  <span className="px-2">{currentPage} / {totalPages}</span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => handlePageChange(1)}
                    className="flex items-center gap-1 px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition text-slate-200"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
