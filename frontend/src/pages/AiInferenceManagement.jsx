import React, { useState, useCallback } from 'react';
import {
  Cpu,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ChevronRight,
  MemoryStick,
  Timer,
  PackageCheck,
  PackageX,
  CircleDot,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { usePolling } from '../hooks/usePolling';
import { getModelVersions, getModelMetrics, activateModelVersion } from '../lib/api';
import { toast } from '../hooks/useToast';
import { cn } from '@/lib/utils';

// ── Gauge ring (SVG) ──────────────────────────────────────────────────────────
function Gauge({ value, max = 100, label, unit = '%', color = 'stroke-blue-500' }) {
  const pct = Math.min(100, (value / max) * 100);
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" strokeWidth="8" className="stroke-slate-100" />
        <circle
          cx="48" cy="48" r={r} fill="none" strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          className={color}
          transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text x="48" y="44" textAnchor="middle" className="fill-slate-800 font-black" fontSize="14" fontWeight="900">
          {value != null ? (typeof value === 'number' ? value.toFixed(value < 10 ? 1 : 0) : value) : '—'}
        </text>
        <text x="48" y="58" textAnchor="middle" className="fill-slate-500" fontSize="9">
          {unit}
        </text>
      </svg>
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ── Model version card ────────────────────────────────────────────────────────
function ModelCard({ version, onActivate, activating }) {
  const isActive  = version.status === 'active';
  const isStaging = version.status === 'staging';

  const metrics = version.metrics || {};
  const precision = metrics.precision != null ? (metrics.precision * 100).toFixed(1) : null;
  const recall    = metrics.recall    != null ? (metrics.recall    * 100).toFixed(1) : null;
  const map50     = metrics.map50     != null ? (metrics.map50     * 100).toFixed(1) : null;

  return (
    <div className={cn(
      'border rounded-lg p-4 space-y-3 transition-all',
      isActive  ? 'border-emerald-300 bg-emerald-50/40 shadow-sm' : 'border-border bg-card',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-foreground">{version.model_name}</span>
            <span className={cn(
              'text-[9px] font-bold px-2 py-0.5 rounded-full border',
              isActive  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              isStaging ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-slate-100 text-slate-500 border-slate-200'
            )}>
              {version.status.toUpperCase()}
            </span>
          </div>
          <p className="text-[10px] font-mono text-muted-foreground">{version.version}</p>
        </div>

        {isActive ? (
          <span className="shrink-0 flex items-center gap-1 text-[9px] font-bold text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> LIVE
          </span>
        ) : isStaging ? (
          <button
            onClick={() => onActivate(version.id)}
            disabled={activating === version.id}
            className="shrink-0 text-[10px] font-bold px-2.5 py-1 bg-primary text-white rounded hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center gap-1"
          >
            {activating === version.id
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Activating…</>
              : <><Zap className="w-3 h-3" /> Activate</>}
          </button>
        ) : null}
      </div>

      {/* Accuracy metrics */}
      {(precision || recall || map50) ? (
        <div className="flex gap-4 pt-1 border-t border-border/60">
          {precision && <Metric label="Precision" value={`${precision}%`} />}
          {recall    && <Metric label="Recall"    value={`${recall}%`}    />}
          {map50     && <Metric label="mAP@50"    value={`${map50}%`}     />}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground italic">No benchmark metrics recorded.</p>
      )}

      {version.trained_from && (
        <p className="text-[9px] font-mono text-muted-foreground truncate">
          Trained from: {version.trained_from.split('/').pop()}
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-[9px] font-bold text-muted-foreground uppercase">{label}</p>
      <p className="text-xs font-black text-foreground">{value}</p>
    </div>
  );
}

// ── Service status strip ──────────────────────────────────────────────────────
function ServiceStatus({ label, data, online }) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-1.5 rounded border text-[10px] font-bold',
      online ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
    )}>
      <CircleDot className={cn('w-3 h-3', online ? 'text-emerald-500' : 'text-red-400')} />
      {label}
      {online && data && <span className="text-muted-foreground font-normal ml-1">{data.requests_total} req</span>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function AiInferenceManagement() {
  const [activating, setActivating] = useState(null);
  const [latencyHistory, setLatencyHistory] = useState([]);

  const fetchVersions = useCallback(() => getModelVersions(), []);
  const fetchMetrics  = useCallback(async () => {
    const data = await getModelMetrics();
    if (data.yolo?.avg_latency_ms != null) {
      setLatencyHistory((prev) => {
        const next = [...prev, {
          t: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          customModel: data.yolo.avg_latency_ms,
          ocr:  data.ocr?.avg_latency_ms ?? null,
        }];
        return next.slice(-20); // keep last 20 points
      });
    }
    return data;
  }, []);

  const { data: versionsData, refresh: refreshVersions } = usePolling(fetchVersions, 30000);
  const { data: metricsData, refresh: refreshMetrics }   = usePolling(fetchMetrics,  5000);

  const versions = versionsData?.versions || [];
  const customModel = metricsData?.yolo || null;
  const ocr      = metricsData?.ocr   || null;

  const handleActivate = async (id) => {
    setActivating(id);
    try {
      await activateModelVersion(id);
      toast.success('Model version activated. Services will pick up on next reload.', 'Model Switched');
      refreshVersions();
    } catch (err) {
      toast.error(err.message || 'Activation failed', 'Error');
    } finally {
      setActivating(null);
    }
  };

  const defectVersions = versions.filter((v) => v.model_name === 'defect_detector');
  const ocrVersions    = versions.filter((v) => v.model_name === 'train_num_detector');
  const otherVersions  = versions.filter((v) => !['defect_detector', 'train_num_detector'].includes(v.model_name));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-sans">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">AI INFERENCE MANAGEMENT</h1>
          <p className="text-sm text-muted-foreground mt-1">Live model metrics, version registry, and activation control</p>
        </div>
        <div className="flex items-center gap-2">
          <ServiceStatus label="Custom Model :5002" data={customModel} online={customModel !== null} />
          <ServiceStatus label="OCR :5000"  data={ocr}  online={ocr  !== null} />
          <button
            onClick={() => { refreshVersions(); refreshMetrics(); }}
            className="p-2 border border-border rounded text-muted-foreground hover:text-foreground transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Live metrics gauges */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Custom Model metrics */}
        <div className="bg-card border border-border rounded-lg p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-black text-foreground uppercase tracking-tight">Custom Model Service Metrics</h2>
            {customModel === null && <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">OFFLINE</span>}
          </div>
          {customModel ? (
            <div className="flex flex-wrap items-center justify-around gap-4">
              <Gauge value={customModel.avg_latency_ms} max={500} label="Avg Latency" unit="ms" color="stroke-blue-500" />
              <Gauge value={customModel.fps} max={30} label="Throughput" unit="FPS" color="stroke-violet-500" />
              <Gauge value={customModel.gpu_utilization_pct} max={100} label="GPU Mem Used" unit="%" color="stroke-amber-500" />
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  {customModel.defect_model_loaded ? <PackageCheck className="w-4 h-4 text-emerald-500" /> : <PackageX className="w-4 h-4 text-red-400" />}
                  <span className={customModel.defect_model_loaded ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>
                    {customModel.defect_model_loaded ? 'Defect model loaded' : 'Defect model missing'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {customModel.ocr_model_loaded ? <PackageCheck className="w-4 h-4 text-emerald-500" /> : <PackageX className="w-4 h-4 text-red-400" />}
                  <span className={customModel.ocr_model_loaded ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>
                    {customModel.ocr_model_loaded ? 'OCR detector loaded' : 'OCR detector missing'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Timer className="w-3.5 h-3.5" />
                  <span>Uptime {Math.round((customModel.uptime_seconds || 0) / 60)}m</span>
                </div>
                {customModel.gpu_memory_mb != null && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MemoryStick className="w-3.5 h-3.5" />
                    <span>{customModel.gpu_memory_mb} MB GPU allocated</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Custom Model service unreachable — start GPU/custom-model/server.py on port 5002
            </div>
          )}
        </div>

        {/* OCR metrics */}
        <div className="bg-card border border-border rounded-lg p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-black text-foreground uppercase tracking-tight">OCR Service Metrics</h2>
            {ocr === null && <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">OFFLINE</span>}
          </div>
          {ocr ? (
            <div className="flex flex-wrap items-center justify-around gap-4">
              <Gauge value={ocr.avg_latency_ms} max={2000} label="Avg Latency" unit="ms" color="stroke-cyan-500" />
              <Gauge value={ocr.valid_pct} max={100} label="Valid Detections" unit="%" color="stroke-emerald-500" />
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>{ocr.requests_total} total OCR requests</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{ocr.valid_detections} valid detections</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Timer className="w-3.5 h-3.5" />
                  <span>Uptime {Math.round((ocr.uptime_seconds || 0) / 60)}m</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              OCR service unreachable — start GPU/ocr/server.py on port 5000
            </div>
          )}
        </div>
      </div>

      {/* Latency trend chart */}
      {latencyHistory.length > 1 && (
        <div className="bg-card border border-border rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-black text-foreground uppercase tracking-tight mb-4">Inference Latency Trend</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={latencyHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} unit="ms" width={45} />
              <Tooltip
                contentStyle={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 6 }}
                formatter={(v, name) => [`${v?.toFixed(1)} ms`, name === 'customModel' ? 'Custom Model' : 'OCR']}
              />
              <Line type="monotone" dataKey="customModel" stroke="#6366f1" strokeWidth={2} dot={false} name="customModel" />
              <Line type="monotone" dataKey="ocr"  stroke="#06b6d4" strokeWidth={2} dot={false} name="ocr" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Model version registry */}
      <div className="space-y-6">
        <h2 className="text-sm font-black text-foreground uppercase tracking-tight">Model Version Registry</h2>

        {versions.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
            No model versions registered. Use <code className="font-mono text-xs bg-slate-100 px-1 rounded">POST /api/models</code> to register a new version.
          </div>
        ) : (
          <>
            {defectVersions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-black text-muted-foreground uppercase tracking-wider">Defect Detector</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {defectVersions.map((v) => (
                    <ModelCard key={v.id} version={v} onActivate={handleActivate} activating={activating} />
                  ))}
                </div>
              </div>
            )}

            {ocrVersions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-black text-muted-foreground uppercase tracking-wider">Train Number Detector (OCR)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {ocrVersions.map((v) => (
                    <ModelCard key={v.id} version={v} onActivate={handleActivate} activating={activating} />
                  ))}
                </div>
              </div>
            )}

            {otherVersions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-black text-muted-foreground uppercase tracking-wider">Other Models</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {otherVersions.map((v) => (
                    <ModelCard key={v.id} version={v} onActivate={handleActivate} activating={activating} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
