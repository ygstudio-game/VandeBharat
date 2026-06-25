import React, { useState, useEffect, useCallback } from 'react';
import { CalendarClock, RefreshCw, ShieldQuestion, FlagOff, Flag, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getPeriodicReports, generatePeriodicReport, getReviewLog, addReviewLogEntry, getStations } from '../../lib/api';

const PERIOD_LABELS = { shift: 'Shift', day: 'Day', week: 'Week' };

function PeriodicReportCard({ report }) {
  if (!report) {
    return (
      <Card className="border border-border shadow-sm">
        <CardContent className="p-6 text-center text-muted-foreground text-xs">
          No report generated for this period yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-700">
          {PERIOD_LABELS[report.period_type]} — {new Date(report.period_start).toLocaleDateString()}
        </CardTitle>
        <CardDescription className="text-[10px]">
          {new Date(report.period_start).toLocaleString()} → {new Date(report.period_end).toLocaleString()}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-[9px] font-bold text-muted-foreground uppercase">Sessions</div>
          <div className="font-mono font-black">{report.completed_sessions} / {report.total_sessions}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-muted-foreground uppercase">System Uptime</div>
          <div className="font-mono font-black">{report.system_uptime_pct != null ? `${report.system_uptime_pct}%` : '—'}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-muted-foreground uppercase">Total Defects</div>
          <div className="font-mono font-black">{report.total_defects} ({report.critical_defects} crit)</div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-muted-foreground uppercase">FP / FN</div>
          <div className="font-mono font-black">
            <span className="text-amber-600">{report.false_positive_count}</span> / <span className="text-red-600">{report.false_negative_count}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const PeriodicReportsPanel = () => {
  const [latest, setLatest] = useState({ shift: null, day: null, week: null });
  const [generating, setGenerating] = useState(null);
  const [reviewEntries, setReviewEntries] = useState([]);
  const [showLogForm, setShowLogForm] = useState(false);
  const [form, setForm] = useState({ session_id: '', log_type: 'false_positive', coach_number: '', defect_type: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [reviewFilters, setReviewFilters] = useState({ trainNumber: '', station: '', date: '' });
  const [stationOptions, setStationOptions] = useState([]);

  useEffect(() => {
    getStations()
      .then((list) => setStationOptions((list || []).map((s) => s.station_name).filter(Boolean)))
      .catch(() => setStationOptions([]));
  }, []);

  const loadReviewLog = useCallback(async (f = reviewFilters) => {
    try {
      const log = await getReviewLog({
        limit: 20,
        trainNumber: f.trainNumber,
        station: f.station,
        date: f.date,
      });
      setReviewEntries(log.entries || []);
    } catch { /* ignore */ }
  }, [reviewFilters]);

  const load = useCallback(async () => {
    for (const periodType of ['shift', 'day', 'week']) {
      try {
        const data = await getPeriodicReports({ periodType, limit: 1 });
        setLatest((prev) => ({ ...prev, [periodType]: data.reports?.[0] || null }));
      } catch { /* ignore */ }
    }
    await loadReviewLog();
  }, [loadReviewLog]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async (periodType) => {
    setGenerating(periodType);
    try {
      await generatePeriodicReport(periodType);
      await load();
    } catch { /* ignore */ } finally {
      setGenerating(null);
    }
  };

  const handleSubmitLog = async (e) => {
    e.preventDefault();
    if (!form.session_id.trim()) return;
    setSubmitting(true);
    try {
      await addReviewLogEntry(form.session_id.trim(), {
        log_type: form.log_type,
        coach_number: form.coach_number || undefined,
        defect_type: form.defect_type || undefined,
        notes: form.notes || undefined,
      });
      setForm({ session_id: '', log_type: 'false_positive', coach_number: '', defect_type: '', notes: '' });
      setShowLogForm(false);
      await loadReviewLog();
    } catch { /* ignore */ } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
            <CalendarClock className="w-4 h-4 text-primary" /> Auto-Generated Periodic Reports
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Generated automatically when each shift/day/week rolls over. Includes FP/FN log totals and a system uptime proxy.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['shift', 'day', 'week'].map((periodType) => (
          <div key={periodType} className="space-y-2">
            <PeriodicReportCard report={latest[periodType]} />
            <button
              onClick={() => handleGenerate(periodType)}
              disabled={generating === periodType}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold px-2 py-1.5 border border-border rounded hover:bg-secondary disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${generating === periodType ? 'animate-spin' : ''}`} />
              Generate Now ({PERIOD_LABELS[periodType]})
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
          <ShieldQuestion className="w-4 h-4 text-primary" /> Defect Review Log (FP / FN)
        </h3>
        <button
          onClick={() => setShowLogForm((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 border border-border rounded hover:bg-secondary"
        >
          <Plus className="w-3.5 h-3.5" /> Log Entry
        </button>
      </div>

      {showLogForm && (
        <form onSubmit={handleSubmitLog} className="bg-card border border-border rounded p-4 space-y-3">
          <p className="text-[10px] text-muted-foreground">
            Paste a session ID from the table below to log inspector feedback (a false positive AI flagged, or a missed defect found on physical inspection).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              required
              value={form.session_id}
              onChange={(e) => setForm((f) => ({ ...f, session_id: e.target.value }))}
              placeholder="Session ID"
              className="px-3 py-2 border border-border rounded text-xs font-mono focus:outline-none focus:border-primary"
            />
            <select
              value={form.log_type}
              onChange={(e) => setForm((f) => ({ ...f, log_type: e.target.value }))}
              className="px-3 py-2 border border-border rounded text-xs focus:outline-none focus:border-primary"
            >
              <option value="false_positive">False Positive</option>
              <option value="false_negative">False Negative (missed defect)</option>
              <option value="confirmed">Confirmed Correct</option>
            </select>
            <input
              value={form.coach_number}
              onChange={(e) => setForm((f) => ({ ...f, coach_number: e.target.value }))}
              placeholder="Coach number (optional)"
              className="px-3 py-2 border border-border rounded text-xs focus:outline-none focus:border-primary"
            />
            <input
              value={form.defect_type}
              onChange={(e) => setForm((f) => ({ ...f, defect_type: e.target.value }))}
              placeholder="Defect type (optional)"
              className="px-3 py-2 border border-border rounded text-xs focus:outline-none focus:border-primary"
            />
          </div>
          <input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (optional)"
            className="w-full px-3 py-2 border border-border rounded text-xs focus:outline-none focus:border-primary"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowLogForm(false)} className="text-xs font-bold px-3 py-1.5 border border-border rounded hover:bg-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="text-xs font-bold px-3 py-1.5 bg-primary text-primary-foreground rounded disabled:opacity-50">
              {submitting ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </form>
      )}

      {/* Review log filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={reviewFilters.trainNumber}
          onChange={(e) => setReviewFilters((f) => ({ ...f, trainNumber: e.target.value }))}
          placeholder="Train number…"
          className="px-3 py-1.5 border border-border rounded text-xs focus:outline-none focus:border-primary w-40"
        />
        <select
          value={reviewFilters.station}
          onChange={(e) => setReviewFilters((f) => ({ ...f, station: e.target.value }))}
          className="px-3 py-1.5 border border-border rounded text-xs focus:outline-none focus:border-primary"
        >
          <option value="">All stations</option>
          {stationOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="date"
          value={reviewFilters.date}
          onChange={(e) => setReviewFilters((f) => ({ ...f, date: e.target.value }))}
          className="px-3 py-1.5 border border-border rounded text-xs focus:outline-none focus:border-primary"
        />
        {(reviewFilters.trainNumber || reviewFilters.station || reviewFilters.date) && (
          <button
            onClick={() => setReviewFilters({ trainNumber: '', station: '', date: '' })}
            className="text-xs font-bold px-3 py-1.5 border border-border rounded hover:bg-secondary"
          >
            Clear
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded shadow-sm overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              <th className="p-3">Type</th>
              <th className="p-3">Train</th>
              <th className="p-3">Station</th>
              <th className="p-3">Coach</th>
              <th className="p-3">Defect Type</th>
              <th className="p-3">Notes</th>
              <th className="p-3">Logged</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {reviewEntries.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground italic">No FP/FN entries logged yet.</td></tr>
            ) : reviewEntries.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50/50">
                <td className="p-3">
                  {e.log_type === 'false_positive' ? (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      <FlagOff className="w-3 h-3" /> FALSE POSITIVE
                    </span>
                  ) : e.log_type === 'false_negative' ? (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                      <Flag className="w-3 h-3" /> FALSE NEGATIVE
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      CONFIRMED
                    </span>
                  )}
                </td>
                <td className="p-3 font-mono">{e.train_number || '—'}</td>
                <td className="p-3 font-semibold text-muted-foreground">{e.station_name || '—'}</td>
                <td className="p-3 font-mono">{e.coach_number || '—'}</td>
                <td className="p-3 font-mono text-muted-foreground">{e.defect_type || '—'}</td>
                <td className="p-3 max-w-[260px] truncate" title={e.notes}>{e.notes || '—'}</td>
                <td className="p-3 font-mono text-muted-foreground">{new Date(e.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
