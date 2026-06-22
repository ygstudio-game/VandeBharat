import { useState, useEffect, useCallback } from 'react';
import { getAuditLog, getAuditLogActions, exportAuditLog } from '../lib/api';
import {
  ClipboardList, Download, RefreshCw, ChevronLeft, ChevronRight, Search, Filter,
} from 'lucide-react';

const ACTION_COLORS = {
  LOGIN_SUCCESS:       'bg-green-100 text-green-800',
  LOGIN_FAILED:        'bg-red-100 text-red-800',
  ROLE_CHANGED:        'bg-yellow-100 text-yellow-800',
  USER_CREATED:        'bg-blue-100 text-blue-800',
  USER_ACTIVATED:      'bg-green-100 text-green-800',
  USER_DEACTIVATED:    'bg-orange-100 text-orange-800',
  REPORT_SIGNED:       'bg-purple-100 text-purple-800',
  MODEL_ACTIVATED:     'bg-indigo-100 text-indigo-800',
  MODEL_ROLLED_BACK:   'bg-red-100 text-red-800',
  '2FA_ENABLED':       'bg-teal-100 text-teal-800',
  '2FA_DISABLED':      'bg-orange-100 text-orange-800',
  DEFECT_REVIEWED:     'bg-blue-100 text-blue-800',
  DATASET_EXPORTED:    'bg-indigo-100 text-indigo-800',
};

function ActionBadge({ action }) {
  const cls = ACTION_COLORS[action] || 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {action}
    </span>
  );
}

function MetaPreview({ meta }) {
  if (!meta) return <span className="text-muted-foreground text-xs">—</span>;
  const s = JSON.stringify(meta);
  return (
    <span className="font-mono text-[10px] text-muted-foreground" title={s}>
      {s.length > 60 ? s.slice(0, 60) + '…' : s}
    </span>
  );
}

const EMPTY = { logs: [], total: 0, page: 1, pages: 1 };

export function AuditCompliance() {
  const [data, setData]       = useState(EMPTY);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError]     = useState(null);

  const [filters, setFilters] = useState({
    action: '', date_from: '', date_to: '', search: '', page: 1, limit: 50,
  });

  const fetch = useCallback(async (f) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...(f.action    ? { action: f.action }       : {}),
        ...(f.date_from ? { date_from: f.date_from } : {}),
        ...(f.date_to   ? { date_to: f.date_to }     : {}),
        page:  f.page,
        limit: f.limit,
      };
      const res = await getAuditLog(params);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch(filters);
    getAuditLogActions().then((r) => setActions(r.actions || [])).catch(() => {});
  }, []);

  const apply = (overrides = {}) => {
    const next = { ...filters, ...overrides };
    setFilters(next);
    fetch(next);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {
        ...(filters.action    ? { action: filters.action }       : {}),
        ...(filters.date_from ? { date_from: filters.date_from } : {}),
        ...(filters.date_to   ? { date_to: filters.date_to }     : {}),
      };
      await exportAuditLog(params);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const visibleLogs = filters.search
    ? data.logs.filter((l) =>
        l.action.toLowerCase().includes(filters.search.toLowerCase()) ||
        l.actor_email.toLowerCase().includes(filters.search.toLowerCase()) ||
        l.actor_name.toLowerCase().includes(filters.search.toLowerCase()) ||
        (l.resource_type || '').toLowerCase().includes(filters.search.toLowerCase())
      )
    : data.logs;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Audit &amp; Compliance</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Immutable log of all user and system actions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetch(filters)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground rounded border border-border transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded hover:opacity-90 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Events', value: data.total },
          { label: 'This Page',    value: data.logs.length },
          { label: 'Page',         value: `${data.page} / ${data.pages}` },
          { label: 'Action Types', value: actions.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-extrabold text-foreground mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-bold text-foreground uppercase tracking-wide">Filters</span>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative col-span-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search user / action…"
              value={filters.search}
              onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Action */}
          <select
            value={filters.action}
            onChange={(e) => apply({ action: e.target.value, page: 1 })}
            className="px-3 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* Date from */}
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => apply({ date_from: e.target.value, page: 1 })}
            className="px-3 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
          />

          {/* Date to */}
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => apply({ date_to: e.target.value, page: 1 })}
            className="px-3 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
          />

          {/* Clear */}
          <button
            onClick={() => {
              const cleared = { action: '', date_from: '', date_to: '', search: '', page: 1, limit: 50 };
              setFilters(cleared);
              fetch(cleared);
            }}
            className="px-3 py-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground rounded border border-border transition-all"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700 font-mono">{error}</div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground w-40">Timestamp</th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground w-40">User</th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground">Action</th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground w-28">Resource</th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground w-28">IP Address</th>
                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td>
                </tr>
              )}
              {!loading && visibleLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No audit events found</td>
                </tr>
              )}
              {!loading && visibleLogs.map((log) => (
                <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {log.actor_email ? (
                      <div>
                        <div className="font-semibold text-foreground">{log.actor_name}</div>
                        <div className="text-[10px] text-muted-foreground">{log.actor_email}</div>
                        <div className="text-[9px] uppercase tracking-wide text-muted-foreground/70">{log.actor_role}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">system</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ActionBadge action={log.action} />
                  </td>
                  <td className="px-4 py-3">
                    {log.resource_type ? (
                      <div>
                        <div className="font-semibold text-foreground">{log.resource_type}</div>
                        {log.resource_id && (
                          <div className="font-mono text-[9px] text-muted-foreground">{log.resource_id.slice(0, 8)}…</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{log.ip_address || '—'}</td>
                  <td className="px-4 py-3 max-w-xs">
                    <MetaPreview meta={log.metadata} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-secondary/10">
          <span className="text-xs text-muted-foreground">
            {data.total} total events · showing {filters.limit} per page
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => apply({ page: Math.max(1, filters.page - 1) })}
              disabled={filters.page <= 1 || loading}
              className="p-1.5 rounded border border-border bg-card hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-bold text-foreground">
              {data.page} / {data.pages}
            </span>
            <button
              onClick={() => apply({ page: Math.min(data.pages, filters.page + 1) })}
              disabled={filters.page >= data.pages || loading}
              className="p-1.5 rounded border border-border bg-card hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
