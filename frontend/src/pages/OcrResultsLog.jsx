import React, { useState, useEffect, useCallback } from 'react';
import { Search, Download, CheckCircle2, XCircle, ImageOff } from 'lucide-react';
import { getOcrResults } from '../lib/api';
import { exportToCSV, exportToJSON } from '../lib/export';

const PAGE_SIZE = 50;

export const OcrResultsLog = () => {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [coachNumber, setCoachNumber] = useState('');
  const [minConfidence, setMinConfidence] = useState('');
  const [validOnly, setValidOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOcrResults({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        coachNumber,
        minConfidence,
        validOnly: validOnly ? 'true' : '',
      });
      setRows(data.results || []);
      setTotal(data.total || 0);
    } catch {
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, coachNumber, minConfidence, validOnly]);

  useEffect(() => { load(); }, [load]);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    setPage(0);
    load();
  };

  const exportRows = rows.map((r) => ({
    coach_number: r.coach_number ?? '',
    detected_text: r.detected_text ?? '',
    confidence: r.confidence ?? '',
    is_valid: r.is_valid,
    train_number: r.train_number ?? '',
    session_code: r.session_code ?? '',
    created_at: r.created_at,
  }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">COACH NUMBER LOG</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All recognised coach numbers with confidence and raw image.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportToCSV(exportRows, 'ocr_results.csv')}
            disabled={!rows.length}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 border border-border rounded hover:bg-secondary disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={() => exportToJSON(exportRows, 'ocr_results.json')}
            disabled={!rows.length}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 border border-border rounded hover:bg-secondary disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> JSON
          </button>
        </div>
      </div>

      <form onSubmit={handleFilterSubmit} className="flex flex-wrap items-center gap-3 bg-card border border-border rounded p-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={coachNumber}
            onChange={(e) => setCoachNumber(e.target.value)}
            placeholder="Coach number…"
            className="pl-8 pr-3 py-1.5 bg-white border border-border rounded text-xs w-48 focus:outline-none focus:border-primary"
          />
        </div>
        <input
          type="number"
          step="0.05"
          min="0"
          max="1"
          value={minConfidence}
          onChange={(e) => setMinConfidence(e.target.value)}
          placeholder="Min confidence (0-1)"
          className="px-3 py-1.5 bg-white border border-border rounded text-xs w-40 focus:outline-none focus:border-primary"
        />
        <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <input type="checkbox" checked={validOnly} onChange={(e) => setValidOnly(e.target.checked)} />
          Valid only
        </label>
        <button type="submit" className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded uppercase">
          Apply
        </button>
      </form>

      <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-border text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                <th className="p-3">Thumbnail</th>
                <th className="p-3">Coach Number</th>
                <th className="p-3">Detected Text</th>
                <th className="p-3">Confidence</th>
                <th className="p-3">Valid</th>
                <th className="p-3">Train</th>
                <th className="p-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No coach number readings found.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/50">
                  <td className="p-3">
                    {r.thumbnail_url || r.frame_url ? (
                      <img src={r.thumbnail_url || r.frame_url} alt="" className="w-14 h-10 object-cover rounded border border-border" />
                    ) : (
                      <div className="w-14 h-10 flex items-center justify-center bg-slate-100 rounded border border-border">
                        <ImageOff className="w-4 h-4 text-slate-400" />
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-mono font-bold text-foreground">{r.coach_number || '—'}</td>
                  <td className="p-3 font-mono text-muted-foreground">{r.detected_text || '—'}</td>
                  <td className="p-3 font-mono font-bold">
                    {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '—'}
                  </td>
                  <td className="p-3">
                    {r.is_valid
                      ? <CheckCircle2 className="w-4 h-4 text-success" />
                      : <XCircle className="w-4 h-4 text-destructive" />}
                  </td>
                  <td className="p-3 font-mono">{r.train_number || '—'}</td>
                  <td className="p-3 font-mono text-muted-foreground">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-slate-50 text-[10px] font-mono font-bold text-muted-foreground">
          <span>{total} total results</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-2 py-1 border border-border rounded disabled:opacity-40"
            >
              Prev
            </button>
            <span>Page {page + 1} / {totalPages}</span>
            <button
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2 py-1 border border-border rounded disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
