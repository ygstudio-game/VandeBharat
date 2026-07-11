import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  MapPin, Camera,
  RefreshCw, Server, Train, ShieldAlert, FileText, History,
} from 'lucide-react';
import { getStationsOverview, getStationDetail } from '../lib/api';
import { Sessions } from './Sessions';
import { DefectAlertConsole } from './DefectAlertConsole';
import { Reports } from './Reports';
import { TrainPassageHistory } from './TrainPassageHistory';

const STATUS_CONFIG = {
  online: { label: 'Online', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500', border: 'border-green-200' },
  degraded: { label: 'Degraded', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' },
  offline: { label: 'Offline', bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', border: 'border-red-200' },
  unknown: { label: 'Unknown', bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', border: 'border-slate-200' },
};

const TABS = [
  { key: 'inspections', label: 'Inspections', icon: Train },
  { key: 'defects', label: 'Defect Alerts', icon: ShieldAlert },
  { key: 'reports', label: 'Reports', icon: FileText },
  { key: 'history', label: 'Train History', icon: History },
];

const CAM_STATUS = {
  healthy: { dot: 'bg-green-500', label: 'Healthy' },
  degraded: { dot: 'bg-amber-500', label: 'Degraded' },
  offline: { dot: 'bg-red-500', label: 'Offline' },
  unknown: { dot: 'bg-slate-400', label: 'Unknown' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function UptimeBar({ pct }) {
  if (pct == null) return <span className="text-xs text-slate-400">N/A</span>;
  const color = pct >= 90 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-600 w-12 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

function fmt(dt) {
  if (!dt) return '-';
  return new Date(dt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

export function DetailPanel({ code, onBack, hideHeader = false }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getStationDetail(code).then(setDetail).finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!detail) return <div className="p-8 text-slate-500">Station not found.</div>;

  return (
    <div>
      {!hideHeader && (
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase">{detail.station_code}</p>
            <h2 className="text-lg font-bold text-slate-800">{detail.station_name}</h2>
          </div>
          {detail.edge_machine && (
            <div className="ml-auto flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <Server className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs font-bold text-slate-700">{detail.edge_machine.hostname}</p>
                <p className="text-[10px] text-slate-400">{detail.edge_machine.ip_address ?? '-'}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Camera className="w-4 h-4" /> Cameras ({detail.cameras.length})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {detail.cameras.map((cam) => {
            const cs = CAM_STATUS[cam.status] ?? CAM_STATUS.unknown;
            return (
              <div key={cam.id} className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700">{cam.camera_code}</span>
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase text-slate-500">
                    <span className={`w-1.5 h-1.5 rounded-full ${cs.dot}`} />{cs.label}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mb-1">{cam.camera_type}{cam.position_label ? ` · ${cam.position_label}` : ''}</p>
                <UptimeBar pct={cam.uptime_pct} />
                <p className="text-[10px] text-slate-400 mt-1.5">Last seen: {fmt(cam.last_seen)}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Train className="w-4 h-4" /> Recent Sessions
        </h3>
        {detail.recent_sessions.length === 0 ? (
          <p className="text-sm text-slate-400">No sessions for this station.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Train', 'Code', 'Status', 'Health', 'Critical', 'Started'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.recent_sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{s.train_number}</td>
                    <td className="px-3 py-2.5 text-slate-500">{s.session_code ?? '-'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        s.status === 'completed' ? 'bg-green-100 text-green-700' :
                        s.status === 'active' || s.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                        s.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{s.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{s.health_score != null ? `${Number(s.health_score).toFixed(1)}%` : '-'}</td>
                    <td className="px-3 py-2.5">
                      {s.critical_defects > 0 ? (
                        <span className="text-red-600 font-bold">{s.critical_defects}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">{fmt(s.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function StationMonitoringDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCode = searchParams.get('station') || '';
  const activeTab = searchParams.get('tab') || 'inspections';

  const [overview, setOverview] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [window, setWindow] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getStationsOverview(window)
      .then((data) => { setOverview(data); setLastRefresh(new Date()); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [window]);

  useEffect(() => {
    if (!selectedCode) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    getStationDetail(selectedCode)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedCode]);

  const setStation = (code) => {
    if (!code) {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ station: code, tab: activeTab }, { replace: true });
  };

  const setTab = (tab) => {
    if (!selectedCode) return;
    setSearchParams(tab === 'inspections' ? { station: selectedCode } : { station: selectedCode, tab }, { replace: true });
  };

  const stationName = detail?.station_name || null;

  return (
    <div className="p-5 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-base font-extrabold uppercase tracking-wider">Stations Command Center</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last refresh: {lastRefresh ? lastRefresh.toLocaleTimeString() : '-'} · Auto-refreshes on demand
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedCode} onValueChange={setStation}>
            <SelectTrigger className="text-xs h-8 w-56">
              <SelectValue placeholder="Select station" />
            </SelectTrigger>
            <SelectContent>
              {overview.map((station) => (
                <SelectItem key={station.station_code} value={station.station_code}>
                  {station.station_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCode && detail?.status && (
            <Badge variant="secondary" className="text-xs gap-1.5">
              <MapPin className="w-3 h-3" /> {detail.station_code}
            </Badge>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!selectedCode ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50">
          <Train className="w-10 h-10 text-slate-300" />
          <p className="text-sm font-bold text-muted-foreground">Please select a station</p>
          <p className="text-xs text-muted-foreground">Choose a station from the dropdown above to view its inspections, defects, reports, and history.</p>
        </div>
      ) : detailLoading ? (
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading station workspace...</span>
        </div>
      ) : !detail ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Station not found.</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{detail.station_code}</p>
                <h2 className="text-lg font-black text-slate-800 leading-tight">{detail.station_name}</h2>
              </div>
              {detail.status && <StatusBadge status={detail.status} />}
              {detail.edge_machine && (
                <div className="ml-auto flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <Server className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">{detail.edge_machine.hostname}</p>
                    <p className="text-[10px] text-slate-400">{detail.edge_machine.ip_address ?? '-'}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto mt-4 border-t border-slate-100 pt-3">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${
                      active
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-[420px]">
            {activeTab === 'inspections' && <Sessions lockedStation={stationName} />}
            {activeTab === 'defects' && <DefectAlertConsole lockedStation={stationName} />}
            {activeTab === 'reports' && <Reports lockedStation={stationName} />}
            {activeTab === 'history' && <TrainPassageHistory lockedStation={stationName} />}
          </div>
        </>
      )}
    </div>
  );
}
