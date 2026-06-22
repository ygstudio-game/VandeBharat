import { useEffect, useState, useRef } from 'react';
import {
  Database, Plus, RefreshCw, Download, Archive, Trash2, X,
  Tag, Image, BookOpen, CheckCircle, AlertTriangle, Zap,
} from 'lucide-react';

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';
const token = () => localStorage.getItem('vi_auth_token') ?? 'dev';
const hdr = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, { ...opts, headers: { ...hdr(), ...(opts.headers || {}) } });
  if (r.status === 204) return null;
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body;
}

const SOURCE_CONFIG = {
  manual:      { label: 'Manual',      bg: 'bg-blue-100',  text: 'text-blue-700'  },
  auto_export: { label: 'Auto Export', bg: 'bg-purple-100', text: 'text-purple-700' },
};

const STATUS_CONFIG = {
  active:   { label: 'Active',   bg: 'bg-green-100',  text: 'text-green-700'  },
  archived: { label: 'Archived', bg: 'bg-slate-100',  text: 'text-slate-500'  },
};

function Badge({ cfg }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function ClassChips({ list }) {
  if (!list || list.length === 0) return <span className="text-xs text-slate-400">—</span>;
  const show = list.slice(0, 5);
  const more = list.length - 5;
  return (
    <div className="flex flex-wrap gap-1">
      {show.map((c) => (
        <span key={c} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded font-mono">{c}</span>
      ))}
      {more > 0 && <span className="text-[10px] text-slate-400">+{more}</span>}
    </div>
  );
}

function RegisterModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '', version: 'v1', description: '', source: 'manual',
    class_list_raw: '', image_count: '', annotation_count: '', storage_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name.trim() || !form.version.trim()) { setErr('Name and version required'); return; }
    setSaving(true); setErr('');
    try {
      const classes = form.class_list_raw.split(',').map((s) => s.trim()).filter(Boolean);
      await apiFetch('/api/datasets', {
        method: 'POST',
        body: JSON.stringify({
          name:             form.name.trim(),
          version:          form.version.trim(),
          description:      form.description.trim() || undefined,
          source:           form.source,
          class_list:       classes,
          image_count:      form.image_count ? parseInt(form.image_count) : 0,
          annotation_count: form.annotation_count ? parseInt(form.annotation_count) : 0,
          storage_url:      form.storage_url.trim() || undefined,
        }),
      });
      onSaved();
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="font-bold text-slate-800">Register Dataset</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Name *</label>
              <input className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="YOLO Defect v2" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Version *</label>
              <input className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="v1" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Description</label>
            <textarea className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Source</label>
            <select className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" value={form.source} onChange={(e) => set('source', e.target.value)}>
              <option value="manual">Manual Upload</option>
              <option value="auto_export">Auto Export</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Classes (comma-separated)</label>
            <input className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" value={form.class_list_raw} onChange={(e) => set('class_list_raw', e.target.value)} placeholder="crack, corrosion, missing_bolt" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Image Count</label>
              <input type="number" min="0" className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" value={form.image_count} onChange={(e) => set('image_count', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Annotation Count</label>
              <input type="number" min="0" className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" value={form.annotation_count} onChange={(e) => set('annotation_count', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Storage URL (optional)</label>
            <input className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" value={form.storage_url} onChange={(e) => set('storage_url', e.target.value)} placeholder="https://..." />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GenerateModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', version: '', description: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const generate = async () => {
    setLoading(true); setErr('');
    try {
      const r = await apiFetch('/api/datasets/from-export', {
        method: 'POST',
        body: JSON.stringify({
          name:        form.name.trim() || undefined,
          version:     form.version.trim() || undefined,
          description: form.description.trim() || undefined,
        }),
      });
      setResult(r);
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-600" /> Generate from Verified Defects
          </h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          {!result ? (
            <>
              <p className="text-xs text-slate-500">Pulls all confirmed-status defects, builds a YOLO-format ZIP, uploads to Cloudinary, and registers it as a new dataset.</p>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Dataset Name (optional)</label>
                <input className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Auto-named if blank" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Version (optional)</label>
                <input className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="Auto-versioned if blank" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Description (optional)</label>
                <textarea className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
              </div>
              {err && <p className="text-xs text-red-600">{err}</p>}
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">Dataset generated!</span>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
                <p><span className="text-slate-500">Name:</span> <strong>{result.dataset.name}</strong> {result.dataset.version}</p>
                <p><span className="text-slate-500">Images:</span> {result.image_count}</p>
                <p><span className="text-slate-500">Classes:</span> {result.class_count}</p>
                {result.storage_url && (
                  <p><a href={result.storage_url} target="_blank" rel="noreferrer" className="text-primary underline">Download ZIP</a></p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button onClick={generate} disabled={loading} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
              {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {loading ? 'Generating…' : 'Generate'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DatasetCard({ dataset, onArchive, onDelete }) {
  const src = SOURCE_CONFIG[dataset.source] ?? SOURCE_CONFIG.manual;
  const st  = STATUS_CONFIG[dataset.status]  ?? STATUS_CONFIG.active;
  const classes = Array.isArray(dataset.class_list) ? dataset.class_list : [];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-400 font-mono mb-0.5">{dataset.version}</p>
          <h3 className="text-sm font-bold text-slate-800 leading-tight truncate" title={dataset.name}>{dataset.name}</h3>
        </div>
        <div className="flex flex-col gap-1 items-end shrink-0">
          <Badge cfg={src} />
          <Badge cfg={st} />
        </div>
      </div>

      {dataset.description && (
        <p className="text-xs text-slate-500 leading-relaxed">{dataset.description}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 rounded-lg p-2.5 text-center">
          <p className="text-sm font-bold text-slate-800">{dataset.image_count.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 uppercase">Images</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5 text-center">
          <p className="text-sm font-bold text-slate-800">{dataset.annotation_count.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 uppercase">Annotations</p>
        </div>
      </div>

      <div>
        <p className="text-[10px] text-slate-400 uppercase mb-1.5">Classes ({classes.length})</p>
        <ClassChips list={classes} />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <p className="text-[10px] text-slate-400">
          {new Date(dataset.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
        </p>
        <div className="flex items-center gap-1">
          {dataset.storage_url && (
            <a href={dataset.storage_url} target="_blank" rel="noreferrer"
              className="p-1.5 text-slate-400 hover:text-primary hover:bg-slate-100 rounded" title="Download">
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
          {dataset.status === 'active' && (
            <button onClick={() => onArchive(dataset.id)}
              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded" title="Archive">
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => onDelete(dataset.id)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function DatasetManagementPortal() {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showRegister, setShowReg] = useState(false);
  const [showGenerate, setShowGen] = useState(false);
  const [filter, setFilter]       = useState('active');

  const load = () => {
    setLoading(true); setError(null);
    apiFetch(`/api/datasets?status=${filter}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const archive = async (id) => {
    try { await apiFetch(`/api/datasets/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'archived' }) }); load(); }
    catch (e) { alert(e.message); }
  };

  const del = async (id) => {
    if (!window.confirm('Hard-delete this dataset? This cannot be undone.')) return;
    try { await apiFetch(`/api/datasets/${id}?hard=true`, { method: 'DELETE' }); load(); }
    catch (e) { alert(e.message); }
  };

  const summary = data?.summary ?? { total: 0, images: 0, annotations: 0, classes: 0 };
  const datasets = data?.datasets ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" /> Dataset Management Portal
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">AI training dataset registry</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 bg-white disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => setShowGen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700">
            <Zap className="w-3.5 h-3.5" /> Generate from Defects
          </button>
          <button onClick={() => setShowReg(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> Register
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Datasets', value: summary.total,       icon: Database, color: 'text-slate-700' },
          { label: 'Total Images',   value: summary.images,      icon: Image,    color: 'text-blue-600'  },
          { label: 'Annotations',    value: summary.annotations, icon: Tag,      color: 'text-green-600' },
          { label: 'Unique Classes', value: summary.classes,     icon: BookOpen, color: 'text-purple-600'},
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-[10px] text-slate-400 uppercase font-bold">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {['active', 'archived', 'all'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize ${filter === s ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Dataset Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-slate-100 rounded-xl h-52 animate-pulse" />)}
        </div>
      ) : datasets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Database className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No datasets registered.</p>
          <p className="text-slate-400 text-sm mt-1">Register one manually or generate from verified defects.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map((d) => (
            <DatasetCard key={d.id} dataset={d} onArchive={archive} onDelete={del} />
          ))}
        </div>
      )}

      {showRegister && <RegisterModal onClose={() => setShowReg(false)} onSaved={load} />}
      {showGenerate && <GenerateModal onClose={() => setShowGen(false)} onSaved={load} />}
    </div>
  );
}
