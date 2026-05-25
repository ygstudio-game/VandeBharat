import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Search, Filter, Eye, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, X, MapPin, Train } from 'lucide-react';

// Renders the expanded inline preview for a single row
const ExpandedRow = ({ row, frameComponents, colCount }) => {
  const imgRef = useRef(null);
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !img.naturalWidth) return;
    const sw = img.offsetWidth / img.naturalWidth;
    const sh = img.offsetHeight / img.naturalHeight;
    canvas.width = img.offsetWidth;
    canvas.height = img.offsetHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Defect boxes — flat bbox_x/y/w/h from frame.defects
    (row.frame.defects || []).forEach(d => {
      if (d.bbox_x == null) return;
      const x = d.bbox_x * sw, y = d.bbox_y * sh;
      const w = d.bbox_w * sw, h = d.bbox_h * sh;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(239,68,68,0.12)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(d.defect_type || 'defect', x + 3, y > 14 ? y - 3 : y + 14);
    });

    // Component boxes — nested bbox.x/y/w/h from coachIntel components
    frameComponents.forEach(c => {
      const b = c.bbox;
      if (!b || b.x == null) return;
      const x = b.x * sw, y = b.y * sh;
      const w = b.w * sw, h = b.h * sh;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(59,130,246,0.07)';
      ctx.fillRect(x, y, w, h);
    });
  }, [row, frameComponents]);

  // Redraw when image loads or row changes
  useEffect(() => { draw(); }, [draw]);

  const url = row.frame.cloudinary_url || row.frame.thumbnail_url;

  return (
    <tr className="bg-slate-950">
      <td colSpan={colCount} className="p-0 border-b-2 border-primary/30">
        <div className="flex" style={{ maxHeight: 300 }}>
          {/* Left — image with bbox overlay */}
          <div className="flex-1 bg-slate-900 flex items-center justify-center overflow-hidden p-3">
            {url ? (
              <div className="relative inline-block">
                <img
                  ref={imgRef}
                  src={url}
                  alt={`Frame #${row.frameNum}`}
                  className="block rounded"
                  style={{ maxHeight: 270, maxWidth: '100%', width: 'auto' }}
                  onLoad={draw}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 pointer-events-none rounded"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            ) : (
              <span className="text-slate-500 text-xs font-mono">No image available</span>
            )}
          </div>

          {/* Right — detail panel */}
          <div className="w-60 bg-white border-l border-slate-200 flex flex-col overflow-y-auto shrink-0 p-4 gap-3 text-xs">
            {/* Frame meta */}
            <div className="text-[10px] font-mono text-slate-400 flex flex-wrap gap-2">
              <span>#{row.frameNum}</span>
              <span>·</span>
              <span>{row.timestamp}</span>
              <span>·</span>
              <span>T:{row.triggerId}</span>
            </div>

            {row.hasDefect ? (
              <>
                <div>
                  <div className="text-[9px] font-black uppercase text-red-500 tracking-wider flex items-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3" /> Anomaly Detected
                  </div>
                  <div className="font-bold text-slate-800 text-sm">{row.defect}</div>
                  {row.severity && (
                    <span className={`inline-block mt-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                      row.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {row.severity}
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-[9px] font-black uppercase text-slate-400 mb-1">Confidence</div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full"
                      style={{ width: row.confidence !== '—' ? row.confidence : '0%' }}
                    />
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 mt-0.5">{row.confidence}</div>
                </div>
              </>
            ) : (
              <div>
                <div className="text-[9px] font-black uppercase text-green-600 tracking-wider mb-1">Nominal Status</div>
                {row.detectionCount > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {row.component.split(', ').map((c, i) => (
                      <span key={i} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 text-[10px]">No components detected</span>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
};

const DetectionLogTable = ({ frames = [], components = [], stationName = '—', activeCoach = '—', onViewFrame }) => {
  const [query, setQuery] = useState('');
  const [filterDefects, setFilterDefects] = useState(false);
  const [sortField, setSortField] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedRowId, setExpandedRowId] = useState(null);

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
      location: stationName,
      bogieNo: activeCoach || '—',
      component: componentStr,
      defect: defectStr,
      hasDefect: frameDefects.length > 0,
      severity: frameDefects[0]?.severity ?? null,
      confidence: maxConf > 0 ? `${Math.round(maxConf * 100)}%` : '—',
      detectionCount: frameComponents.length,
      frameComponents,
      frame: f,
    };
  }), [frames, components, stationName, activeCoach]);

  const filtered = useMemo(() => {
    let r = rows;
    const q = query.trim().toLowerCase();
    if (q) r = r.filter(row =>
      row.component.toLowerCase().includes(q) ||
      row.defect.toLowerCase().includes(q) ||
      String(row.frameNum).includes(q) ||
      row.bogieNo.toLowerCase().includes(q) ||
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
    { key: 'frameNum',  label: 'FRAME' },
    { key: 'timestamp', label: 'VIDEO TIME' },
    { key: 'location',  label: 'LOCATION' },
    { key: 'bogieNo',   label: 'BOGIE NO' },
    { key: 'component', label: 'COMPONENT DETECTED' },
    { key: 'defect',    label: 'DEFECT' },
    { key: 'confidence',label: 'CONF' },
    { key: null,        label: '' },
  ];

  const toggleExpand = (rowId) => setExpandedRowId(id => id === rowId ? null : rowId);

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
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400 font-medium italic">
                  {rows.length === 0 ? 'No frames loaded.' : 'No frames match the current filter.'}
                </td>
              </tr>
            ) : filtered.map(row => (
              <React.Fragment key={row.id}>
                <tr
                  className={`transition-colors ${
                    expandedRowId === row.id
                      ? 'bg-slate-100'
                      : row.hasDefect
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

                  {/* Location */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="font-medium">{row.location}</span>
                    </span>
                  </td>

                  {/* Bogie No */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Train className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="font-mono font-bold">{row.bogieNo}</span>
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

                  {/* Confidence */}
                  <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">
                    {row.confidence}
                  </td>

                  {/* View / Close toggle */}
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleExpand(row.id)}
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 border rounded transition-colors ${
                        expandedRowId === row.id
                          ? 'bg-slate-700 text-white border-slate-700'
                          : 'border-slate-200 hover:bg-primary hover:text-white hover:border-primary'
                      }`}
                    >
                      {expandedRowId === row.id
                        ? <><X className="w-3 h-3" /> CLOSE</>
                        : <><Eye className="w-3 h-3" /> VIEW</>
                      }
                    </button>
                  </td>
                </tr>

                {expandedRowId === row.id && (
                  <ExpandedRow
                    row={row}
                    frameComponents={row.frameComponents}
                    colCount={COLS.length}
                  />
                )}
              </React.Fragment>
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
