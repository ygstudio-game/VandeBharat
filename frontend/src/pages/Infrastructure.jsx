import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  Zap,
  HardDrive,
  XCircle,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getServicesHealth, getSystemHealth, getInferenceLatency } from '../lib/api';

const STATUS_CONFIG = {
  healthy: { label: 'HEALTHY', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  degraded: { label: 'DEGRADED', dot: 'bg-amber-500',  badge: 'bg-amber-50  text-amber-700  border-amber-200',  icon: AlertTriangle },
  offline:  { label: 'OFFLINE',  dot: 'bg-red-500',    badge: 'bg-red-50    text-red-700    border-red-200',    icon: XCircle },
};

function MetricBar({ label, value, max, unit = '%', warnAt = 80 }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : value;
  const color = pct >= warnAt ? 'text-amber-600' : 'text-foreground';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-bold text-muted-foreground">{label}</span>
        <span className={`font-mono font-black ${color}`}>
          {max ? `${value}${unit === '%' ? '' : unit} / ${max}${unit === '%' ? '' : unit}` : `${value}${unit}`}
        </span>
      </div>
      <Progress value={pct} className="h-1.5 bg-slate-100" />
    </div>
  );
}

export const Infrastructure = () => {
  const [activeTab, setActiveTab]         = useState('services');
  const [services, setServices]           = useState([]);
  const [healthLoading, setHealthLoading] = useState(true);
  const [lastChecked, setLastChecked]     = useState(null);

  const [systemHealth, setSystemHealth]   = useState(null);
  const [latency, setLatency]             = useState([]);

  const loadHealth = useCallback(async () => {
    try {
      const data = await getServicesHealth();
      setServices(data.services || []);
      setLastChecked(new Date());
    } catch (_) {}
    setHealthLoading(false);
  }, []);

  const loadSystem = useCallback(async () => {
    try {
      const data = await getSystemHealth();
      setSystemHealth(data);
    } catch (_) {}
    try {
      const lat = await getInferenceLatency('24h');
      setLatency(lat.series || []);
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadHealth();
    const t = setInterval(loadHealth, 15000);
    return () => clearInterval(t);
  }, [loadHealth]);

  useEffect(() => {
    loadSystem();
    const t = setInterval(loadSystem, 15000);
    return () => clearInterval(t);
  }, [loadSystem]);

  const healthyCount = services.filter(s => s.status === 'healthy').length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">SYSTEM HEALTH DASHBOARD</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time status of pipeline services, GPU/CPU/memory utilisation, SSD health, UPS battery, and model inference times.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border text-sm font-bold gap-6">
        <button
          onClick={() => setActiveTab('services')}
          className={`pb-3 flex items-center gap-1.5 transition-all relative ${activeTab === 'services' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Activity className="w-4 h-4" /> Core Pipeline Services
        </button>
        <button
          onClick={() => setActiveTab('gpu')}
          className={`pb-3 flex items-center gap-1.5 transition-all relative ${activeTab === 'gpu' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Cpu className="w-4 h-4" /> Node Telemetry
        </button>
      </div>

      {/* Services — real health data */}
      {activeTab === 'services' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-semibold">
              {healthLoading
                ? 'Checking service health...'
                : `${healthyCount} / ${services.length} services healthy`}
              {lastChecked && !healthLoading && (
                <span className="ml-2 text-[10px] text-slate-400">
                  Last checked {lastChecked.toLocaleTimeString()}
                </span>
              )}
            </p>
            <button
              onClick={loadHealth}
              disabled={healthLoading}
              className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${healthLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {healthLoading && services.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-card border border-border p-4 rounded shadow-sm h-28 animate-pulse" />
                ))
              : services.map(svc => {
                  const cfg = STATUS_CONFIG[svc.status] || STATUS_CONFIG.offline;
                  const Icon = cfg.icon;
                  return (
                    <div key={svc.name} className="bg-card border border-border p-4 rounded shadow-sm flex flex-col justify-between h-28">
                      <div className="flex items-start justify-between">
                        <div className="text-[10px] font-black uppercase text-muted-foreground tracking-wider leading-tight">
                          {svc.label}
                        </div>
                        <span className={`h-2 w-2 rounded-full ${cfg.dot} ${svc.status === 'healthy' ? 'animate-ping' : ''}`} />
                      </div>
                      <div>
                        <div className="text-md font-black text-slate-900 font-mono">Port {svc.port}</div>
                        <div className={`flex items-center gap-1 text-[10px] font-bold mt-1 ${svc.status === 'healthy' ? 'text-emerald-600' : svc.status === 'degraded' ? 'text-amber-600' : 'text-red-600'}`}>
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </div>
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </div>
      )}

      {/* Node telemetry — simulated until a physical Jetson is wired in */}
      {activeTab === 'gpu' && (
        <div className="space-y-6">
          {systemHealth?.simulated && (
            <p className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded inline-block">
              SIMULATED — no physical Jetson device connected yet. Values are illustrative.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary" /> GPU Inference Node
                </CardTitle>
                <CardDescription className="text-xs">CUDA device telemetry (temperature, VRAM, workload).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {systemHealth ? (
                  <>
                    <MetricBar label="GPU Utilisation" value={systemHealth.gpu.utilization_pct} max={100} />
                    <MetricBar label="GPU Temperature" value={systemHealth.gpu.temperature_c} max={100} unit="°C" warnAt={70} />
                    <MetricBar label="VRAM Used" value={systemHealth.gpu.vram_used_gb} max={systemHealth.gpu.vram_total_gb} unit="GB" />
                  </>
                ) : (
                  <div className="h-24 flex items-center justify-center text-muted-foreground text-xs">Loading…</div>
                )}
              </CardContent>
            </Card>

            <Card className="border border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <Server className="w-4 h-4 text-primary" /> CPU & Memory
                </CardTitle>
                <CardDescription className="text-xs">Host CPU load and RAM utilization.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {systemHealth ? (
                  <>
                    <MetricBar label="CPU Utilisation" value={systemHealth.cpu.utilization_pct} max={100} />
                    <MetricBar label="CPU Temperature" value={systemHealth.cpu.temperature_c} max={100} unit="°C" warnAt={65} />
                    <MetricBar label="Memory Used" value={systemHealth.memory.used_gb} max={systemHealth.memory.total_gb} unit="GB" />
                  </>
                ) : (
                  <div className="h-24 flex items-center justify-center text-muted-foreground text-xs">Loading…</div>
                )}
              </CardContent>
            </Card>

            <Card className="border border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-primary" /> SSD Health
                </CardTitle>
                <CardDescription className="text-xs">Storage utilisation and drive health.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {systemHealth ? (
                  <>
                    <MetricBar label="Storage Used" value={systemHealth.ssd.used_gb} max={systemHealth.ssd.total_gb} unit="GB" />
                    <MetricBar label="Drive Health" value={systemHealth.ssd.health_pct} max={100} warnAt={95} />
                  </>
                ) : (
                  <div className="h-24 flex items-center justify-center text-muted-foreground text-xs">Loading…</div>
                )}
              </CardContent>
            </Card>

            <Card className="border border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" /> UPS Battery
                </CardTitle>
                <CardDescription className="text-xs">Uninterruptible power supply status.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {systemHealth ? (
                  <>
                    <MetricBar label="Battery Level" value={systemHealth.ups.battery_pct} max={100} warnAt={30} />
                    <div className="text-[10px] font-bold text-muted-foreground">
                      Power source: <span className={systemHealth.ups.on_mains ? 'text-emerald-600' : 'text-amber-600'}>
                        {systemHealth.ups.on_mains ? 'MAINS' : 'BATTERY'}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="h-24 flex items-center justify-center text-muted-foreground text-xs">Loading…</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> Model Inference Times (24h)
              </CardTitle>
              <CardDescription className="text-xs">Average pipeline stage duration — see Defect Analytics for full trend charts.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {latency.length === 0 ? (
                <div className="h-20 flex items-center justify-center text-muted-foreground text-xs">No inference data yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-border text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        <th className="p-3">Stage</th>
                        <th className="p-3 text-right">Avg Duration</th>
                        <th className="p-3 text-right">Samples</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {latency.map((l) => (
                        <tr key={l.stage} className="hover:bg-slate-50/50">
                          <td className="p-3 font-mono font-bold">{l.stage}</td>
                          <td className="p-3 text-right font-mono">{l.avg_duration_ms} ms</td>
                          <td className="p-3 text-right font-mono text-muted-foreground">{l.samples}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
