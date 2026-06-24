import React, { useState, useEffect, useCallback } from 'react';
import {
  getSync, getSyncHistory, retrySyncDlq,
} from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  GitMerge, AlertTriangle, CheckCircle2, Clock, RefreshCw,
  Database, Cpu, ArrowRight, RotateCcw, Wifi, WifiOff,
} from 'lucide-react';

const POLL_MS = 30_000;

const STAGE_LABELS = {
  ocr_detection:     'OCR Detection',
  synchronization:   'Sync Engine',
  correlation:       'Correlation',
  report_generation: 'Report Gen',
};

const STATUS_STYLE = {
  completed: 'bg-green-100 text-green-700',
  running:   'bg-blue-100 text-blue-700',
  failed:    'bg-red-100 text-red-700',
  pending:   'bg-secondary text-muted-foreground',
};

function StageBar({ sessionStages }) {
  const stageOrder = ['ocr_detection', 'synchronization', 'correlation', 'report_generation'];
  const stageMap = {};
  for (const s of sessionStages) stageMap[s.stage] = s;

  return (
    <div className="flex items-center gap-1">
      {stageOrder.map((stage, i) => {
        const s = stageMap[stage];
        const color = s?.status === 'completed' ? 'bg-green-500'
          : s?.status === 'running'   ? 'bg-blue-500 animate-pulse'
          : s?.status === 'failed'    ? 'bg-red-500'
          : 'bg-border';
        return (
          <React.Fragment key={stage}>
            <div title={`${STAGE_LABELS[stage]}: ${s?.status || 'pending'}`}
              className={`w-3 h-3 rounded-sm ${color}`} />
            {i < stageOrder.length - 1 && <div className="w-3 h-px bg-border" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function DataSyncHub() {
  const [status,   setStatus]   = useState(null);
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [lastAt,   setLastAt]   = useState(null);
  const [histStage,setHistStage]= useState('all');
  const [retrying, setRetrying] = useState({});

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        getSync(),
        getSyncHistory({ limit: 30, stage: histStage === 'all' ? undefined : histStage }),
      ]);
      setStatus(s);
      setHistory(h.events || []);
      setLastAt(new Date());
    } catch (_) {}
    setLoading(false);
  }, [histStage]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [load]);

  const handleRetry = async (stage) => {
    setRetrying((r) => ({ ...r, [stage]: true }));
    try {
      await retrySyncDlq(stage);
      await load();
    } catch (_) {}
    setRetrying((r) => ({ ...r, [stage]: false }));
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading sync hub…</span>
      </div>
    );
  }

  const stages = status?.stages || {};

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold uppercase tracking-wider">Data Synchronization Hub</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last refresh: {lastAt ? lastAt.toLocaleTimeString() : '—'} · Auto-refreshes every 30s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status?.redis_online ? (
            <Badge variant="secondary" className="text-xs gap-1">
              <Wifi className="w-3 h-3 text-green-500" /> Redis Online
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-xs gap-1">
              <WifiOff className="w-3 h-3" /> Redis Offline
            </Badge>
          )}
          {status?.total_dlq > 0 && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {status.total_dlq} in DLQ
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={load} className="text-xs gap-1.5">
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active Workers', value: status?.active_workers ?? 0, icon: Cpu, color: 'text-blue-500' },
          { label: 'Total Pending', value: status?.total_pending ?? 0, icon: Clock, color: 'text-amber-500' },
          { label: 'Total DLQ', value: status?.total_dlq ?? 0, icon: AlertTriangle, color: status?.total_dlq > 0 ? 'text-red-500' : 'text-muted-foreground' },
          { label: 'Pipeline Stages', value: 4, icon: GitMerge, color: 'text-primary' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`w-8 h-8 ${color}`} />
              <div>
                <p className="text-2xl font-extrabold tabular-nums">{value}</p>
                <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline stage queue cards */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Pipeline Queues</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(STAGE_LABELS).map(([stage, label]) => {
            const s = stages[stage] || {};
            const hasDlq    = (s.dlq_depth || 0) > 0;
            const hasError  = s.error === 'redis_unavailable' || s.error === 'unavailable';

            return (
              <Card key={stage} className={`border-border ${hasDlq ? 'border-red-200' : ''}`}>
                <CardHeader className="py-3 px-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-bold">{label}</CardTitle>
                    {hasDlq ? (
                      <Badge variant="destructive" className="text-[10px]">DLQ</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] text-green-600">OK</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-2">
                  {hasError ? (
                    <p className="text-xs text-muted-foreground">Redis unavailable</p>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        {[
                          { label: 'Stream Depth',  value: s.stream_depth ?? 0 },
                          { label: 'Pending (unacked)', value: s.pending ?? 0 },
                          { label: 'Consumers',     value: s.consumers ?? 0 },
                          { label: 'DLQ Depth',     value: s.dlq_depth ?? 0, alert: hasDlq },
                        ].map(({ label: l, value, alert }) => (
                          <div key={l} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{l}</span>
                            <span className={`font-bold tabular-nums ${alert ? 'text-red-600' : ''}`}>{value}</span>
                          </div>
                        ))}
                      </div>
                      {hasDlq && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs h-7 gap-1.5 mt-1"
                          disabled={!!retrying[stage]}
                          onClick={() => handleRetry(stage)}
                        >
                          <RotateCcw className={`w-3 h-3 ${retrying[stage] ? 'animate-spin' : ''}`} />
                          {retrying[stage] ? 'Retrying…' : 'Retry DLQ'}
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Pipeline flow diagram (static, visual only) */}
      <Card className="border-border">
        <CardHeader className="py-3 px-4 border-b border-border">
          <CardTitle className="text-xs font-bold uppercase tracking-wider">Data Flow</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {[
              { key: 'upload',         label: 'Session Upload',  color: 'bg-slate-100 border-slate-200 text-slate-700' },
              { key: 'ocr_detection',  label: 'OCR Detection',   color: 'bg-blue-50 border-blue-200 text-blue-700' },
              { key: 'synchronization',label: 'Sync Engine',     color: 'bg-purple-50 border-purple-200 text-purple-700' },
              { key: 'correlation',    label: 'Correlation',     color: 'bg-amber-50 border-amber-200 text-amber-700' },
              { key: 'report',         label: 'Report Gen',      color: 'bg-green-50 border-green-200 text-green-700' },
            ].map(({ key, label, color }, i, arr) => (
              <React.Fragment key={key}>
                <div className={`shrink-0 border rounded-md px-3 py-2 text-xs font-semibold ${color}`}>
                  <p>{label}</p>
                  {stages[key] && (
                    <p className="text-[10px] font-mono mt-0.5">
                      depth: {stages[key].stream_depth ?? 0}
                    </p>
                  )}
                </div>
                {i < arr.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Transport: Redis Streams · Retry: exponential backoff (1s → 2s → 4s, max 3 attempts) · DLQ: on exhaustion
          </p>
        </CardContent>
      </Card>

      {/* Recent pipeline events + active sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Active/recent sessions */}
        <Card className="border-border">
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-xs font-bold uppercase tracking-wider">Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(!status?.recent_sessions || status.recent_sessions.length === 0) ? (
              <p className="text-xs text-muted-foreground p-4">No sessions yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left px-4 py-2 font-bold uppercase tracking-wider text-muted-foreground">Train</th>
                      <th className="text-left px-4 py-2 font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-2 font-bold uppercase tracking-wider text-muted-foreground">Pipeline</th>
                      <th className="text-left px-4 py-2 font-bold uppercase tracking-wider text-muted-foreground">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.recent_sessions.map((s) => (
                      <tr key={s.id} className="border-b border-border hover:bg-secondary/20">
                        <td className="px-4 py-2 font-mono font-bold">{s.train_number}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${STATUS_STYLE[s.status] || STATUS_STYLE.pending}`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <StageBar sessionStages={s.stages || []} />
                        </td>
                        <td className="px-4 py-2 text-muted-foreground tabular-nums">
                          {new Date(s.started_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pipeline stage event log */}
        <Card className="border-border">
          <CardHeader className="py-3 px-4 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-wider">Stage Event Log</CardTitle>
              <Select value={histStage} onValueChange={setHistStage}>
                <SelectTrigger className="h-7 text-xs w-36">
                  <SelectValue placeholder="All stages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {Object.entries(STAGE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4">No events yet</p>
            ) : (
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {history.map((e) => (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-2 hover:bg-secondary/20">
                    <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                      e.status === 'completed' ? 'bg-green-500'
                      : e.status === 'running'  ? 'bg-blue-500'
                      : e.status === 'failed'   ? 'bg-red-500'
                      : 'bg-border'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-muted-foreground">{STAGE_LABELS[e.stage] || e.stage}</span>
                        <span className={`px-1 py-0.5 rounded text-[10px] font-bold uppercase ${STATUS_STYLE[e.status] || STATUS_STYLE.pending}`}>{e.status}</span>
                        {e.attempts > 1 && (
                          <span className="text-amber-600 text-[10px]">retry #{e.attempts}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {e.session?.train_number || 'unknown'} · {e.detail_message || e.error_message || '—'}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {e.started_at ? new Date(e.started_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
