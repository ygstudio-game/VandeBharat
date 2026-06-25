import React, { useState, useEffect, useCallback } from 'react';
import { Database, Archive, Snowflake, Trash2, RotateCcw, Play, Search, RefreshCw, HardDrive } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getArchiveStats, getArchiveFrames, runArchivePass, restoreFrame, getStations } from '../lib/api';

function fmtBytes(b) {
  if (!b || b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const TIER_CONFIG = {
  active:   { label: 'Active',    icon: Database,  color: '#10b981', bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400' },
  archived: { label: 'Archived',  icon: Archive,   color: '#f59e0b', bg: 'bg-amber-500/10 border-amber-500/20',   text: 'text-amber-400' },
  cold:     { label: 'Cold',      icon: Snowflake, color: '#3b82f6', bg: 'bg-blue-500/10 border-blue-500/20',     text: 'text-blue-400' },
  deleted:  { label: 'Deleted',   icon: Trash2,    color: '#ef4444', bg: 'bg-red-500/10 border-red-500/20',       text: 'text-red-400' },
};

function TierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.active;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${cfg.bg} ${cfg.text}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

export function ImageArchiveManagement() {
  const [stats, setStats]         = useState(null);
  const [frames, setFrames]       = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [framesLoading, setFramesLoading] = useState(false);
  const [archiveRunning, setArchiveRunning] = useState(false);
  const [error, setError]         = useState(null);
  const [toast, setToast]         = useState(null);

  const [filters, setFilters] = useState({
    storage_tier: '',
    date: '',
    session_id: '',
    train_number: '',
    station: '',
    limit: '50',
    offset: '0',
  });
  const [stationOptions, setStationOptions] = useState([]);

  useEffect(() => {
    getStations()
      .then((list) => setStationOptions((list || []).map((s) => s.station_name).filter(Boolean)))
      .catch(() => setStationOptions([]));
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadStats = useCallback(async () => {
    try {
      const data = await getArchiveStats();
      setStats(data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadFrames = useCallback(async (f = filters) => {
    setFramesLoading(true);
    try {
      const params = {};
      if (f.storage_tier) params.storage_tier = f.storage_tier;
      if (f.date)         params.date = f.date;
      if (f.session_id)   params.session_id = f.session_id;
      if (f.train_number) params.train_number = f.train_number;
      if (f.station)      params.station = f.station;
      params.limit  = f.limit;
      params.offset = f.offset;
      const data = await getArchiveFrames(params);
      setFrames(data.frames || []);
      setTotal(data.total  || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setFramesLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStats(), loadFrames()]).finally(() => setLoading(false));
  }, []);

  const handleSearch = () => {
    const updated = { ...filters, offset: '0' };
    setFilters(updated);
    loadFrames(updated);
  };

  const handleRunArchive = async () => {
    setArchiveRunning(true);
    try {
      const res = await runArchivePass();
      showToast(`Archive pass done. Archived: ${res.to_archived}, Cold: ${res.to_cold}, Deleted: ${res.to_deleted}`);
      await loadStats();
      await loadFrames();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setArchiveRunning(false);
    }
  };

  const handleRestore = async (frameId) => {
    try {
      await restoreFrame(frameId);
      showToast('Frame restored to active tier');
      await loadStats();
      await loadFrames();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handlePageChange = (dir) => {
    const lim = parseInt(filters.limit, 10);
    const off = parseInt(filters.offset, 10);
    const newOff = Math.max(0, off + dir * lim);
    const updated = { ...filters, offset: String(newOff) };
    setFilters(updated);
    loadFrames(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading archive data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-400">
        <p className="font-semibold">Error: {error}</p>
        <button className="mt-3 text-sm underline" onClick={() => { setError(null); loadStats(); loadFrames(); }}>Retry</button>
      </div>
    );
  }

  const tierOrder = ['active', 'archived', 'cold', 'deleted'];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-900/90 text-red-200' : 'bg-slate-800 text-emerald-300'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
            <HardDrive className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Image Archive Management</h1>
            <p className="text-xs text-muted-foreground">Retention policy · storage tiers · frame search</p>
          </div>
        </div>
        <button
          onClick={handleRunArchive}
          disabled={archiveRunning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
        >
          <Play className="w-4 h-4" />
          {archiveRunning ? 'Running…' : 'Run Archive Pass'}
        </button>
      </div>

      {/* Policy banner */}
      {stats?.policy && (
        <div className="flex gap-6 px-4 py-3 rounded-lg bg-slate-800/50 border border-slate-700 text-xs text-slate-400">
          <span>Active → Archived after <b className="text-slate-200">{stats.policy.active_days} days</b></span>
          <span>Archived → Cold after <b className="text-slate-200">{stats.policy.cold_days} days</b></span>
          <span>Cold → Deleted after <b className="text-slate-200">{stats.policy.delete_days} days</b></span>
        </div>
      )}

      {/* Tier cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tierOrder.map(tier => {
          const cfg = TIER_CONFIG[tier];
          const Icon = cfg.icon;
          const info = stats?.by_tier?.[tier] || { count: 0, size_bytes: 0 };
          return (
            <Card key={tier} className={`border ${cfg.bg}`}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                  {cfg.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className={`text-2xl font-bold ${cfg.text}`}>{info.count.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">{fmtBytes(info.size_bytes)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Total */}
      {stats && (
        <div className="flex gap-6 text-sm text-muted-foreground">
          <span>Total frames: <b className="text-foreground">{stats.total_frames?.toLocaleString()}</b></span>
          <span>Total size: <b className="text-foreground">{fmtBytes(stats.total_size_bytes)}</b></span>
        </div>
      )}

      {/* Search */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            Search Archived Frames
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <select
              value={filters.storage_tier}
              onChange={e => setFilters(f => ({ ...f, storage_tier: e.target.value }))}
              className="text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-slate-200"
            >
              <option value="">All tiers</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="cold">Cold</option>
              <option value="deleted">Deleted</option>
            </select>
            <input
              type="date"
              value={filters.date}
              onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
              className="text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-slate-200"
            />
            <input
              type="text"
              placeholder="Train number…"
              value={filters.train_number}
              onChange={e => setFilters(f => ({ ...f, train_number: e.target.value }))}
              className="text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-slate-200 w-44"
            />
            <select
              value={filters.station}
              onChange={e => setFilters(f => ({ ...f, station: e.target.value }))}
              className="text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-slate-200"
            >
              <option value="">All stations</option>
              {stationOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              type="text"
              placeholder="Session ID…"
              value={filters.session_id}
              onChange={e => setFilters(f => ({ ...f, session_id: e.target.value }))}
              className="text-sm bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-slate-200 w-72"
            />
            <button
              onClick={handleSearch}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
            >
              <Search className="w-3.5 h-3.5" /> Search
            </button>
          </div>

          {/* Results table */}
          {framesLoading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading frames…
            </div>
          ) : frames.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">No frames found for current filters.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700 text-muted-foreground">
                      <th className="text-left py-2 px-2 font-semibold">Thumbnail</th>
                      <th className="text-left py-2 px-2 font-semibold">Frame #</th>
                      <th className="text-left py-2 px-2 font-semibold">Train</th>
                      <th className="text-left py-2 px-2 font-semibold">Station</th>
                      <th className="text-left py-2 px-2 font-semibold">Coach</th>
                      <th className="text-left py-2 px-2 font-semibold">Tier</th>
                      <th className="text-left py-2 px-2 font-semibold">Size</th>
                      <th className="text-left py-2 px-2 font-semibold">Captured</th>
                      <th className="text-left py-2 px-2 font-semibold">Archived</th>
                      <th className="text-left py-2 px-2 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {frames.map(frame => (
                      <tr key={frame.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition">
                        <td className="py-2 px-2">
                          {frame.thumbnail_url ? (
                            <img
                              src={frame.thumbnail_url}
                              alt={`frame-${frame.sequence_number}`}
                              className="w-14 h-10 object-cover rounded"
                            />
                          ) : (
                            <div className="w-14 h-10 bg-slate-700 rounded flex items-center justify-center text-slate-500">
                              <Database className="w-4 h-4" />
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2 font-mono text-slate-300">#{frame.sequence_number}</td>
                        <td className="py-2 px-2 text-slate-300">{frame.session?.train_number || '—'}</td>
                        <td className="py-2 px-2 text-slate-400">{frame.session?.station?.station_name || '—'}</td>
                        <td className="py-2 px-2 text-slate-400">{frame.coach?.coach_number || '—'}</td>
                        <td className="py-2 px-2"><TierBadge tier={frame.storage_tier} /></td>
                        <td className="py-2 px-2 text-slate-400">{fmtBytes(frame.file_size_bytes)}</td>
                        <td className="py-2 px-2 text-slate-400">{fmtDate(frame.created_at)}</td>
                        <td className="py-2 px-2 text-slate-400">{fmtDate(frame.archived_at)}</td>
                        <td className="py-2 px-2">
                          {(frame.storage_tier === 'archived' || frame.storage_tier === 'cold') && (
                            <button
                              onClick={() => handleRestore(frame.id)}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition text-xs"
                            >
                              <RotateCcw className="w-3 h-3" /> Restore
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                <span>{total} total frames</span>
                <div className="flex gap-2">
                  <button
                    disabled={parseInt(filters.offset, 10) === 0}
                    onClick={() => handlePageChange(-1)}
                    className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition text-slate-200"
                  >
                    ← Prev
                  </button>
                  <span className="px-2 py-1">
                    {Math.floor(parseInt(filters.offset, 10) / parseInt(filters.limit, 10)) + 1}
                    {' / '}
                    {Math.max(1, Math.ceil(total / parseInt(filters.limit, 10)))}
                  </span>
                  <button
                    disabled={parseInt(filters.offset, 10) + parseInt(filters.limit, 10) >= total}
                    onClick={() => handlePageChange(1)}
                    className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition text-slate-200"
                  >
                    Next →
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
