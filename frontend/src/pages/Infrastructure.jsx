import React, { useState, useEffect, useCallback } from 'react';
import {
  Camera,
  Cpu,
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Network,
  Server,
  Terminal,
  Zap,
  XCircle,
  Inbox
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getServicesHealth } from '../lib/api';

const STATUS_CONFIG = {
  healthy: { label: 'HEALTHY', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  degraded: { label: 'DEGRADED', dot: 'bg-amber-500',  badge: 'bg-amber-50  text-amber-700  border-amber-200',  icon: AlertTriangle },
  offline:  { label: 'OFFLINE',  dot: 'bg-red-500',    badge: 'bg-red-50    text-red-700    border-red-200',    icon: XCircle },
};

export const Infrastructure = () => {
  const [activeTab, setActiveTab]         = useState('services');
  const [services, setServices]           = useState([]);
  const [healthLoading, setHealthLoading] = useState(true);
  const [lastChecked, setLastChecked]     = useState(null);

  const loadHealth = useCallback(async () => {
    try {
      const data = await getServicesHealth();
      setServices(data.services || []);
      setLastChecked(new Date());
    } catch (_) {}
    setHealthLoading(false);
  }, []);

  useEffect(() => {
    loadHealth();
    const t = setInterval(loadHealth, 15000);
    return () => clearInterval(t);
  }, [loadHealth]);

  const healthyCount = services.filter(s => s.status === 'healthy').length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">SYSTEM HEALTH DASHBOARD</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time status of pipeline services, GPU cluster, and camera alignment metrics.</p>
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
          onClick={() => setActiveTab('cameras')}
          className={`pb-3 flex items-center gap-1.5 transition-all relative ${activeTab === 'cameras' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Camera className="w-4 h-4" /> Camera Feeds & Triggers
        </button>
        <button
          onClick={() => setActiveTab('gpu')}
          className={`pb-3 flex items-center gap-1.5 transition-all relative ${activeTab === 'gpu' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Cpu className="w-4 h-4" /> GPU Inference Cluster
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

      {/* Cameras — placeholder until camera registry DB table exists */}
      {activeTab === 'cameras' && (
        <div className="space-y-6">
          <Card className="border border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" /> HW Trigger Sensor Alignment Test
                </CardTitle>
                <CardDescription className="text-xs">Hardware trigger pin testing — available once physical sensors are connected.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
                <Inbox className="w-7 h-7 text-slate-300" />
                <p className="text-xs font-semibold">No physical cameras registered.</p>
                <p className="text-[10px]">Camera registry populates when hardware sensor units are connected and configured.</p>
              </div>
            </CardContent>
          </Card>

          <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border bg-slate-50/50">
              <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Synchronized Camera Feed Registry</h3>
            </div>
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Inbox className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-semibold">No cameras registered yet.</p>
            </div>
          </div>
        </div>
      )}

      {/* GPU — placeholder until GPU monitoring API is wired */}
      {activeTab === 'gpu' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary" /> GPU Inference Node
                </CardTitle>
                <CardDescription className="text-xs">CUDA device telemetry (temperature, VRAM, workload).</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center h-36 gap-2 text-muted-foreground">
                  <Inbox className="w-8 h-8 text-slate-300" />
                  <p className="text-xs font-semibold">GPU monitoring not connected.</p>
                  <p className="text-[10px]">Wire <code className="text-[10px] bg-slate-100 px-1 rounded">nvidia-smi</code> output to a monitoring endpoint to see live stats here.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <Server className="w-4 h-4 text-primary" /> System Memory
                </CardTitle>
                <CardDescription className="text-xs">Host RAM and disk I/O utilization.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center h-36 gap-2 text-muted-foreground">
                  <Inbox className="w-8 h-8 text-slate-300" />
                  <p className="text-xs font-semibold">System metrics not connected.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};
