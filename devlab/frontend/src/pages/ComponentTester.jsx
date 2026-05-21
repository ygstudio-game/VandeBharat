import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SessionPicker from '../components/SessionPicker';
import FrameGrid from '../components/FrameGrid';
import BboxOverlay from '../components/BboxOverlay';
import ResultPanel from '../components/ResultPanel';
import { Cpu, Loader2, Database, Zap } from 'lucide-react';

const SEVERITY_COLOR = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#6b7280',
};

// Stored DB detections use teal; new YOLO run detections use amber
const DB_COLOR = '#2dd4bf';
const YOLO_COLOR = '#f59e0b';

export default function ComponentTester() {
  const [, setParams] = useSearchParams();
  const [session, setSession] = useState(null);

  // Coach dropdown
  const [coaches, setCoaches] = useState([]);
  const [selectedCoach, setSelectedCoach] = useState(null);

  // Camera type dropdown
  const [cameraTypes, setCameraTypes] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');

  // Frames
  const [frames, setFrames] = useState([]);
  const [selected, setSelected] = useState([]);
  const [activeFrame, setActiveFrame] = useState(null);

  // Stored DB detections for active frame
  const [storedDetections, setStoredDetections] = useState([]);
  const [loadingDetections, setLoadingDetections] = useState(false);

  // YOLO run
  const [model, setModel] = useState('defect');
  const [running, setRunning] = useState(false);
  const [activeRun, setActiveRun] = useState(null);

  // Load coaches when session changes
  useEffect(() => {
    if (!session) return;
    setCoaches([]);
    setSelectedCoach(null);
    setCameraTypes([]);
    setSelectedCamera('');
    setFrames([]);
    setActiveFrame(null);
    setStoredDetections([]);
    setActiveRun(null);

    fetch(`/api/dev/sessions/${session.id}/coaches`)
      .then((r) => r.json())
      .then((data) => {
        setCoaches(data);
        if (data.length > 0) setSelectedCoach(data[0]);
      });
  }, [session]);

  // Load camera types when coach changes
  useEffect(() => {
    if (!session || !selectedCoach) return;
    setCameraTypes([]);
    setSelectedCamera('');
    setFrames([]);
    setActiveFrame(null);
    setStoredDetections([]);
    setActiveRun(null);

    fetch(`/api/dev/sessions/${session.id}/coaches/${selectedCoach.id}/camera-types`)
      .then((r) => r.json())
      .then((types) => {
        setCameraTypes(types);
        if (types.length > 0) setSelectedCamera(types[0]);
      });
  }, [selectedCoach]);

  // Load frames when coach or camera type changes
  useEffect(() => {
    if (!session || !selectedCoach) return;
    setFrames([]);
    setSelected([]);
    setActiveFrame(null);
    setStoredDetections([]);
    setActiveRun(null);

    const qs = selectedCamera ? `?camera_type=${encodeURIComponent(selectedCamera)}` : '';
    fetch(`/api/dev/sessions/${session.id}/coaches/${selectedCoach.id}/frames${qs}`)
      .then((r) => r.json())
      .then(setFrames);
  }, [selectedCoach, selectedCamera]);

  // Load stored DB detections when active frame changes
  useEffect(() => {
    if (!activeFrame) { setStoredDetections([]); return; }
    setLoadingDetections(true);
    fetch(`/api/dev/sessions/frames/${activeFrame}/detections`)
      .then((r) => r.json())
      .then(setStoredDetections)
      .catch(() => setStoredDetections([]))
      .finally(() => setLoadingDetections(false));
  }, [activeFrame]);

  function handleSessionChange(s) {
    setSession(s);
    setParams({ session: s.id });
  }

  function toggleFrame(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setActiveFrame(id);
  }

  function toggleAll() {
    setSelected((prev) => (prev.length === frames.length ? [] : frames.map((f) => f.id)));
  }

  async function runYolo() {
    if (!selected.length || !session) return;
    setRunning(true);
    try {
      const res = await fetch('/api/dev/yolo/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, frame_ids: selected, model }),
      });
      const data = await res.json();
      setActiveRun(data);
    } finally {
      setRunning(false);
    }
  }

  // Boxes from new YOLO run result for the active frame
  function yoloBboxes(frameId) {
    const run = activeRun?.runs?.find((r) => r.frame_id === frameId);
    if (!run?.result) return [];
    const dets = run.result.detections ?? run.result.boxes ?? [];
    return dets.map((d) => ({
      bbox_x: d.bbox_x ?? d.bbox_xyxy?.[0] ?? 0,
      bbox_y: d.bbox_y ?? d.bbox_xyxy?.[1] ?? 0,
      bbox_w: d.bbox_w ?? (d.bbox_xyxy ? d.bbox_xyxy[2] - d.bbox_xyxy[0] : 0),
      bbox_h: d.bbox_h ?? (d.bbox_xyxy ? d.bbox_xyxy[3] - d.bbox_xyxy[1] : 0),
      label: d.class_name ?? d.label ?? d.component_code ?? '',
      confidence: d.confidence,
      color: SEVERITY_COLOR[d.severity] ?? YOLO_COLOR,
    }));
  }

  // Boxes from stored DB component_detections
  function storedBboxes() {
    return storedDetections.map((d) => ({
      bbox_x: d.bbox_x,
      bbox_y: d.bbox_y,
      bbox_w: d.bbox_w,
      bbox_h: d.bbox_h,
      label: d.component_name ?? d.component_code,
      confidence: Number(d.confidence),
      color: d.status === 'missing' ? '#ef4444' : DB_COLOR,
    }));
  }

  const activeFrameObj = frames.find((f) => f.id === activeFrame);
  const activeYoloRun = activeRun?.runs?.find((r) => r.frame_id === activeFrame);
  const yoloDets = activeYoloRun?.result?.detections ?? activeYoloRun?.result?.boxes ?? [];

  // Merge boxes: stored DB first, then new YOLO run on top
  const allBoxes = [...storedBboxes(), ...yoloBboxes(activeFrame)];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-green-400" />
          <h1 className="text-sm font-semibold text-gray-100">Component Detection Tester</h1>
        </div>
        <SessionPicker value={session} onChange={handleSessionChange} />
      </div>

      {session && (
        <>
          {/* Dropdowns row */}
          <div className="flex items-center gap-4 border-b border-gray-800 pb-3">
            {/* Bogie / Coach dropdown */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Bogie / Coach</label>
              <select
                value={selectedCoach?.id ?? ''}
                onChange={(e) => {
                  const c = coaches.find((c) => c.id === e.target.value);
                  if (c) setSelectedCoach(c);
                }}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-green-500 min-w-[160px]"
              >
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.coach_number}
                    {c.coach_type ? ` (${c.coach_type})` : ''}
                    {c.critical_defects > 0 ? ` ⚠${c.critical_defects}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Camera type dropdown */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Camera</label>
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                disabled={cameraTypes.length === 0}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-green-500 min-w-[180px] disabled:opacity-40"
              >
                {cameraTypes.length === 0 && (
                  <option value="">No cameras</option>
                )}
                {cameraTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="ml-auto flex items-center gap-3">
              {/* Model selector */}
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none"
              >
                <option value="defect">Defect model</option>
                <option value="train_number">Train number model</option>
              </select>

              {/* Run button */}
              <button
                onClick={runYolo}
                disabled={!selected.length || running}
                className="flex items-center gap-1 px-4 py-1.5 text-xs bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
              >
                {running ? <Loader2 size={11} className="animate-spin" /> : <Cpu size={11} />}
                Run YOLO ({selected.length})
              </button>
            </div>
          </div>

          {/* Body: frame grid + viewer */}
          <div className="grid grid-cols-3 gap-4">
            {/* Frame grid */}
            <div className="col-span-1">
              <p className="text-xs text-gray-500 mb-2">
                {frames.length} frames
                {selectedCamera && <span className="ml-1 text-gray-600">· {selectedCamera}</span>}
              </p>
              <FrameGrid
                frames={frames}
                selected={selected}
                onToggle={toggleFrame}
                onSelectAll={toggleAll}
              />
            </div>

            {/* Viewer */}
            <div className="col-span-2 space-y-3">
              {activeFrameObj ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      Frame #{activeFrameObj.sequence_number} · {activeFrameObj.session_camera?.camera_type}
                    </p>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="flex items-center gap-1" style={{ color: DB_COLOR }}>
                        <Database size={10} />
                        Stored ({storedDetections.length})
                      </span>
                      {activeRun && (
                        <span className="flex items-center gap-1" style={{ color: YOLO_COLOR }}>
                          <Zap size={10} />
                          New run ({yoloDets.length})
                        </span>
                      )}
                    </div>
                  </div>

                  {loadingDetections && (
                    <p className="text-xs text-gray-600 animate-pulse">Loading stored detections…</p>
                  )}

                  <BboxOverlay
                    imageUrl={activeFrameObj.cloudinary_url}
                    boxes={allBoxes}
                  />

                  {/* Stored detections table */}
                  {storedDetections.length > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
                        <Database size={10} style={{ color: DB_COLOR }} />
                        Stored component detections
                      </p>
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {storedDetections.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center justify-between text-xs border border-gray-800 rounded px-2 py-1 bg-gray-900"
                          >
                            <span className="text-gray-300">{d.component_name ?? d.component_code}</span>
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: d.status === 'missing' ? '#ef444420' : '#2dd4bf20',
                                color: d.status === 'missing' ? '#ef4444' : DB_COLOR,
                              }}
                            >
                              {d.status}
                            </span>
                            <span className="text-gray-500">
                              {(Number(d.confidence) * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {storedDetections.length === 0 && !loadingDetections && (
                    <p className="text-xs text-gray-700">No stored detections for this frame.</p>
                  )}

                  {/* New YOLO run detections */}
                  {yoloDets.length > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
                        <Zap size={10} style={{ color: YOLO_COLOR }} />
                        New YOLO detections
                      </p>
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {yoloDets.map((d, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-xs border border-gray-800 rounded px-2 py-1 bg-gray-900"
                          >
                            <span className="text-gray-300">
                              {d.class_name ?? d.label ?? d.component_code}
                            </span>
                            {d.severity && (
                              <span style={{ color: SEVERITY_COLOR[d.severity] }} className="text-[10px]">
                                {d.severity}
                              </span>
                            )}
                            <span className="text-gray-500">
                              {(d.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeYoloRun && (
                    <ResultPanel
                      title="Raw YOLO response"
                      data={activeYoloRun.result}
                      error={activeYoloRun.error}
                    />
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-600 pt-16 text-center">
                  Select a frame from the grid to inspect
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
