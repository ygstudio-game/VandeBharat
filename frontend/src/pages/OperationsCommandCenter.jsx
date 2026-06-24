import React, { useState, useEffect, useCallback } from 'react';
import {
  getDashboardKpis, getLiveQueue, getRecentDefects,
  getServicesHealth, getSystemHealth, getCameraHealth,
  getIncidents, createIncident, updateIncident, deleteIncident,
} from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle, Train, Camera, Server, ShieldAlert,
  Plus, CheckCircle2, Clock, RefreshCw, Trash2, X,
} from 'lucide-react';

const POLL_MS = 30_000;

const SEV_COLOR = { P1: 'destructive', P2: 'warning', P3: 'secondary' };
const SEV_BG    = { P1: 'bg-red-100 text-red-800', P2: 'bg-amber-100 text-amber-800', P3: 'bg-blue-100 text-blue-800' };
const STATUS_COLOR = {
  open:        'bg-red-100 text-red-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved:    'bg-green-100 text-green-700',
};

function KpiChip({ label, value, sub }) {
  return (
    <div className="bg-secondary/50 rounded-md px-3 py-2 min-w-[80px]">
      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{label}</p>
      <p className="text-xl font-extrabold tabular-nums leading-none mt-0.5">{value ?? '—'}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function SvcDot({ status }) {
  const c = status === 'healthy' ? 'bg-green-500' : status === 'degraded' ? 'bg-amber-400' : 'bg-red-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${c}`} />;
}

// ── Incident log modal ───────────────────────────────────────────────────────
function IncidentModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', severity: 'P2', description: '', assigned_to: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setErr('Title required'); return; }
    setSaving(true);
    try {
      await createIncident(form);
      onSaved();
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold uppercase tracking-wider">Log Incident</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Title *</label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Brief description of the issue"
              className="text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Severity</label>
              <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="P1">P1 — Critical</SelectItem>
                  <SelectItem value="P2">P2 — Major</SelectItem>
                  <SelectItem value="P3">P3 — Minor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Assigned To</label>
              <Input
                value={form.assigned_to}
                onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
                placeholder="Name or team"
                className="text-xs"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Steps to reproduce, impact, context..."
              className="w-full text-xs border border-input rounded-md px-3 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} className="text-xs">
              {saving ? 'Saving...' : 'Log Incident'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function OperationsCommandCenter() {
  const [kpis,     setKpis]     = useState(null);
  const [queue,    setQueue]    = useState([]);
  const [defects,  setDefects]  = useState([]);
  const [services, setServices] = useState([]);
  const [sysHealth,setSysHealth]= useState(null);
  const [cameras,  setCameras]  = useState({ cameras: [], alert_count: 0 });
  const [incidents,setIncidents]= useState([]);
  const [loading,  setLoading]  = useState(true);
  const [lastAt,   setLastAt]   = useState(null);
  const [showModal,setShowModal]= useState(false);
  const [incFilter,setIncFilter]= useState('all');

  const load = useCallback(async () => {
    try {
      const [k, q, d, svc, sys, cam, inc] = await Promise.all([
        getDashboardKpis(),
        getLiveQueue(),
        getRecentDefects(8),
        getServicesHealth(),
        getSystemHealth(),
        getCameraHealth(),
        getIncidents({ limit: 50 }),
      ]);
      setKpis(k);
      setQueue(q.queue || []);
      setDefects(d.defects || []);
      setServices(svc.services || []);
      setSysHealth(sys);
      setCameras(cam);
      setIncidents(inc.incidents || []);
      setLastAt(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [load]);

  const handleStatusChange = async (id, status) => {
    try {
      await updateIncident(id, { status });
      load();
    } catch (_) {}
  };

  const handleDelete = async (id) => {
    try {
      await deleteIncident(id);
      load();
    } catch (_) {}
  };

  const filteredInc = incidents.filter((i) =>
    incFilter === 'all' || i.status === incFilter
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading command center…</span>
      </div>
    );
  }

  const offlineCams   = cameras.cameras?.filter((c) => c.status === 'offline').length ?? 0;
  const degradedCams  = cameras.cameras?.filter((c) => c.status === 'degraded').length ?? 0;
  const healthyCams   = cameras.cameras?.filter((c) => c.status === 'healthy').length ?? 0;
  const offlineServices = services.filter((s) => s.status === 'offline').length;

  const openInc = incidents.filter((i) => i.status !== 'resolved').length;
  const p1Open  = incidents.filter((i) => i.severity === 'P1' && i.status !== 'resolved').length;

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold uppercase tracking-wider">Operations Command Center</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last refresh: {lastAt ? lastAt.toLocaleTimeString() : '—'} · Auto-refreshes every 30s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {p1Open > 0 && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {p1Open} P1 Open
            </Badge>
          )}
          {offlineServices > 0 && (
            <Badge variant="destructive" className="text-xs">
              {offlineServices} Service{offlineServices > 1 ? 's' : ''} Offline
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={load} className="text-xs gap-1.5">
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
        </div>
      </div>

      {/* 4-quadrant grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Q1 — Active Sessions */}
        <Card className="border-border">
          <CardHeader className="py-3 px-4 border-b border-border flex flex-row items-center gap-2">
            <Train className="w-4 h-4 text-primary" />
            <CardTitle className="text-xs font-bold uppercase tracking-wider">Active Sessions</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {kpis && (
              <div className="flex flex-wrap gap-2">
                <KpiChip label="Active"    value={kpis.active_sessions} />
                <KpiChip label="Queued"    value={kpis.queued_sessions} />
                <KpiChip label="Today"     value={kpis.sessions_today} />
                <KpiChip label="Crit Def"  value={kpis.critical_defects} />
                <KpiChip label="Avg Health" value={kpis.avg_health_score != null ? `${kpis.avg_health_score}%` : '—'} />
              </div>
            )}
            {queue.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active sessions</p>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {queue.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs bg-secondary/40 rounded px-2.5 py-1.5">
                    <span className="font-mono font-bold">{s.train_number}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-border rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-primary transition-all"
                          style={{ width: `${s.progress_pct}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground w-8 text-right">{s.progress_pct}%</span>
                      <Badge
                        variant={s.status === 'failed' ? 'destructive' : 'secondary'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {s.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Q2 — Camera Health */}
        <Card className="border-border">
          <CardHeader className="py-3 px-4 border-b border-border flex flex-row items-center gap-2">
            <Camera className="w-4 h-4 text-primary" />
            <CardTitle className="text-xs font-bold uppercase tracking-wider">Camera Health</CardTitle>
            {cameras.alert_count > 0 && (
              <Badge variant="destructive" className="ml-auto text-[10px]">
                {cameras.alert_count} Alert{cameras.alert_count > 1 ? 's' : ''}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <KpiChip label="Healthy"  value={healthyCams}  />
              <KpiChip label="Degraded" value={degradedCams} />
              <KpiChip label="Offline"  value={offlineCams}  />
              <KpiChip label="Total"    value={cameras.cameras?.length ?? 0} />
            </div>
            <div className="space-y-1 max-h-44 overflow-y-auto">
              {cameras.cameras?.length === 0 && (
                <p className="text-xs text-muted-foreground">No cameras registered</p>
              )}
              {cameras.cameras?.map((cam) => (
                <div key={cam.id} className="flex items-center justify-between text-xs bg-secondary/40 rounded px-2.5 py-1">
                  <div className="flex items-center gap-2">
                    <SvcDot status={cam.status} />
                    <span className="font-mono">{cam.camera_code}</span>
                    <span className="text-muted-foreground">{cam.position_label || cam.camera_type}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{cam.uptime_pct != null ? `${cam.uptime_pct}%` : '—'}</span>
                    <span>{cam.station_code || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Q3 — System Health */}
        <Card className="border-border">
          <CardHeader className="py-3 px-4 border-b border-border flex flex-row items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            <CardTitle className="text-xs font-bold uppercase tracking-wider">System Health</CardTitle>
            {offlineServices > 0 && (
              <Badge variant="destructive" className="ml-auto text-[10px]">
                {offlineServices} Offline
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {sysHealth && (
              <div className="flex flex-wrap gap-2">
                <KpiChip label="GPU"    value={`${sysHealth.gpu?.utilization_pct ?? '—'}%`} sub={`${sysHealth.gpu?.temperature_c ?? '—'}°C`} />
                <KpiChip label="VRAM"   value={`${sysHealth.gpu?.vram_used_gb ?? '—'}G`}    sub={`/ ${sysHealth.gpu?.vram_total_gb ?? '—'}G`} />
                <KpiChip label="CPU"    value={`${sysHealth.cpu?.utilization_pct ?? '—'}%`} sub={`${sysHealth.cpu?.temperature_c ?? '—'}°C`} />
                <KpiChip label="RAM"    value={`${sysHealth.memory?.used_gb ?? '—'}G`}      sub={`/ ${sysHealth.memory?.total_gb ?? '—'}G`} />
                <KpiChip label="UPS"    value={`${sysHealth.ups?.battery_pct ?? '—'}%`}     sub={sysHealth.ups?.on_mains ? 'On Mains' : 'On Batt'} />
              </div>
            )}
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {services.map((svc) => (
                <div key={svc.name} className="flex items-center justify-between text-xs bg-secondary/40 rounded px-2.5 py-1">
                  <div className="flex items-center gap-2">
                    <SvcDot status={svc.status} />
                    <span className="font-mono font-semibold">{svc.name}</span>
                    <span className="text-muted-foreground">{svc.label}</span>
                  </div>
                  <span className={`text-[10px] font-bold uppercase ${
                    svc.status === 'healthy' ? 'text-green-600' :
                    svc.status === 'degraded' ? 'text-amber-600' : 'text-red-600'
                  }`}>{svc.status}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Q4 — Recent Critical Defects */}
        <Card className="border-border">
          <CardHeader className="py-3 px-4 border-b border-border flex flex-row items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" />
            <CardTitle className="text-xs font-bold uppercase tracking-wider">Recent Critical Defects</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {defects.length === 0 ? (
              <p className="text-xs text-muted-foreground">No defects found</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {defects.map((d) => (
                  <div key={d.id} className="flex items-start justify-between text-xs bg-secondary/40 rounded px-2.5 py-1.5 gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{d.defect_type}</p>
                      <p className="text-muted-foreground">
                        {d.train_number || '—'} · Coach {d.coach_number || '—'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <Badge
                        variant={d.severity === 'critical' ? 'destructive' : 'secondary'}
                        className="text-[10px] px-1.5 py-0 uppercase"
                      >
                        {d.severity}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {d.confidence != null ? `${(d.confidence * 100).toFixed(0)}%` : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Incident Tracker — full width */}
      <Card className="border-border">
        <CardHeader className="py-3 px-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <CardTitle className="text-xs font-bold uppercase tracking-wider">Incident Tracker</CardTitle>
              {openInc > 0 && (
                <Badge variant="destructive" className="text-[10px] ml-1">{openInc} Open</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select value={incFilter} onValueChange={setIncFilter}>
                <SelectTrigger className="h-7 text-xs w-36">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setShowModal(true)}>
                <Plus className="w-3 h-3" /> Log Incident
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredInc.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No incidents{incFilter !== 'all' ? ` with status "${incFilter}"` : ''} — system nominal
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">Sev</th>
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">Title</th>
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">Assigned</th>
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">Logged</th>
                    <th className="text-left px-4 py-2.5 font-bold uppercase tracking-wider text-muted-foreground">Resolved</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filteredInc.map((inc) => (
                    <tr key={inc.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${SEV_BG[inc.severity]}`}>
                          {inc.severity}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 max-w-[260px]">
                        <p className="font-semibold truncate">{inc.title}</p>
                        {inc.description && (
                          <p className="text-muted-foreground truncate text-[10px]">{inc.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${STATUS_COLOR[inc.status]}`}>
                          {inc.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{inc.assigned_to || '—'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                        {new Date(inc.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                        {inc.resolved_at
                          ? new Date(inc.resolved_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          {inc.status === 'open' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              title="Mark in progress"
                              onClick={() => handleStatusChange(inc.id, 'in_progress')}
                            >
                              <Clock className="w-3 h-3 text-amber-500" />
                            </Button>
                          )}
                          {inc.status !== 'resolved' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              title="Mark resolved"
                              onClick={() => handleStatusChange(inc.id, 'resolved')}
                            >
                              <CheckCircle2 className="w-3 h-3 text-green-500" />
                            </Button>
                          )}
                          {inc.status === 'resolved' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              title="Reopen"
                              onClick={() => handleStatusChange(inc.id, 'open')}
                            >
                              <RefreshCw className="w-3 h-3 text-muted-foreground" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 hover:text-destructive"
                            title="Delete incident"
                            onClick={() => handleDelete(inc.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showModal && (
        <IncidentModal
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
