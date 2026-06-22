import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar, Cell,
} from 'recharts';
import {
  Play, Square, Rocket, Trash2, RefreshCw, Plus, AlertTriangle,
  CheckCircle, Clock, XCircle, ChevronDown, ChevronUp, GitCompare,
} from 'lucide-react';

const BASE  = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const TOKEN = localStorage.getItem('mvis_token') || 'dev';

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

const STATUS_CONFIG = {
  queued:    { label: 'Queued',    color: 'bg-gray-100 text-gray-600',   icon: Clock },
  running:   { label: 'Running',   color: 'bg-blue-100 text-blue-700',   icon: Play },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  failed:    { label: 'Failed',    color: 'bg-red-100 text-red-700',     icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-yellow-100 text-yellow-700', icon: XCircle },
};

const BASE_MODELS = ['yolov8n.pt', 'yolov8s.pt', 'yolov8m.pt', 'yolov8l.pt', 'yolov8x.pt'];

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.queued;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function MetricBox({ label, value, unit = '' }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5">
        {value !== null && value !== undefined ? `${value}${unit}` : '—'}
      </p>
    </div>
  );
}

function NewJobModal({ datasets, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', dataset_id: '', dataset_name: '', base_model: 'yolov8n.pt',
    epochs: 100, batch_size: 16, learning_rate: 0.01, img_size: 640,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name) { setErr('name required'); return; }
    setSaving(true);
    try {
      const job = await apiFetch('/api/training/jobs', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      onCreated(job);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]">
        <h2 className="text-base font-bold mb-4">New Training Job</h2>
        {err && <p className="text-xs text-red-600 mb-3">{err}</p>}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Job Name *</label>
            <input className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dataset</label>
            {datasets.length > 0 ? (
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                value={form.dataset_id}
                onChange={e => {
                  const ds = datasets.find(d => d.id === e.target.value);
                  set('dataset_id', e.target.value);
                  if (ds) set('dataset_name', ds.name);
                }}
              >
                <option value="">— No dataset (use default) —</option>
                {datasets.map(d => <option key={d.id} value={d.id}>{d.name} v{d.version} ({d.image_count} imgs)</option>)}
              </select>
            ) : (
              <input className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" placeholder="Dataset name" value={form.dataset_name} onChange={e => set('dataset_name', e.target.value)} />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Base Model</label>
            <select className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" value={form.base_model} onChange={e => set('base_model', e.target.value)}>
              {BASE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              ['epochs', 'Epochs', 'number', 1, 1000],
              ['batch_size', 'Batch Size', 'number', 1, 512],
              ['img_size', 'Image Size (px)', 'number', 32, 1280],
            ].map(([k, label, type, min, max]) => (
              <div key={k}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input
                  type={type} min={min} max={max}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                  value={form[k]}
                  onChange={e => set(k, e.target.value)}
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Learning Rate</label>
              <input
                type="number" min={0.0001} max={0.9999} step={0.001}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                value={form.learning_rate}
                onChange={e => set('learning_rate', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Launching…' : 'Launch Job'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveProgress({ job }) {
  const history = Array.isArray(job.metrics_history) ? job.metrics_history : [];

  if (!history.length) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        {job.status === 'queued' ? 'Job queued — waiting for GPU…' : 'No epoch data yet.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <MetricBox label="Current Epoch" value={`${job.current_epoch}/${job.epochs}`} />
        <MetricBox label="Best mAP50" value={job.best_map50 ? (parseFloat(job.best_map50) * 100).toFixed(1) : null} unit="%" />
        <MetricBox label="Best mAP95" value={job.best_map95 ? (parseFloat(job.best_map95) * 100).toFixed(1) : null} unit="%" />
        <MetricBox label="Progress" value={job.epochs > 0 ? Math.round((job.current_epoch / job.epochs) * 100) : 0} unit="%" />
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Loss Curves</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={history} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="epoch" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => parseFloat(v).toFixed(4)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="box_loss" name="Box Loss" stroke="#ef4444" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="cls_loss" name="Cls Loss" stroke="#f97316" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="dfl_loss" name="DFL Loss" stroke="#eab308" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">mAP Curves</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={history} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="epoch" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={[0, 1]} />
            <Tooltip formatter={(v) => (parseFloat(v) * 100).toFixed(1) + '%'} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="map50" name="mAP@50" stroke="#6366f1" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="map95" name="mAP@50-95" stroke="#22c55e" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="precision" name="Precision" stroke="#06b6d4" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="recall" name="Recall" stroke="#8b5cf6" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ComparePanel({ jobs }) {
  const completed = jobs.filter(j => j.status === 'completed' && j.best_map50 !== null);
  if (completed.length < 2) {
    return <p className="text-sm text-gray-400">Need ≥2 completed jobs to compare.</p>;
  }

  const metrics = ['best_map50', 'best_map95'];
  const colors = ['#6366f1', '#22c55e', '#f97316', '#ef4444', '#06b6d4'];

  return (
    <div className="space-y-4">
      {metrics.map((m, mi) => {
        const data = completed.map(j => ({
          name: j.name.length > 20 ? j.name.slice(0, 18) + '…' : j.name,
          value: j[m] ? parseFloat(j[m]) * 100 : 0,
        }));
        return (
          <div key={m}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{m.replace('_', ' ').toUpperCase()} (%)</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip formatter={(v) => v.toFixed(2) + '%'} />
                <Bar dataKey="value" name={m} radius={[3, 3, 0, 0]}>
                  {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-gray-500 uppercase text-left">
              <th className="pb-2 pr-4">Job</th>
              <th className="pb-2 pr-4">Base Model</th>
              <th className="pb-2 pr-4">Epochs</th>
              <th className="pb-2 pr-4">Batch</th>
              <th className="pb-2 pr-4">LR</th>
              <th className="pb-2 pr-4">mAP50</th>
              <th className="pb-2">mAP95</th>
            </tr>
          </thead>
          <tbody>
            {completed.map((j, i) => (
              <tr key={j.id} className="border-b border-gray-100">
                <td className="py-2 pr-4 font-semibold" style={{ color: colors[i % colors.length] }}>{j.name}</td>
                <td className="py-2 pr-4 font-mono text-gray-500">{j.base_model}</td>
                <td className="py-2 pr-4">{j.epochs}</td>
                <td className="py-2 pr-4">{j.batch_size}</td>
                <td className="py-2 pr-4 font-mono">{parseFloat(j.learning_rate).toFixed(4)}</td>
                <td className="py-2 pr-4 font-semibold text-indigo-600">{j.best_map50 ? (parseFloat(j.best_map50) * 100).toFixed(1) + '%' : '—'}</td>
                <td className="py-2 font-semibold text-green-600">{j.best_map95 ? (parseFloat(j.best_map95) * 100).toFixed(1) + '%' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AiTrainingWorkbench() {
  const [jobs, setJobs]           = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showNew, setShowNew]     = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('jobs'); // 'jobs' | 'compare'
  const [deploying, setDeploying] = useState('');
  const pollRef = useRef(null);

  const loadJobs = useCallback(async () => {
    try {
      const data = await apiFetch('/api/training/jobs');
      setJobs(data.jobs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDatasets = useCallback(async () => {
    try {
      const data = await apiFetch('/api/datasets?status=active');
      setDatasets(data.datasets || []);
    } catch { /* optional */ }
  }, []);

  useEffect(() => {
    Promise.all([loadJobs(), loadDatasets()]);
  }, [loadJobs, loadDatasets]);

  // Poll every 5s if any job is running/queued
  useEffect(() => {
    const hasActive = jobs.some(j => ['queued', 'running'].includes(j.status));
    if (hasActive) {
      pollRef.current = setInterval(loadJobs, 5000);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [jobs, loadJobs]);

  const selectedJob = jobs.find(j => j.id === selectedId);

  const cancel = async (id) => {
    try {
      await apiFetch(`/api/training/jobs/${id}/cancel`, { method: 'PATCH' });
      loadJobs();
    } catch (e) { alert(e.message); }
  };

  const deleteJob = async (id) => {
    if (!confirm('Delete this training job record?')) return;
    try {
      await apiFetch(`/api/training/jobs/${id}`, { method: 'DELETE' });
      if (selectedId === id) setSelectedId(null);
      loadJobs();
    } catch (e) { alert(e.message); }
  };

  const deploy = async (job) => {
    setDeploying(job.id);
    try {
      const resp = await apiFetch(`/api/training/jobs/${job.id}/deploy`, {
        method: 'POST',
        body: JSON.stringify({ model_name: 'defect_detector', activate: false }),
      });
      alert(`Deployed as ${resp.model_version.version} (staging). Activate via Model Registry.`);
      loadJobs();
    } catch (e) { alert(e.message); }
    finally { setDeploying(''); }
  };

  const kpi = [
    { label: 'Total Jobs',      value: jobs.length },
    { label: 'Running',         value: jobs.filter(j => j.status === 'running').length },
    { label: 'Completed',       value: jobs.filter(j => j.status === 'completed').length },
    { label: 'Best mAP50',      value: (() => {
      const best = Math.max(...jobs.filter(j => j.best_map50).map(j => parseFloat(j.best_map50)));
      return isFinite(best) ? (best * 100).toFixed(1) + '%' : '—';
    })() },
  ];

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-72" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />)}
        </div>
        <div className="h-64 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">AI Training Workbench</h1>
          <p className="text-xs text-gray-500 mt-0.5">Configure, launch, and track YOLOv8 training runs</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadJobs} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-md hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> New Job
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpi.map(({ label, value }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Tab toggle */}
      <div className="flex gap-2">
        {[['jobs', 'Experiment History'], ['compare', 'Model Comparison']].map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-full border transition-colors ${
              activeTab === tab ? 'bg-primary text-white border-primary' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab === 'compare' && <GitCompare className="w-3.5 h-3.5" />}
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'compare' && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
          <ComparePanel jobs={jobs} />
        </div>
      )}

      {activeTab === 'jobs' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Job List */}
          <div className="lg:col-span-2 space-y-2">
            {jobs.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 text-center">
                <p className="text-sm text-gray-400">No training jobs yet.</p>
                <button onClick={() => setShowNew(true)} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-white rounded-md mx-auto hover:bg-primary/90">
                  <Plus className="w-3.5 h-3.5" /> Launch First Job
                </button>
              </div>
            ) : jobs.map(job => (
              <div
                key={job.id}
                onClick={() => setSelectedId(job.id)}
                className={`bg-white border rounded-lg p-4 cursor-pointer transition-all shadow-sm hover:shadow-md ${
                  selectedId === job.id ? 'border-primary ring-1 ring-primary/30' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{job.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{job.base_model}</p>
                  </div>
                  <StatusBadge status={job.status} />
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>{job.epochs} epochs</span>
                  <span>bs={job.batch_size}</span>
                  {job.dataset_name && <span className="truncate max-w-[120px]">{job.dataset_name}</span>}
                </div>

                {job.status === 'running' && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Epoch {job.current_epoch}/{job.epochs}</span>
                      <span>{Math.round((job.current_epoch / job.epochs) * 100)}%</span>
                    </div>
                    <div className="bg-gray-200 rounded-full h-1.5">
                      <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${Math.round((job.current_epoch / job.epochs) * 100)}%` }} />
                    </div>
                  </div>
                )}

                {job.best_map50 && (
                  <p className="mt-2 text-xs font-semibold text-indigo-600">
                    mAP50: {(parseFloat(job.best_map50) * 100).toFixed(1)}%
                  </p>
                )}

                <div className="mt-3 flex gap-2" onClick={e => e.stopPropagation()}>
                  {['queued', 'running'].includes(job.status) && (
                    <button onClick={() => cancel(job.id)} className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-red-50 hover:border-red-300 hover:text-red-600">
                      <Square className="w-3 h-3" /> Cancel
                    </button>
                  )}
                  {job.status === 'completed' && !job.model_version_id && job.model_url && (
                    <button onClick={() => deploy(job)} disabled={deploying === job.id} className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
                      <Rocket className="w-3 h-3" /> {deploying === job.id ? 'Deploying…' : 'Deploy'}
                    </button>
                  )}
                  {job.model_version_id && (
                    <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Deployed
                    </span>
                  )}
                  {!['queued', 'running'].includes(job.status) && (
                    <button onClick={() => deleteJob(job.id)} className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-red-50 hover:border-red-300 hover:text-red-600 ml-auto">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-3 bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            {!selectedJob ? (
              <div className="flex items-center justify-center h-full min-h-[300px] text-sm text-gray-400">
                Select a job to view training progress.
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">{selectedJob.name}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {selectedJob.base_model} · {selectedJob.epochs} epochs · bs={selectedJob.batch_size} · lr={parseFloat(selectedJob.learning_rate).toFixed(4)} · {selectedJob.img_size}px
                    </p>
                    {selectedJob.dataset_name && (
                      <p className="text-xs text-gray-500 mt-0.5">Dataset: {selectedJob.dataset_name}</p>
                    )}
                  </div>
                  <StatusBadge status={selectedJob.status} />
                </div>

                {selectedJob.error_message && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700">
                    <strong>Error:</strong> {selectedJob.error_message}
                  </div>
                )}

                <LiveProgress job={selectedJob} />
              </div>
            )}
          </div>
        </div>
      )}

      {showNew && (
        <NewJobModal
          datasets={datasets}
          onClose={() => setShowNew(false)}
          onCreated={(job) => { loadJobs(); setSelectedId(job.id); }}
        />
      )}
    </div>
  );
}
