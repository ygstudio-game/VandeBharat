import React, { useState, useMemo } from 'react';
import { Search, Filter, Eye, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';

/**
 * Frame-level detection log — one row per frame.
 * Components detected at that frame come from the coachIntel array (joined by trigger_id / frame_id).
 * Defects come from frame.defects (already attached by the API).
 */
const DetectionLogTable = ({ frames = [], components = [], onViewFrame }) => {
  const [query, setQuery] = useState('');
  const [filterDefects, setFilterDefects] = useState(false);
  const [sortField, setSortField] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const rows = useMemo(() => frames.map(f => {
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

    const allConfs = [
      ...frameComponents.map(c => c.confidence || 0),
      ...frameDefects.map(d => d.confidence || 0),
    ];
    const maxConf = allConfs.length > 0 ? Math.max(...allConfs) : 0;

    const ms = f.captured_at_ms;
    const timestamp = ms != null
      ? `${String(Math.floor(ms / 60000)).padStart(2, '0')}m ${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}s`
      : '—';

    return {
      id: f.id,
      frameNum: f.sequence_number,
      triggerId: f.trigger_id,
      timestamp,
      component: componentStr,
      defect: defectStr,
      hasDefect: frameDefects.length > 0,
      severity: frameDefects[0]?.severity ?? null,
      confidence: maxConf > 0 ? `${Math.round(maxConf * 100)}%` : '—',
      detectionCount: frameComponents.length,
      frame: f,
    };
  }), [frames, components]);

  const filtered = useMemo(() => {
    let r = rows;
    const q = query.trim().toLowerCase();
    if (q) r = r.filter(row =>
      row.component.toLowerCase().includes(q) ||
      row.defect.toLowerCase().includes(q) ||
      String(row.frameNum).includes(q)
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
    { key: 'frameNum',  label: 'FRAME' },
    { key: 'timestamp', label: 'VIDEO TIME' },
    { key: 'component', label: 'COMPONENT DETECTED' },
    { key: 'defect',    label: 'DEFECT' },
    { key: 'confidence',label: 'CONF' },
    { key: null,        label: '' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
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
      <div className="overflow-auto" style={{ maxHeight: 380 }}>
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
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400 font-medium italic">
                  {rows.length === 0 ? 'No frames loaded.' : 'No frames match the current filter.'}
                </td>
              </tr>
            ) : filtered.map(row => (
              <tr
                key={row.id}
                className={`transition-colors ${
                  row.hasDefect
                    ? 'bg-red-50 hover:bg-red-100 border-red-100'
                    : 'hover:bg-slate-50'
                }`}
              >
                {/* Frame # */}
                <td className="px-3 py-2 font-mono font-bold text-slate-700 whitespace-nowrap">
                  #{row.frameNum}
                </td>

                {/* Video timestamp */}
                <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">
                  {row.timestamp}
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

                {/* Confidence */}
                <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">
                  {row.confidence}
                </td>

                {/* View */}
                <td className="px-3 py-2">
                  <button
                    onClick={() => onViewFrame?.(row.frame)}
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 border border-slate-200 rounded hover:bg-primary hover:text-white hover:border-primary transition-colors"
                  >
                    <Eye className="w-3 h-3" /> VIEW
                  </button>
                </td>
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
