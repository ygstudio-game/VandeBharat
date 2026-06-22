import React, { useState, useEffect, useCallback } from 'react';
import {
  getAssets, getOverdueAssets, createAsset, updateAsset, deleteAsset,
  addMaintenanceLog, getMaintenanceLogs,
} from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Wrench, AlertTriangle, Plus, RefreshCw, X, ChevronDown, ChevronUp,
  Camera, Server, Zap, Network, Cpu, CheckCircle2,
} from 'lucide-react';

const ASSET_TYPES = ['Camera', 'Edge PC', 'UPS', 'Network Switch', 'GPU Server', 'Sensor', 'Other'];

const TYPE_ICON = {
  'Camera':         Camera,
  'Edge PC':        Server,
  'UPS':            Zap,
  'Network Switch': Network,
  'GPU Server':     Cpu,
  'Sensor':         CheckCircle2,
  'Other':          Wrench,
};

const STATUS_STYLE = {
  active:      'bg-green-100 text-green-700',
  maintenance: 'bg-amber-100 text-amber-700',
  retired:     'bg-slate-100 text-slate-500',
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysDiff(d) {
  if (!d) return null;
  return Math.round((new Date(d) - new Date()) / 86400000);
}

// ── Asset Modal (create/edit) ─────────────────────────────────────────────────
function AssetModal({ asset, onClose, onSaved }) {
  const blank = { asset_type: 'Camera', name: '', serial_number: '', location: '', installation_date: '', next_maintenance_at: '', notes: '', status: 'active' };
  const [form, setForm] = useState(asset ? {
    asset_type:          asset.asset_type,
    name:                asset.name,
    serial_number:       asset.serial_number || '',
    location:            asset.location || '',
    installation_date:   asset.installation_date ? asset.installation_date.slice(0, 10) : '',
    next_maintenance_at: asset.next_maintenance_at ? asset.next_maintenance_at.slice(0, 10) : '',
    notes:               asset.notes || '',
    status:              asset.status,
  } : blank);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Name required'); return; }
    setSaving(true);
    try {
      if (asset) {
        await updateAsset(asset.id, form);
      } else {
        await createAsset(form);
      }
      onSaved();
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const f = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-lg border border-border max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="text-sm font-bold uppercase tracking-wider">{asset ? 'Edit Asset' : 'Register Asset'}</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Type *</label>
              <Select value={form.asset_type} onValueChange={(v) => setForm((p) => ({ ...p, asset_type: v }))}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="maintenance">In Maintenance</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Name *</label>
            <Input value={form.name} onChange={f('name')} placeholder="e.g. Camera CAM-01 Platform 3" className="text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Serial Number</label>
              <Input value={form.serial_number} onChange={f('serial_number')} placeholder="SN-XXXXXX" className="text-xs" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Location</label>
              <Input value={form.location} onChange={f('location')} placeholder="Platform / Station" className="text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Installation Date</label>
              <Input type="date" value={form.installation_date} onChange={f('installation_date')} className="text-xs" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Next Maintenance</label>
              <Input type="date" value={form.next_maintenance_at} onChange={f('next_maintenance_at')} className="text-xs" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Notes</label>
            <textarea value={form.notes} onChange={f('notes')} rows={2} placeholder="Optional notes..." className="w-full text-xs border border-input rounded-md px-3 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} className="text-xs">{saving ? 'Saving…' : (asset ? 'Save Changes' : 'Register Asset')}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Log Maintenance Modal ─────────────────────────────────────────────────────
function MaintenanceModal({ asset, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ performed_by: '', performed_at: today, description: '', next_due_at: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addMaintenanceLog(asset.id, form);
      onSaved();
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const f = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold uppercase tracking-wider">Log Maintenance</h2>
          <p className="text-xs text-muted-foreground ml-2">{asset.name}</p>
          <button onClick={onClose} className="ml-auto"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Performed On</label>
              <Input type="date" value={form.performed_at} onChange={f('performed_at')} className="text-xs" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Next Due</label>
              <Input type="date" value={form.next_due_at} onChange={f('next_due_at')} className="text-xs" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Performed By</label>
            <Input value={form.performed_by} onChange={f('performed_by')} placeholder="Technician name" className="text-xs" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Description</label>
            <textarea value={form.description} onChange={f('description')} rows={3} placeholder="Work performed, parts replaced..." className="w-full text-xs border border-input rounded-md px-3 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} className="text-xs">{saving ? 'Saving…' : 'Log Maintenance'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Maintenance Log Row ───────────────────────────────────────────────────────
function MaintenanceLogs({ assetId }) {
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    getMaintenanceLogs(assetId).then((r) => setLogs(r.logs || [])).catch(() => setLogs([]));
  }, [assetId]);

  if (!logs) return <div className="p-4 text-xs text-muted-foreground">Loading…</div>;
  if (logs.length === 0) return <div className="p-4 text-xs text-muted-foreground">No maintenance records</div>;

  return (
    <div className="bg-secondary/20 border-t border-border p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Maintenance History</p>
      <div className="space-y-1.5">
        {logs.map((l) => (
          <div key={l.id} className="flex items-start justify-between text-xs bg-card rounded px-3 py-2 border border-border/50">
            <div>
              <p className="font-semibold">{fmtDate(l.performed_at)} {l.performed_by ? `— ${l.performed_by}` : ''}</p>
              {l.description && <p className="text-muted-foreground text-[10px] mt-0.5">{l.description}</p>}
            </div>
            {l.next_due_at && (
              <span className="text-[10px] text-muted-foreground shrink-0 ml-3">Next: {fmtDate(l.next_due_at)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function RailwayAssetManagement() {
  const [assets,    setAssets]    = useState([]);
  const [overdue,   setOverdue]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [typeFilter,setTypeFilter]= useState('');
  const [statusFilt,setStatusFilt]= useState('');
  const [modal,     setModal]     = useState(null); // null | { type: 'asset'|'edit'|'maint', data?: {} }
  const [expanded,  setExpanded]  = useState({});

  const load = useCallback(async () => {
    const params = {};
    if (typeFilter) params.asset_type = typeFilter;
    if (statusFilt) params.status     = statusFilt;
    const [a, o] = await Promise.all([
      getAssets(params).catch(() => ({ assets: [] })),
      getOverdueAssets().catch(() => ({ overdue: [] })),
    ]);
    setAssets(a.assets || []);
    setOverdue(o.overdue || []);
    setLoading(false);
  }, [typeFilter, statusFilt]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const handleRetire = async (id) => {
    await deleteAsset(id);
    load();
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const byType = ASSET_TYPES.reduce((acc, t) => {
    acc[t] = assets.filter((a) => a.asset_type === t).length;
    return acc;
  }, {});

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold uppercase tracking-wider">Railway Asset Management</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{assets.length} assets registered</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={load} className="text-xs gap-1.5">
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
          <Button size="sm" className="text-xs gap-1.5" onClick={() => setModal({ type: 'asset' })}>
            <Plus className="w-3 h-3" /> Register Asset
          </Button>
        </div>
      </div>

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-700">{overdue.length} Asset{overdue.length > 1 ? 's' : ''} Overdue for Maintenance</p>
            <p className="text-xs text-red-600 mt-0.5">
              {overdue.slice(0, 3).map((a) => a.name).join(', ')}{overdue.length > 3 ? ` +${overdue.length - 3} more` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Type summary chips */}
      <div className="flex flex-wrap gap-2">
        {ASSET_TYPES.filter((t) => byType[t] > 0).map((t) => {
          const Icon = TYPE_ICON[t] || Wrench;
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? '' : t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold transition-all ${
                typeFilter === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3 h-3" />
              {t} <span className="font-mono">({byType[t]})</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={statusFilt} onValueChange={setStatusFilt}>
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="maintenance">In Maintenance</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
          </SelectContent>
        </Select>
        {(typeFilter || statusFilt) && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setTypeFilter(''); setStatusFilt(''); }}>
            Clear Filters
          </Button>
        )}
      </div>

      {/* Asset table */}
      <Card className="border-border">
        <CardContent className="p-0">
          {assets.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No assets found. Register one to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground w-8" />
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">Asset</th>
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">Location</th>
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">Installed</th>
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">Last Maint</th>
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">Next Due</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => {
                    const Icon = TYPE_ICON[a.asset_type] || Wrench;
                    const nextDays = daysDiff(a.next_maintenance_at);
                    const isOverdue = a.is_overdue;
                    const isDueSoon = nextDays !== null && nextDays >= 0 && nextDays <= 14;
                    return (
                      <React.Fragment key={a.id}>
                        <tr className={`border-b border-border hover:bg-secondary/20 transition-colors ${isOverdue ? 'bg-red-50/40' : ''}`}>
                          <td className="px-4 py-2.5">
                            <button onClick={() => toggleExpand(a.id)} className="text-muted-foreground hover:text-foreground">
                              {expanded[a.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                              <div>
                                <p className="font-semibold">{a.name}</p>
                                {a.serial_number && <p className="text-[10px] text-muted-foreground">{a.serial_number}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{a.asset_type}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{a.location || '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${STATUS_STYLE[a.status]}`}>
                              {a.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{fmtDate(a.installation_date)}</td>
                          <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{fmtDate(a.last_maintenance_at)}</td>
                          <td className="px-4 py-2.5 tabular-nums">
                            {a.next_maintenance_at ? (
                              <span className={`font-semibold ${isOverdue ? 'text-red-600' : isDueSoon ? 'text-amber-600' : 'text-foreground'}`}>
                                {fmtDate(a.next_maintenance_at)}
                                {isOverdue && <span className="ml-1 text-[10px] text-red-500">OVERDUE</span>}
                                {isDueSoon && !isOverdue && <span className="ml-1 text-[10px] text-amber-500">DUE SOON</span>}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="ghost" className="h-6 w-6" title="Log maintenance" onClick={() => setModal({ type: 'maint', data: a })}>
                                <Wrench className="w-3 h-3 text-primary" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" title="Edit asset" onClick={() => setModal({ type: 'edit', data: a })}>
                                <Plus className="w-3 h-3 rotate-45" />
                              </Button>
                              {a.status !== 'retired' && (
                                <Button size="icon" variant="ghost" className="h-6 w-6 hover:text-destructive" title="Retire asset" onClick={() => handleRetire(a.id)}>
                                  <X className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expanded[a.id] && (
                          <tr>
                            <td colSpan={9} className="p-0">
                              <MaintenanceLogs assetId={a.id} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      {modal?.type === 'asset' && (
        <AssetModal onClose={() => setModal(null)} onSaved={load} />
      )}
      {modal?.type === 'edit' && (
        <AssetModal asset={modal.data} onClose={() => setModal(null)} onSaved={load} />
      )}
      {modal?.type === 'maint' && (
        <MaintenanceModal asset={modal.data} onClose={() => setModal(null)} onSaved={load} />
      )}
    </div>
  );
}
