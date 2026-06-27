import React, { useState, useMemo } from 'react';
import { Search, Filter, Eye, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, MapPin, Train, Camera, ExternalLink, Check, X, Loader2 } from 'lucide-react';

const DetectionLogTable = ({
  frames = [],
  components = [],
  stationName = '—',
  activeCoach = '—',
  trainNumber = '—',
  sessionStartedAt = null,
  onViewFrame = () => {},
  onGoToReport = null,
  rows: rowsOverride = null,
  showActions = true,
  // When provided, renders a "Defect Verification" column with Accept/Reject
  // buttons on EVERY frame row (defect or not). Receives
  // (frameId: string, status: 'confirmed'|'false_positive') and should return a
  // Promise that resolves once the backend review is saved.
  onReviewFrame = null,
}) => {
  const [query, setQuery] = useState('');
  const [filterDefects, setFilterDefects] = useState(false);
  const [sortField, setSortField] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  // frameId -> { status, busy } optimistic verification state
  const [reviewState, setReviewState] = useState({});

  const derivedRows = useMemo(() => frames.map(f => {
    const frameComponents = components.filter(
      c => c.trigger_id === f.trigger_id || c.frame_id === f.id
    );
    const componentStr = frameComponents.length > 0
      ? frameComponents.map(c => c.component_name || c.component_code).join(', ')
      : 'None detected';

    const frameDefects = f.defects || [];
    const defectStr = frameDefects.length > 0
      ? frameDefects.map(d => d.defect_type).join(', ')
      : 'None';

    // Frame-level verification status — every frame carries one, defect or not.
    const reviewStatus = f.review_status || 'pending';

    const allConfs = [
      ...frameComponents.map(c => c.confidence || 0),
      ...frameDefects.map(d => d.confidence || 0),
    ];
    const maxConf = allConfs.length > 0 ? Math.max(...allConfs) : 0;

    const ms = f.captured_at_ms;
    const timestamp = sessionStartedAt && ms != null
      ? new Date(new Date(sessionStartedAt).getTime() + ms).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'medium',
        })
      : ms != null
        ? `${String(Math.floor(ms / 60000)).padStart(2, '0')}m ${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}s`
        : '—';

    return {
      id: f.id,
      imageId: `IMG-${f.sequence_number}`,
      frameNum: f.sequence_number,
      triggerId: f.trigger_id,
      timestamp,
      location: stationName,
      bogieNo: activeCoach || '—',
      trainNo: trainNumber || '—',
      cameraId: f.camera_name || f.camera_type || '—',
      component: componentStr,
      defect: defectStr,
      hasDefect: frameDefects.length > 0,
      reviewStatus,
      severity: frameDefects[0]?.severity ?? null,
      confidence: maxConf > 0 ? `${Math.round(maxConf * 100)}%` : '—',
      detectionCount: frameComponents.length,
      frameComponents,
      frame: f,
    };
  }), [frames, components, stationName, activeCoach, trainNumber, sessionStartedAt]);

  const rows = rowsOverride ?? derivedRows;

  const filtered = useMemo(() => {
    let r = rows;
    const q = query.trim().toLowerCase();
    if (q) r = r.filter(row =>
      row.component.toLowerCase().includes(q) ||
      row.defect.toLowerCase().includes(q) ||
      row.imageId.toLowerCase().includes(q) ||
      row.bogieNo.toLowerCase().includes(q) ||
      row.trainNo.toLowerCase().includes(q) ||
      row.cameraId.toLowerCase().includes(q) ||
      row.location.toLowerCase().includes(q)
    );
    if (filterDefects) r = r.filter(row => row.hasDefect);
    if (sortField) {
      r = [...r].sort((a, b) => {
        const av = String(a[sortField] ?? '').toLowerCase();
        const bv = String(b[sortField] ?? '').toLowerCase();
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return r;
  }, [rows, query, filterDefects, sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) setSortAsc(p => !p);
    else { setSortField(field); setSortAsc(true); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortAsc
      ? <ArrowUp className="w-3 h-3 text-primary" />
      : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  const COLS = [
    { key: 'imageId',   label: 'IMAGE ID' },
    { key: 'timestamp', label: 'DATE & TIME' },
    { key: 'location',  label: 'LOCATION' },
    { key: 'trainNo',   label: 'TRAIN NO' },
    { key: 'bogieNo',   label: 'BOGIE NO' },
    { key: 'cameraId',  label: 'CAMERA' },
    { key: 'component', label: 'COMPONENT' },
    { key: 'defect',    label: 'DEFECT' },
    ...(onReviewFrame ? [{ key: null, label: 'DEFECT VERIFICATION' }] : []),
    ...(showActions ? [{ key: null, label: '' }] : []),
  ];

  const handleReview = async (row, status) => {
    if (!onReviewFrame) return;
    setReviewState(prev => ({ ...prev, [row.id]: { status: prev[row.id]?.status, busy: true } }));
    try {
      await onReviewFrame(row.id, status);
      setReviewState(prev => ({ ...prev, [row.id]: { status, busy: false } }));
    } catch {
      setReviewState(prev => ({ ...prev, [row.id]: { status: prev[row.id]?.status, busy: false } }));
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden flex-1 min-h-0">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50 shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-800">
            DETECTION LOG
          </h3>
          <span className="text-[10px] font-mono font-bold text-slate-400">
            {rows.filter(r => r.hasDefect).length} defect frame{rows.filter(r => r.hasDefect).length !== 1 ? 's' : ''}
          </span>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="pl-8 pr-3 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-primary w-52 text-slate-800 placeholder-slate-400"
              placeholder="Search component, defect, frame…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setFilterDefects(p => !p)}
            className={`px-2.5 py-1 text-[10px] font-bold border rounded transition-colors ${
              filterDefects
                ? 'bg-red-600 text-white border-red-600'
                : 'border-slate-200 hover:bg-slate-100 text-slate-600'
            }`}
          >
            {filterDefects ? 'DEFECTS ONLY ✓' : 'ALL FRAMES'}
          </button>
          <button
            onClick={() => { setQuery(''); setFilterDefects(false); setSortField(null); }}
            className="p-1 hover:bg-slate-100 rounded text-slate-400 transition-colors"
            title="Clear filters"
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1" style={{ minHeight: 0 }}>
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-200">
              {COLS.map(col => (
                <th
                  key={col.label}
                  className={`px-3 py-2 whitespace-nowrap ${col.key ? 'cursor-pointer hover:text-primary select-none' : ''}`}
                  onClick={col.key ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.key && <SortIcon field={col.key} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-xs divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="px-3 py-8 text-center text-slate-400 font-medium italic">
                  {rows.length === 0 ? 'No frames loaded.' : 'No frames match the current filter.'}
                </td>
              </tr>
            ) : filtered.map(row => (
              <tr
                key={row.id}
                className={`transition-colors ${
                  row.hasDefect
                    ? 'bg-red-50 hover:bg-red-100 border-red-200'
                    : 'hover:bg-slate-50'
                }`}
              >
                  {/* Image ID */}
                  <td className="px-3 py-2 font-mono font-bold text-slate-700 whitespace-nowrap">
                    {row.imageId}
                  </td>

                  {/* Date & Time */}
                  <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">
                    {row.timestamp}
                  </td>

                  {/* Location */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="font-medium">{row.location}</span>
                    </span>
                  </td>

                  {/* Train No */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Train className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="font-mono font-bold">{row.trainNo}</span>
                    </span>
                  </td>

                  {/* Bogie No */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono font-bold text-slate-600">{row.bogieNo}</span>
                  </td>

                  {/* Camera */}
                  <td className="px-3 py-2 max-w-[80px]">
                    <span className="flex items-center gap-1 text-slate-600 min-w-0">
                      <Camera className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="font-mono truncate min-w-0" title={row.cameraId}>{row.cameraId}</span>
                    </span>
                  </td>

                  {/* Component */}
                  <td className="px-3 py-2 max-w-[220px]">
                    <span className="block truncate font-medium text-slate-700" title={row.component}>
                      {row.component}
                    </span>
                    {row.detectionCount > 0 && (
                      <span className="text-[9px] font-bold text-slate-400">
                        {row.detectionCount} label{row.detectionCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </td>

                  {/* Defect */}
                  <td className="px-3 py-2 max-w-[160px]">
                    {row.hasDefect ? (
                      <div>
                        <span className="flex items-center gap-1 text-red-600 font-bold truncate" title={row.defect}>
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span className="truncate">{row.defect}</span>
                        </span>
                        {row.severity && (
                          <span className={`text-[9px] font-black uppercase ${
                            row.severity === 'CRITICAL' ? 'text-red-700' : 'text-amber-600'
                          }`}>
                            {row.severity}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">None</span>
                    )}
                  </td>

                  {/* Defect Verification — Accept / Reject (every frame) */}
                  {onReviewFrame && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {(() => {
                        const live = reviewState[row.id];
                        const status = live?.status ?? row.reviewStatus;
                        const busy = live?.busy;
                        if (busy) {
                          return <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />;
                        }
                        if (status === 'confirmed') {
                          return (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Check className="w-3 h-3" /> Accepted
                            </span>
                          );
                        }
                        if (status === 'false_positive') {
                          return (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded bg-slate-100 text-slate-500 border border-slate-200">
                              <X className="w-3 h-3" /> Rejected
                            </span>
                          );
                        }
                        return (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleReview(row, 'confirmed')}
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 border rounded transition-colors border-emerald-200 text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600"
                              title="Accept defect (confirmed)"
                            >
                              <Check className="w-3 h-3" /> ACCEPT
                            </button>
                            <button
                              onClick={() => handleReview(row, 'false_positive')}
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 border rounded transition-colors border-red-200 text-red-700 hover:bg-red-600 hover:text-white hover:border-red-600"
                              title="Reject defect (false positive)"
                            >
                              <X className="w-3 h-3" /> REJECT
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                  )}

                  {/* Actions */}
                  {showActions && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onViewFrame(row.frame ?? row)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 border rounded transition-colors border-slate-200 hover:bg-primary hover:text-white hover:border-primary"
                        >
                          <Eye className="w-3 h-3" /> VIEW
                        </button>
                        {onGoToReport && (
                          <button
                            onClick={() => onGoToReport(row)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 border rounded transition-colors border-slate-200 hover:bg-slate-700 hover:text-white hover:border-slate-700"
                            title="Open full report"
                          >
                            <ExternalLink className="w-3 h-3" /> REPORT
                          </button>
                        )}
                      </div>
                    </td>
                  )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-50 text-[10px] font-mono font-bold text-slate-400 shrink-0">
        {filtered.length} / {rows.length} frames shown
        {filterDefects && ' · defects only'}
        {query && ` · filtered by "${query}"`}
      </div>
    </div>
  );
};

export default DetectionLogTable;
