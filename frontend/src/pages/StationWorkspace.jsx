import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, MapPin, Server, RefreshCw, LayoutDashboard, Train, ShieldAlert, ScanText, FileText, History } from 'lucide-react';
import { getStationDetail } from '../lib/api';
import { DetailPanel } from './StationMonitoringDashboard';
import { Sessions } from './Sessions';
import { DefectAlertConsole } from './DefectAlertConsole';
import { OcrResultsLog } from './OcrResultsLog';
import { Reports } from './Reports';
import { TrainPassageHistory } from './TrainPassageHistory';

const TABS = [
  { key: 'inspections',  label: 'Inspections',     icon: Train },
  { key: 'defects',      label: 'Defect Alerts',   icon: ShieldAlert },
  { key: 'reports',      label: 'Reports',         icon: FileText },
  { key: 'history',      label: 'Train History',   icon: History },
];

const STATUS_BADGE = {
  online:   'bg-green-100 text-green-700',
  degraded: 'bg-amber-100 text-amber-700',
  offline:  'bg-red-100 text-red-700',
  unknown:  'bg-slate-100 text-slate-600',
};

export function StationWorkspace() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'inspections';

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getStationDetail(code).then(setDetail).finally(() => setLoading(false));
  }, [code]);

  const setTab = (key) => setSearchParams(key === 'inspections' ? {} : { tab: key }, { replace: true });

  const stationName = detail?.station_name || null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <button onClick={() => navigate('/stations')} className="flex items-center gap-2 text-sm text-primary hover:underline mb-4">
          <ChevronLeft className="w-4 h-4" /> All Stations
        </button>
        <p className="text-slate-500">Station not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Sticky station header + tabs */}
      <div className="sticky top-0 z-20 bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <button
            onClick={() => navigate('/stations')}
            className="flex items-center gap-2 text-xs font-bold text-primary hover:underline mb-3"
          >
            <ChevronLeft className="w-4 h-4" /> All Stations
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{detail.station_code}</p>
              <h1 className="text-lg font-black text-slate-800 leading-tight">{detail.station_name}</h1>
            </div>
            {detail.status && (
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_BADGE[detail.status] || STATUS_BADGE.unknown}`}>
                {detail.status}
              </span>
            )}
            {detail.edge_machine && (
              <div className="ml-auto flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                <Server className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-xs font-bold text-slate-700">{detail.edge_machine.hostname}</p>
                  <p className="text-[10px] text-slate-400">{detail.edge_machine.ip_address ?? '—'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto">
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
      </div>

      {/* Tab content — pages locked to this station */}
      <div className="flex-1">
        {activeTab === 'overview' && (
          <div className="p-6 max-w-7xl mx-auto">
            <DetailPanel code={code} hideHeader />
          </div>
        )}
        {activeTab === 'inspections' && <Sessions lockedStation={stationName} />}
        {activeTab === 'defects'     && <DefectAlertConsole lockedStation={stationName} />}
        {activeTab === 'coach-log'   && <OcrResultsLog lockedStation={stationName} />}
        {activeTab === 'reports'     && <Reports lockedStation={stationName} />}
        {activeTab === 'history'      && <TrainPassageHistory lockedStation={stationName} />}
      </div>
    </div>
  );
}
