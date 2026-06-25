import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStationsOverview, getStationDetail } from '../lib/api';
import {
  MapPin, Wifi, WifiOff, AlertTriangle, Camera, Activity,
  ChevronLeft, RefreshCw, Server, Clock, Train,
} from 'lucide-react';

const STATUS_CONFIG = {
  online:   { label: 'Online',   bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  border: 'border-green-200' },
  degraded: { label: 'Degraded', bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500',  border: 'border-amber-200' },
  offline:  { label: 'Offline',  bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500',    border: 'border-red-200'   },
  unknown:  { label: 'Unknown',  bg: 'bg-slate-100',  text: 'text-slate-600',  dot: 'bg-slate-400',  border: 'border-slate-200' },
};

const CAM_STATUS = {
  healthy:  { dot: 'bg-green-500', label: 'Healthy' },
  degraded: { dot: 'bg-amber-500', label: 'Degraded' },
  offline:  { dot: 'bg-red-500',   label: 'Offline' },
  unknown:  { dot: 'bg-slate-400', label: 'Unknown' },
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
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

function StationCard({ station, onClick }) {
  const cfg = STATUS_CONFIG[station.status] ?? STATUS_CONFIG.unknown;
  return (
    <button
      onClick={onClick}
      className={`text-left w-full bg-white border-2 ${cfg.border} rounded-xl p-5 hover:shadow-md transition-all group`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">{station.station_code}</p>
          <h3 className="text-sm font-bold text-slate-800 leading-tight">{station.station_name}</h3>
        </div>
        <StatusBadge status={station.status} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <p className="text-lg font-bold text-slate-800">{station.total_cameras}</p>
          <p className="text-[10px] text-slate-400 uppercase">Cameras</p>
        </div>
        <div className="text-center border-x border-slate-100">
          <p className="text-lg font-bold text-slate-800">{station.active_cameras}</p>
          <p className="text-[10px] text-slate-400 uppercase">Active</p>
        </div>
        <div className="text-center">
          <p className={`text-lg font-bold ${station.active_sessions > 0 ? 'text-blue-600' : 'text-slate-800'}`}>
            {station.active_sessions}
          </p>
          <p className="text-[10px] text-slate-400 uppercase">Sessions</p>
        </div>
      </div>

      <div className="mb-2">
        <p className="text-[10px] text-slate-400 uppercase mb-1">Camera Uptime</p>
        <UptimeBar pct={station.avg_uptime_pct} />
      </div>

      {station.edge_machine && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
          <Server className="w-3 h-3 text-slate-400" />
          <span className="text-[10px] text-slate-500">{station.edge_machine.hostname}</span>
          <span className="ml-auto text-[10px] text-slate-400">{station.edge_machine.ip_address ?? '—'}</span>
        </div>
      )}

      {station.last_inspection && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <Clock className="w-3 h-3 text-slate-400" />
          <span className="text-[10px] text-slate-400">Last: {fmt(station.last_inspection.started_at)}</span>
        </div>
      )}
    </button>
  );
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
        <>
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-primary hover:underline mb-4">
            <ChevronLeft className="w-4 h-4" /> All Stations
          </button>

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
                  <p className="text-[10px] text-slate-400">{detail.edge_machine.ip_address ?? '—'}</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Cameras */}
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

      {/* Recent Sessions */}
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
                    <td className="px-3 py-2.5 text-slate-500">{s.session_code ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        s.status === 'completed' ? 'bg-green-100 text-green-700' :
                        s.status === 'active' || s.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                        s.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{s.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{s.health_score != null ? `${Number(s.health_score).toFixed(1)}%` : '—'}</td>
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
  const [overview, setOverview] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getStationsOverview()
      .then((data) => { setOverview(data); setLastRefresh(new Date()); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const counts = {
    total:    overview.length,
    online:   overview.filter((s) => s.status === 'online').length,
    degraded: overview.filter((s) => s.status === 'degraded').length,
    offline:  overview.filter((s) => s.status === 'offline').length,
    sessions: overview.reduce((sum, s) => sum + s.active_sessions, 0),
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" /> Station Monitoring Dashboard
          </h1>
          {lastRefresh && (
            <p className="text-xs text-slate-400 mt-0.5">
              Last updated {lastRefresh.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* KPI Strip */}
      {!selected && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total Stations', value: counts.total, icon: MapPin, color: 'text-slate-600' },
            { label: 'Online',  value: counts.online,   icon: Wifi,          color: 'text-green-600' },
            { label: 'Degraded', value: counts.degraded, icon: AlertTriangle, color: 'text-amber-600' },
            { label: 'Offline', value: counts.offline,  icon: WifiOff,       color: 'text-red-600'   },
            { label: 'Active Sessions', value: counts.sessions, icon: Activity, color: 'text-blue-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-[10px] text-slate-400 uppercase font-bold">{label}</span>
              </div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Content */}
      {selected ? (
        <DetailPanel code={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-slate-100 rounded-xl h-48 animate-pulse" />
              ))}
            </div>
          ) : overview.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No stations configured.</p>
              <p className="text-slate-400 text-sm mt-1">Add camera setups to see stations here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {overview.map((station) => (
                <StationCard
                  key={station.id}
                  station={station}
                  onClick={() => navigate(`/stations/${station.station_code}`)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
