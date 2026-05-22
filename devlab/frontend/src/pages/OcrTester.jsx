import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SessionPicker from '../components/SessionPicker';
import FrameGrid from '../components/FrameGrid';
import BboxOverlay from '../components/BboxOverlay';
import ResultPanel from '../components/ResultPanel';
import { ScanText, Loader2, ArrowRight, RefreshCw } from 'lucide-react';

const CLASS_COLOR = {
  boogie:    '#3b82f6',
  'car type': '#f59e0b',
  engine:    '#22c55e',
  gap:       '#f97316',
};

function classColor(label) {
  return CLASS_COLOR[label?.toLowerCase()] ?? '#a78bfa';
}

export default function OcrTester() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [session,   setSession]   = useState(null);
  const [frames,    setFrames]    = useState([]);
  const [selected,  setSelected]  = useState([]);
  const [ocrOnly,   setOcrOnly]   = useState(true);
  const [loading,   setLoading]   = useState(false);
  const [running,   setRunning]   = useState(false);
  const [runs,      setRuns]      = useState([]);
  const [activeRun, setActiveRun] = useState(null);
  const [showYolo,  setShowYolo]  = useState(true);
  const [showOcr,   setShowOcr]   = useState(true);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncResult,  setSyncResult]  = useState(null);

  // Load frames when session changes
  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setFrames([]);
    setSelected([]);
    setActiveRun(null);
    setSyncResult(null);
    fetch(`/api/dev/sessions/${session.id}/frames?limit=100&ocr_only=${ocrOnly}`)
      .then((r) => r.json())
      .then((d) => setFrames(d.frames ?? []))
      .finally(() => setLoading(false));
  }, [session, ocrOnly]);

  // Load past runs when session changes
  useEffect(() => {
    if (!session) return;
    fetch(`/api/dev/ocr/runs/${session.id}`)
      .then((r) => r.json())
      .then((d) => setRuns(Array.isArray(d) ? d : []));
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
    setSyncResult(null);
    try {
      const res = await fetch('/api/dev/ocr/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, frame_ids: selected }),
      });
      const data = await res.json();
      if (Array.isArray(data)) return; // error guard
      setRuns((prev) => [{ ...data, created_at: new Date().toISOString() }, ...prev]);
      setActiveRun(data);
    } finally {
      setRunning(false);
    }
  }

  async function runSync() {
    if (!session) return;
    setSyncRunning(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/dev/sync/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      });
      const data = await res.json();
      setSyncResult(data);
    } finally {
      setSyncRunning(false);
    }
  }

  // Build bbox boxes for a frame from the active run
  function bboxesForFrame(frameId) {
    if (!activeRun) return [];
    const run = activeRun.runs?.find((r) => r.frame_id === frameId);
    if (!run) return [];

    const boxes = [];

    if (showYolo) {
      for (const b of run.yolo_boxes ?? []) {
        boxes.push({
          ...b,
          color: classColor(b.label),
          label: b.label,
        });
      }
    }

    if (showOcr && run.result) {
      const r = run.result;
      if (r.bbox_x != null) {
        boxes.push({
          bbox_x: r.bbox_x,
          bbox_y: r.bbox_y,
          bbox_w: r.bbox_w,
          bbox_h: r.bbox_h,
          label: r.coach_number ?? '?',
          confidence: r.confidence,
          color: r.is_valid ? '#22c55e' : '#ef4444',
        });
      }
    }

    return boxes;
  }

  const validCount = activeRun?.runs?.filter((r) => r.result?.is_valid).length ?? 0;

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
          <div className="flex items-center gap-4 border-b border-gray-800 pb-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={ocrOnly}
                onChange={(e) => setOcrOnly(e.target.checked)}
                className="accent-amber-500"
              />
              OCR candidates only
            </label>

            {/* Overlay toggles */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-gray-600 mr-1">Overlay:</span>
              <button
                onClick={() => setShowYolo((p) => !p)}
                className={`px-2 py-0.5 rounded border text-[11px] transition-colors ${
                  showYolo
                    ? 'bg-blue-900/50 border-blue-600 text-blue-300'
                    : 'border-gray-700 text-gray-600 hover:text-gray-400'
                }`}
              >
                YOLO boxes
              </button>
              <button
                onClick={() => setShowOcr((p) => !p)}
                className={`px-2 py-0.5 rounded border text-[11px] transition-colors ${
                  showOcr
                    ? 'bg-green-900/50 border-green-600 text-green-300'
                    : 'border-gray-700 text-gray-600 hover:text-gray-400'
                }`}
              >
                OCR box
              </button>
            </div>

            {/* Class legend */}
            <div className="flex items-center gap-2 text-[11px]">
              {Object.entries(CLASS_COLOR).map(([cls, col]) => (
                <span key={cls} className="flex items-center gap-1 text-gray-500">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: col }} />
                  {cls}
                </span>
              ))}
            </div>

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

          {/* Post-run: send to sync */}
          {activeRun && (
            <div className="flex items-center gap-3 p-3 border border-gray-800 rounded bg-gray-950">
              <span className="text-xs text-gray-400">
                OCR done — {validCount}/{activeRun.runs?.length ?? 0} valid detections
              </span>
              <button
                onClick={runSync}
                disabled={syncRunning}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-40 rounded transition-colors ml-auto"
              >
                {syncRunning
                  ? <Loader2 size={11} className="animate-spin" />
                  : <ArrowRight size={11} />}
                → Run Sync Engine
              </button>
              <button
                onClick={() => navigate(`/sync?session=${session.id}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200 rounded transition-colors"
              >
                <RefreshCw size={11} /> Go to Sync Tester
              </button>
            </div>
          )}

          {syncResult && (
            <div className="text-xs border border-purple-800 bg-purple-950/30 rounded p-3">
              <span className="text-purple-300 font-medium">Sync result: </span>
              {syncResult.error
                ? <span className="text-red-400">{syncResult.error}</span>
                : <span className="text-gray-300">
                    {syncResult.result?.coaches_created ?? 0} coaches created ·
                    {' '}{syncResult.result?.frames_assigned_direct ?? 0} direct frames
                  </span>
              }
              {!syncResult.error && (
                <button
                  onClick={() => navigate(`/components?session=${session.id}`)}
                  className="ml-3 underline text-purple-400 hover:text-purple-200"
                >
                  → Components
                </button>
              )}
            </div>
          )}

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
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500">
                        Frame #{frame?.sequence_number} · trigger {run.trigger_id}
                      </p>
                      <div className="flex gap-2 text-[11px]">
                        {(run.yolo_boxes ?? []).length > 0 && (
                          <span className="text-blue-400">
                            {run.yolo_boxes.length} YOLO box{run.yolo_boxes.length > 1 ? 'es' : ''}
                          </span>
                        )}
                        {run.result?.is_valid && (
                          <span className="text-green-400">OCR ✓ {run.result.coach_number}</span>
                        )}
                        {!run.result?.is_valid && run.result && (
                          <span className="text-red-400">OCR ✗</span>
                        )}
                      </div>
                    </div>

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
                            Pass {run.result.pass_used} · {run.result.roi_used ? 'ROI crop' : 'full-frame'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* YOLO box detail */}
                    {(run.yolo_boxes ?? []).length > 0 && (
                      <div className="text-[11px] text-gray-600 flex flex-wrap gap-2">
                        {run.yolo_boxes.map((b, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded"
                            style={{ background: classColor(b.label) + '22', color: classColor(b.label), border: `1px solid ${classColor(b.label)}44` }}
                          >
                            {b.label} {(b.confidence * 100).toFixed(0)}%
                          </span>
                        ))}
                      </div>
                    )}

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
