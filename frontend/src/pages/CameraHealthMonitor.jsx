import React, { useState, useEffect, useCallback } from 'react';
import {
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Inbox,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getCameraHealth } from '../lib/api';

const STATUS_CONFIG = {
  healthy:  { label: 'HEALTHY',  dot: 'bg-emerald-500', text: 'text-emerald-600', icon: CheckCircle2 },
  degraded: { label: 'DEGRADED', dot: 'bg-amber-500',   text: 'text-amber-600',   icon: AlertTriangle },
  offline:  { label: 'OFFLINE',  dot: 'bg-red-500',     text: 'text-red-600',     icon: XCircle },
  unknown:  { label: 'UNKNOWN',  dot: 'bg-slate-400',   text: 'text-slate-500',   icon: HelpCircle },
};

export const CameraHealthMonitor = () => {
  const [cameras, setCameras] = useState([]);
  const [alertCount, setAlertCount] = useState(0);
  const [threshold, setThreshold] = useState(90);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await getCameraHealth();
      setCameras(data.cameras || []);
      setAlertCount(data.alert_count || 0);
      setThreshold(data.uptime_threshold ?? 90);
      setLastChecked(new Date());
    } catch {
      setCameras([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">CAMERA HEALTH MONITOR</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live status of all registered cameras. Auto-alerts when uptime drops below {threshold}%.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {alertCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-destructive bg-destructive/10 border border-destructive/30 px-3 py-1.5 rounded-full">
              <ShieldAlert className="w-3.5 h-3.5" /> {alertCount} camera{alertCount !== 1 ? 's' : ''} below threshold
            </div>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 border border-border rounded hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {lastChecked && (
        <p className="text-[10px] text-slate-400 font-mono">Last checked {lastChecked.toLocaleTimeString()}</p>
      )}

      {loading && cameras.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card border border-border p-4 rounded shadow-sm h-32 animate-pulse" />
          ))}
        </div>
      ) : cameras.length === 0 ? (
        <Card className="border border-border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <Inbox className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-semibold">No cameras registered yet.</p>
            <p className="text-[10px]">Camera registry populates once a camera setup is configured.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cameras.map((cam) => {
            const cfg = STATUS_CONFIG[cam.status] || STATUS_CONFIG.unknown;
            const Icon = cfg.icon;
            return (
              <Card key={cam.id} className={`border shadow-sm ${cam.alert ? 'border-destructive/40' : 'border-border'}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 truncate">
                      <Camera className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">{cam.camera_code}</span>
                    </span>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot} ${cam.status === 'healthy' ? 'animate-pulse' : ''}`} />
                  </CardTitle>
                  <CardDescription className="text-[10px] font-bold truncate">
                    {cam.position_label || cam.camera_type} · {cam.station_name || '—'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Uptime</span>
                    <span className={`text-sm font-black font-mono ${cam.alert ? 'text-destructive' : 'text-foreground'}`}>
                      {cam.uptime_pct != null ? `${cam.uptime_pct}%` : '—'}
                    </span>
                  </div>
                  <div className={`flex items-center gap-1 text-[10px] font-bold ${cfg.text}`}>
                    <Icon className="w-3 h-3" /> {cfg.label}
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono">
                    {cam.sessions_sampled} session{cam.sessions_sampled !== 1 ? 's' : ''} sampled
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
