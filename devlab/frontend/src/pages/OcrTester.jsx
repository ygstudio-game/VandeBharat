import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SessionPicker from '../components/SessionPicker';
import FrameGrid from '../components/FrameGrid';
import BboxOverlay from '../components/BboxOverlay';
import ResultPanel from '../components/ResultPanel';
import { ScanText, Loader2 } from 'lucide-react';

export default function OcrTester() {
  const [params, setParams] = useSearchParams();
  const [session, setSession] = useState(null);
  const [frames, setFrames] = useState([]);
  const [selected, setSelected] = useState([]);
  const [ocrOnly, setOcrOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState([]);
  const [activeRun, setActiveRun] = useState(null);

  // Load frames when session changes
  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setFrames([]);
    setSelected([]);
    const url = `/api/dev/sessions/${session.id}/frames?limit=100&ocr_only=${ocrOnly}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => setFrames(d.frames ?? []))
      .finally(() => setLoading(false));
  }, [session, ocrOnly]);

  // Load past runs when session changes
  useEffect(() => {
    if (!session) return;
    fetch(`/api/dev/ocr/runs/${session.id}`)
      .then((r) => r.json())
      .then(setRuns);
  }, [session]);

  function handleSessionChange(s) {
    setSession(s);
    setParams({ session: s.id });
  }

  function toggleFrame(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAll() {
    setSelected((prev) => (prev.length === frames.length ? [] : frames.map((f) => f.id)));
  }

  async function runOcr() {
    if (!selected.length || !session) return;
    setRunning(true);
    try {
      const res = await fetch('/api/dev/ocr/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, frame_ids: selected }),
      });
      const data = await res.json();
      setRuns((prev) => [{ ...data, created_at: new Date().toISOString() }, ...prev]);
      setActiveRun(data);
    } finally {
      setRunning(false);
    }
  }

  // Build bbox boxes for the active run's selected frame
  function bboxesForFrame(frameId) {
    if (!activeRun) return [];
    const run = activeRun.runs?.find((r) => r.frame_id === frameId);
    if (!run?.result) return [];
    const r = run.result;
    if (!r.bbox_x && r.bbox_x !== 0) return [];
    return [
      {
        bbox_x: r.bbox_x ?? 0,
        bbox_y: r.bbox_y ?? 0,
        bbox_w: r.bbox_w ?? 0,
        bbox_h: r.bbox_h ?? 0,
        label: r.coach_number ?? '',
        confidence: r.confidence,
        color: r.is_valid ? '#22c55e' : '#ef4444',
      },
    ];
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanText size={16} className="text-blue-400" />
          <h1 className="text-sm font-semibold text-gray-100">OCR Tester</h1>
        </div>
        <SessionPicker value={session} onChange={handleSessionChange} />
      </div>

      {session && (
        <>
          {/* Controls */}
          <div className="flex items-center gap-4 border-b border-gray-800 pb-3">
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={ocrOnly}
                onChange={(e) => setOcrOnly(e.target.checked)}
                className="accent-amber-500"
              />
              OCR candidates only
            </label>
            <span className="text-xs text-gray-600">{selected.length} selected</span>
            <button
              onClick={runOcr}
              disabled={!selected.length || running}
              className="flex items-center gap-2 px-4 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors ml-auto"
            >
              {running ? <Loader2 size={12} className="animate-spin" /> : <ScanText size={12} />}
              Run OCR ({selected.length})
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Frame selector */}
            <div className="col-span-1">
              {loading ? (
                <p className="text-xs text-gray-600">Loading frames…</p>
              ) : (
                <FrameGrid
                  frames={frames}
                  selected={selected}
                  onToggle={toggleFrame}
                  onSelectAll={toggleAll}
                />
              )}
            </div>

            {/* Results */}
            <div className="col-span-2 space-y-3">
              {activeRun?.runs?.map((run) => {
                const frame = frames.find((f) => f.id === run.frame_id);
                return (
                  <div key={run.frame_id} className="border border-gray-800 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-gray-500">
                      Frame #{frame?.sequence_number} · trigger {run.trigger_id}
                    </p>

                    {frame && (
                      <BboxOverlay
                        imageUrl={frame.cloudinary_url}
                        boxes={bboxesForFrame(run.frame_id)}
                      />
                    )}

                    {run.result && (
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-gray-900 rounded p-2">
                          <p className="text-gray-500 mb-1">Coach Number</p>
                          <p className={`font-semibold ${run.result.is_valid ? 'text-green-400' : 'text-red-400'}`}>
                            {run.result.coach_number ?? '—'}
                          </p>
                        </div>
                        <div className="bg-gray-900 rounded p-2">
                          <p className="text-gray-500 mb-1">Confidence</p>
                          <p className="text-gray-100">{run.result.confidence?.toFixed(3) ?? '—'}</p>
                        </div>
                        <div className="bg-gray-900 rounded p-2">
                          <p className="text-gray-500 mb-1">Pass / ROI</p>
                          <p className="text-gray-100">
                            Pass {run.result.pass_used} · {run.result.roi_used ? 'ROI' : 'full-frame'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Stored result comparison */}
                    {frame?.ocr_results?.[0] && (
                      <div className="text-xs text-gray-600 border-t border-gray-800 pt-2">
                        Stored: coach={frame.ocr_results[0].coach_number ?? '—'} ·
                        conf={frame.ocr_results[0].confidence ?? '—'} ·
                        pass={frame.ocr_results[0].pass_number}
                      </div>
                    )}

                    <ResultPanel title="Raw response" data={run.result} error={run.error} />
                  </div>
                );
              })}

              {/* Past runs list */}
              {runs.length > 0 && !activeRun && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Past runs ({runs.length})</p>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {runs.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between text-xs border border-gray-800 rounded px-2 py-1.5 bg-gray-900"
                      >
                        <span className="text-gray-400">frame {r.frame_id.slice(0, 8)}</span>
                        <span className={r.is_valid ? 'text-green-400' : 'text-red-400'}>
                          {r.final_number ?? '—'} ({r.confidence ?? '—'})
                        </span>
                        <span className="text-gray-600">
                          {new Date(r.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
