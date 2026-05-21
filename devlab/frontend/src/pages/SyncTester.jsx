import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SessionPicker from '../components/SessionPicker';
import ResultPanel from '../components/ResultPanel';
import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react';

export default function SyncTester() {
  const [params, setParams] = useSearchParams();
  const [session, setSession] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [runs, setRuns] = useState([]);
  const [running, setRunning] = useState(false);
  const [activeRun, setActiveRun] = useState(null);

  useEffect(() => {
    if (!session) return;
    fetch(`/api/dev/sessions/${session.id}/coaches`)
      .then((r) => r.json())
      .then(setCoaches);
    fetch(`/api/dev/sync/runs/${session.id}`)
      .then((r) => r.json())
      .then(setRuns);
  }, [session]);

  function handleSessionChange(s) {
    setSession(s);
    setParams({ session: s.id });
  }

  async function runSync() {
    if (!session) return;
    setRunning(true);
    setActiveRun(null);
    try {
      const res = await fetch('/api/dev/sync/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      });
      const data = await res.json();
      setActiveRun(data);
      setRuns((prev) => [{ output_json: data.result, created_at: new Date().toISOString() }, ...prev]);
      // Refresh coaches after sync
      fetch(`/api/dev/sessions/${session.id}/coaches`)
        .then((r) => r.json())
        .then(setCoaches);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw size={16} className="text-purple-400" />
          <h1 className="text-sm font-semibold text-gray-100">Sync Tester</h1>
        </div>
        <SessionPicker value={session} onChange={handleSessionChange} />
      </div>

      {session && (
        <>
          {/* Warning */}
          <div className="flex items-start gap-2 text-xs text-yellow-400 border border-yellow-800 bg-yellow-950/30 rounded p-3">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            <span>
              Re-running sync will update <code>pipeline_stages</code>, recreate <code>coaches</code>,
              and set session status to <code>analysing</code> — identical to the main pipeline.
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={runSync}
              disabled={running}
              className="flex items-center gap-2 px-4 py-1.5 text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
            >
              {running ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              Re-run Sync Engine
            </button>
            {running && (
              <span className="text-xs text-gray-500 animate-pulse">Running sync…</span>
            )}
          </div>

          {/* Current coaches */}
          {coaches.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Current coaches ({coaches.length})</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-500">
                      <th className="text-left py-1.5 pr-4">Coach #</th>
                      <th className="text-left py-1.5 pr-4">Type</th>
                      <th className="text-left py-1.5 pr-4">Frames</th>
                      <th className="text-left py-1.5 pr-4">OCR conf</th>
                      <th className="text-left py-1.5 pr-4">Sync conf</th>
                      <th className="text-left py-1.5">Trigger range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coaches.map((c) => (
                      <tr key={c.id} className="border-b border-gray-900 hover:bg-gray-900/50">
                        <td className="py-1.5 pr-4 text-gray-100 font-medium">{c.coach_number}</td>
                        <td className="py-1.5 pr-4 text-gray-400">{c.coach_type ?? '—'}</td>
                        <td className="py-1.5 pr-4 text-gray-400">{c.total_frames}</td>
                        <td className="py-1.5 pr-4 text-gray-400">
                          {c.ocr_confidence ? Number(c.ocr_confidence).toFixed(3) : '—'}
                        </td>
                        <td className="py-1.5 pr-4 text-gray-400">
                          {c.sync_confidence ? Number(c.sync_confidence).toFixed(3) : '—'}
                        </td>
                        <td className="py-1.5 text-gray-600 text-[11px]">
                          {c.start_trigger_id?.toString() ?? '?'} → {c.end_trigger_id?.toString() ?? '?'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Active run result */}
          {activeRun && (
            <ResultPanel
              title={`Sync result — ${new Date().toLocaleTimeString()}`}
              data={activeRun.result}
              error={activeRun.error}
            />
          )}

          {/* Past runs */}
          {runs.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Past dev sync runs ({runs.length})</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {runs.map((r, i) => (
                  <div key={i} className="border border-gray-800 rounded p-2 bg-gray-900">
                    <p className="text-xs text-gray-600 mb-1">
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                    <pre className="text-xs text-gray-400 whitespace-pre-wrap">
                      {JSON.stringify(r.output_json, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
