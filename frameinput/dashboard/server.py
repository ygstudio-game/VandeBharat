"""
DAQ Control Dashboard — FastAPI backend.

Serves a single-page HTML dashboard and exposes a REST API for:
  - Live metrics  (proxied from Prometheus)
  - Container control  (start / stop ingestion via Docker socket)
  - Bandwidth target  (1–25 GbE, written to shared config file + ingestion restart)
  - Disk management  (usage stats, delete .bin chunk files)
  - Live logs  (last N lines from the ingestion container)

Mount /var/run/docker.sock into this container so it can control siblings.
"""
import glob
import logging
import os
import shutil

import docker
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse

# ── configuration ─────────────────────────────────────────────────────────────

CHUNK_DIR       = os.environ.get("CHUNK_DIR",        "/data/chunks")
PROMETHEUS_URL  = os.environ.get("PROMETHEUS_URL",   "http://prometheus:9090")
INGESTION_SVC   = os.environ.get("INGESTION_SERVICE", "ingestion")

# Shared config file written by dashboard, read by ingestion at startup
_BW_CONFIG_FILE = os.path.join(CHUNK_DIR, ".daq_bandwidth_gbe")

log = logging.getLogger("dashboard")

# ── Docker helpers ─────────────────────────────────────────────────────────────

def _docker():
    return docker.from_env()

def _ingestion_container():
    c = _docker()
    hits = c.containers.list(
        all=True,
        filters={"label": f"com.docker.compose.service={INGESTION_SVC}"},
    )
    return hits[0] if hits else None


# ── Bandwidth config helpers ──────────────────────────────────────────────────

def _read_bw_gbe() -> float:
    try:
        with open(_BW_CONFIG_FILE) as f:
            return float(f.read().strip())
    except Exception:
        return float(os.environ.get("BANDWIDTH_GBE", "10.0"))

def _write_bw_gbe(gbe: float) -> None:
    os.makedirs(CHUNK_DIR, exist_ok=True)
    with open(_BW_CONFIG_FILE, "w") as f:
        f.write(f"{gbe:.2f}\n")


# ── Prometheus helpers ────────────────────────────────────────────────────────

_QUERIES = {
    "throughput_mbps":  "daq_throughput_mbps",
    "frames_written":   "sum(daq_frames_written_total)",
    "bytes_written":    "sum(daq_bytes_written_total)",
    "frames_dropped":   "sum(daq_frames_dropped_total)",
    "chunks_written":   "sum(daq_chunks_written_total)",
    "buffer_fill":      "daq_buffer_fill_ratio",
    "frames_received":  "sum(daq_frames_received_total)",
}

async def _prom_metrics() -> dict:
    out: dict = {}
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            for key, q in _QUERIES.items():
                try:
                    r = await client.get(
                        f"{PROMETHEUS_URL}/api/v1/query", params={"query": q}
                    )
                    result = r.json().get("data", {}).get("result", [])
                    out[key] = float(result[0]["value"][1]) if result else None
                except Exception:
                    out[key] = None
    except Exception:
        out = {k: None for k in _QUERIES}
    # Derive GbE from live throughput
    mbps = out.get("throughput_mbps")
    out["throughput_gbe"] = mbps / 125.0 if mbps is not None else None
    return out


# ── FastAPI ───────────────────────────────────────────────────────────────────

app = FastAPI(title="DAQ Dashboard", docs_url=None, redoc_url=None)


@app.get("/", response_class=HTMLResponse)
async def index():
    return _HTML


@app.get("/health")
async def health():
    return {"ok": True}


@app.get("/api/status")
async def status():
    try:
        container = _ingestion_container()
        cstatus = container.status if container else "not_found"
    except Exception:
        cstatus = "error"

    metrics = await _prom_metrics()

    disk: dict = {}
    try:
        u = shutil.disk_usage(CHUNK_DIR)
        bins = glob.glob(os.path.join(CHUNK_DIR, "*.bin"))
        disk = {
            "total_gb":    u.total / 1e9,
            "used_gb":     u.used  / 1e9,
            "free_gb":     u.free  / 1e9,
            "bin_count":   len(bins),
            "bin_size_gb": sum(os.path.getsize(f) for f in bins) / 1e9,
            "chunk_dir":   CHUNK_DIR,
        }
    except Exception as exc:
        disk = {"error": str(exc)}

    return {
        "container_status": cstatus,
        "metrics": metrics,
        "disk": disk,
        "bandwidth_gbe": _read_bw_gbe(),
    }


@app.get("/api/bandwidth")
async def get_bandwidth():
    gbe = _read_bw_gbe()
    return {"bandwidth_gbe": gbe, "target_mbps": gbe * 125}


@app.post("/api/bandwidth")
async def set_bandwidth(req: Request):
    body = await req.json()
    gbe  = float(body.get("gbe", 10.0))
    gbe  = max(0.5, min(100.0, gbe))       # clamp: 0.5–100 GbE

    _write_bw_gbe(gbe)

    # restart ingestion so it picks up new bandwidth at startup
    try:
        container = _ingestion_container()
        if container and container.status == "running":
            container.restart(timeout=30)
    except Exception as exc:
        log.warning("Could not restart ingestion: %s", exc)

    return {"ok": True, "bandwidth_gbe": gbe, "target_mbps": gbe * 125}


@app.get("/api/logs")
async def logs(lines: int = 25):
    try:
        container = _ingestion_container()
        if not container:
            return {"lines": [], "error": "container not found"}
        raw  = container.logs(tail=lines, timestamps=True)
        text = raw.decode("utf-8", errors="replace")
        return {"lines": [l for l in text.splitlines() if l.strip()][-lines:]}
    except Exception as exc:
        return {"lines": [], "error": str(exc)}


@app.post("/api/ingestion/start")
async def start_ingestion():
    try:
        c = _ingestion_container()
        if not c:
            raise HTTPException(404, "Ingestion container not found")
        if c.status == "running":
            return {"ok": True, "message": "Already running"}
        c.start()
        return {"ok": True, "message": "Ingestion started"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, str(exc))


@app.post("/api/ingestion/stop")
async def stop_ingestion():
    try:
        c = _ingestion_container()
        if not c:
            raise HTTPException(404, "Ingestion container not found")
        if c.status != "running":
            return {"ok": True, "message": "Already stopped"}
        c.stop(timeout=30)
        return {"ok": True, "message": "Ingestion stopped"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, str(exc))


@app.delete("/api/chunks")
async def delete_chunks():
    try:
        bins = glob.glob(os.path.join(CHUNK_DIR, "*.bin"))
        deleted, freed = 0, 0
        for f in bins:
            try:
                freed += os.path.getsize(f)
                os.remove(f)
                deleted += 1
            except Exception:
                pass
        return {"ok": True, "deleted": deleted, "freed_gb": freed / 1e9}
    except Exception as exc:
        raise HTTPException(500, str(exc))


# ── Embedded dashboard HTML ───────────────────────────────────────────────────

_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DAQ Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f1117;color:#e0e0e0;font-family:'Segoe UI',system-ui,sans-serif;padding:28px 32px;min-height:100vh}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;gap:16px;flex-wrap:wrap}
.header h1{font-size:1.4rem;font-weight:700;letter-spacing:-0.02em;color:#fff}
.header .sub{font-size:0.8rem;color:#6b7280;margin-top:3px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.dot.pulse{animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
.badge{display:inline-flex;align-items:center;padding:6px 16px;border-radius:20px;font-weight:700;font-size:0.85rem;letter-spacing:0.05em}
.badge.running{background:#0d3d2f;color:#00d4aa;border:1px solid #00d4aa55}
.badge.exited,.badge.stopped{background:#3d0d0d;color:#ff6b6b;border:1px solid #ff4d4d55}
.badge.not_found,.badge.unknown,.badge.error,.badge.restarting{background:#1e1f2b;color:#6b7280;border:1px solid #2a2d3e}
.section{margin-bottom:28px}
.sec-title{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#4b5563;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.sec-title::after{content:'';flex:1;height:1px;background:#1e1f2b}
/* metric cards */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
.card{background:#13151f;border:1px solid #1e2030;border-radius:12px;padding:18px 16px}
.card-label{font-size:0.72rem;color:#6b7280;margin-bottom:8px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em}
.card-value{font-size:1.75rem;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.card-value.teal{color:#00d4aa}
.card-value.red{color:#ff6b6b}
.card-value.blue{color:#4d9fff}
.card-unit{font-size:0.75rem;color:#6b7280;margin-left:4px}
.card-sub{font-size:0.78rem;color:#4d9fff;margin-top:6px;font-weight:600}
/* disk */
.disk-card{background:#13151f;border:1px solid #1e2030;border-radius:12px;padding:18px 20px}
.bar-wrap{background:#0f1117;border-radius:6px;height:10px;overflow:hidden;margin:10px 0 6px}
.bar-inner{height:100%;border-radius:6px;transition:width 0.4s,background 0.4s}
.bar-ok{background:linear-gradient(90deg,#00d4aa,#4d9fff)}
.bar-warn{background:linear-gradient(90deg,#f59e0b,#ef4444)}
.bar-danger{background:#ef4444}
.disk-row{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center}
.disk-path{font-size:0.75rem;color:#4b5563;font-family:monospace;background:#0f1117;padding:2px 8px;border-radius:4px}
.disk-stats{display:flex;gap:24px;flex-wrap:wrap;margin-top:4px}
.disk-stat{font-size:0.82rem;color:#9ca3af}
.disk-stat strong{color:#e0e0e0}
/* bandwidth selector */
.bw-card{background:#13151f;border:1px solid #1e2030;border-radius:12px;padding:18px 20px}
.bw-desc{font-size:0.8rem;color:#6b7280;margin-bottom:14px;line-height:1.5}
.bw-presets{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.bw-btn{background:#0f1117;color:#9ca3af;border:1px solid #2a2d3e;border-radius:8px;padding:9px 20px;cursor:pointer;font-size:0.85rem;font-weight:700;transition:all 0.15s}
.bw-btn:hover{border-color:#4d9fff;color:#4d9fff;background:#0c1726}
.bw-btn.active{background:#0c1726;border-color:#4d9fff;color:#4d9fff}
.bw-info{font-size:0.8rem;color:#6b7280;padding-top:12px;border-top:1px solid #1e2030}
.bw-info strong{color:#e0e0e0}
/* controls */
.controls{display:flex;gap:10px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:6px;padding:10px 22px;border-radius:10px;border:none;cursor:pointer;font-size:0.88rem;font-weight:700;transition:opacity 0.15s,transform 0.1s}
.btn:hover:not(:disabled){opacity:0.88;transform:translateY(-1px)}
.btn:active:not(:disabled){transform:translateY(0)}
.btn:disabled{opacity:0.35;cursor:not-allowed}
.btn-start{background:#00d4aa;color:#0a1f1a}
.btn-stop{background:#ff4d4d;color:#fff}
.btn-delete{background:#13151f;color:#f59e0b;border:1px solid #f59e0b44}
/* log box */
.log-box{background:#080a10;border:1px solid #1e2030;border-radius:12px;padding:14px 16px;font-family:'Cascadia Code','Fira Code',monospace;font-size:0.73rem;color:#6b7280;max-height:220px;overflow-y:auto;line-height:1.65}
.log-line{white-space:pre-wrap;word-break:break-all}
.log-warn{color:#f59e0b}
.log-err{color:#ff6b6b}
/* modal */
.modal-bg{display:none;position:fixed;inset:0;background:#000000bb;z-index:100;align-items:center;justify-content:center}
.modal-bg.open{display:flex}
.modal{background:#13151f;border:1px solid #2a2d3e;border-radius:14px;padding:28px;max-width:420px;width:90%}
.modal h2{font-size:1.1rem;font-weight:700;margin-bottom:10px;color:#fff}
.modal p{font-size:0.88rem;color:#9ca3af;margin-bottom:16px;line-height:1.6}
.modal-info{background:#0f1117;border-radius:8px;padding:10px 14px;font-size:0.82rem;color:#e0e0e0;margin-bottom:20px}
.modal-actions{display:flex;gap:10px;justify-content:flex-end}
.btn-cancel{background:#1e2030;color:#9ca3af;border:none}
.btn-confirm-del{background:#ff4d4d;color:#fff;border:none}
/* toast */
.toast{position:fixed;bottom:24px;right:24px;background:#13151f;border-radius:10px;padding:12px 20px;font-size:0.875rem;font-weight:500;opacity:0;pointer-events:none;transition:opacity 0.25s;z-index:999;border:1px solid #1e2030;max-width:380px}
.toast.show{opacity:1}
.toast.ok{border-color:#00d4aa55;color:#00d4aa}
.toast.err{border-color:#ff4d4d55;color:#ff6b6b}
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>DAQ Pipeline Dashboard</h1>
    <div class="sub">Last updated: <span id="updated">—</span></div>
  </div>
  <span id="status-badge" class="badge unknown">
    <span class="dot" id="status-dot"></span>
    <span id="status-text">CONNECTING</span>
  </span>
</div>

<!-- Live Metrics -->
<div class="section">
  <div class="sec-title">Live Metrics</div>
  <div class="grid">
    <div class="card">
      <div class="card-label">Throughput</div>
      <div><span class="card-value teal" id="m-throughput">—</span><span class="card-unit">MB/s</span></div>
      <div class="card-sub" id="m-gbe">— GbE</div>
    </div>
    <div class="card">
      <div class="card-label">Frames Written</div>
      <div><span class="card-value" id="m-frames">—</span></div>
    </div>
    <div class="card">
      <div class="card-label">Data Written</div>
      <div><span class="card-value" id="m-bytes">—</span><span class="card-unit">GB</span></div>
    </div>
    <div class="card">
      <div class="card-label">Chunks Written</div>
      <div><span class="card-value" id="m-chunks">—</span></div>
    </div>
    <div class="card">
      <div class="card-label">Frames Dropped</div>
      <div><span class="card-value" id="m-dropped">—</span></div>
    </div>
    <div class="card">
      <div class="card-label">Buffer Fill</div>
      <div><span class="card-value" id="m-buffer">—</span><span class="card-unit">%</span></div>
    </div>
  </div>
</div>

<!-- Bandwidth Target -->
<div class="section">
  <div class="sec-title">Target Bandwidth</div>
  <div class="bw-card">
    <div class="bw-desc">
      Select the simulated GigaEthernet link speed. Cameras' FPS will scale to match.<br>
      <span style="color:#4b5563">1 GbE = 125 MB/s &nbsp;|&nbsp; 10 GbE = 1,250 MB/s &nbsp;|&nbsp; 25 GbE = 3,125 MB/s</span>
    </div>
    <div class="bw-presets">
      <button class="bw-btn" data-gbe="1"  onclick="setBandwidth(1)">1 GbE</button>
      <button class="bw-btn" data-gbe="5"  onclick="setBandwidth(5)">5 GbE</button>
      <button class="bw-btn" data-gbe="10" onclick="setBandwidth(10)">10 GbE</button>
      <button class="bw-btn" data-gbe="15" onclick="setBandwidth(15)">15 GbE</button>
      <button class="bw-btn" data-gbe="25" onclick="setBandwidth(25)">25 GbE</button>
    </div>
    <div class="bw-info">
      Current target: <strong id="bw-current">—</strong> GbE
      &nbsp;=&nbsp; <strong id="bw-mbps">—</strong> MB/s theoretical
      &nbsp;|&nbsp; Live: <strong id="bw-live">—</strong> GbE
    </div>
  </div>
</div>

<!-- Disk -->
<div class="section">
  <div class="sec-title">Disk Storage</div>
  <div class="disk-card">
    <div class="disk-row">
      <span style="font-size:0.82rem;color:#9ca3af">Drive usage</span>
      <span class="disk-path" id="disk-path">/data/chunks</span>
    </div>
    <div class="bar-wrap"><div class="bar-inner bar-ok" id="disk-bar" style="width:0%"></div></div>
    <div class="disk-stats">
      <div class="disk-stat">Used: <strong id="disk-used">—</strong></div>
      <div class="disk-stat">Free: <strong id="disk-free">—</strong></div>
      <div class="disk-stat">Total: <strong id="disk-total">—</strong></div>
    </div>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #1e2030;display:flex;gap:24px;flex-wrap:wrap">
      <div class="disk-stat">.bin files: <strong id="bin-count">—</strong></div>
      <div class="disk-stat">Chunks size: <strong id="bin-size">—</strong></div>
    </div>
  </div>
</div>

<!-- Controls -->
<div class="section">
  <div class="sec-title">Controls</div>
  <div class="controls">
    <button class="btn btn-start" id="btn-start" onclick="startIngestion()">▶ Start Ingestion</button>
    <button class="btn btn-stop"  id="btn-stop"  onclick="stopIngestion()">■ Stop Ingestion</button>
    <button class="btn btn-delete" onclick="openDeleteModal()">🗑 Delete All Chunks</button>
  </div>
</div>

<!-- Logs -->
<div class="section">
  <div class="sec-title">Recent Logs (ingestion)</div>
  <div class="log-box" id="log-box"><span>Loading…</span></div>
</div>

<!-- Delete modal -->
<div class="modal-bg" id="modal">
  <div class="modal">
    <h2>Delete All Chunk Files?</h2>
    <p>This permanently deletes all <code>.bin</code> files from the chunk directory. Data cannot be recovered.</p>
    <div class="modal-info" id="modal-info">Loading…</div>
    <div class="modal-actions">
      <button class="btn btn-cancel" onclick="closeModal()">Cancel</button>
      <button class="btn btn-confirm-del" onclick="confirmDelete()">Yes, Delete All</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
function $(id){ return document.getElementById(id); }

function fmtGB(gb){
  if(gb===null||gb===undefined) return '—';
  if(gb<0.001) return '<1 MB';
  if(gb<1) return (gb*1000).toFixed(0)+' MB';
  return gb.toFixed(2)+' GB';
}
function fmtNum(n){
  if(n===null||n===undefined) return '—';
  if(n>=1e9) return (n/1e9).toFixed(1)+'B';
  if(n>=1e6) return (n/1e6).toFixed(1)+'M';
  if(n>=1e3) return (n/1e3).toFixed(1)+'K';
  return Math.round(n).toLocaleString();
}

let _toastT;
function showToast(msg,ok=true){
  const t=$('toast');
  t.textContent=msg; t.className='toast show '+(ok?'ok':'err');
  clearTimeout(_toastT); _toastT=setTimeout(()=>{t.className='toast';},4500);
}

async function api(method,path,body=null){
  const opts={method,headers:{'Content-Type':'application/json'}};
  if(body) opts.body=JSON.stringify(body);
  const r=await fetch(path,opts);
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

// ── status refresh (every 2s) ─────────────────────────────────────────────────

async function refresh(){
  try{
    const d=await api('GET','/api/status');
    $('updated').textContent=new Date().toLocaleTimeString();

    const st=d.container_status||'unknown';
    const badge=$('status-badge'), dot=$('status-dot');
    badge.className='badge '+st;
    $('status-text').textContent=st.toUpperCase().replace('_',' ');
    dot.style.background=st==='running'?'#00d4aa':'#ff4d4d';
    if(st==='running') dot.classList.add('pulse'); else dot.classList.remove('pulse');

    const m=d.metrics||{};
    function setM(id,val,fn){ $(id).textContent=(val!==null&&val!==undefined)?fn(val):'—'; }
    setM('m-throughput', m.throughput_mbps, v=>v.toFixed(1));
    setM('m-frames',     m.frames_written,  v=>fmtNum(Math.round(v)));
    setM('m-bytes',      m.bytes_written,   v=>(v/1e9).toFixed(2));
    setM('m-chunks',     m.chunks_written,  v=>Math.round(v).toLocaleString());
    setM('m-buffer',     m.buffer_fill,     v=>(v*100).toFixed(1));

    const drops=m.frames_dropped;
    const dropEl=$('m-dropped');
    if(drops!==null&&drops!==undefined){
      dropEl.textContent=Math.round(drops).toLocaleString();
      dropEl.className='card-value '+(drops>0?'red':'teal');
    } else { dropEl.textContent='—'; dropEl.className='card-value'; }

    // GbE live reading
    const gbe=m.throughput_gbe;
    $('m-gbe').textContent=(gbe!==null&&gbe!==undefined)?gbe.toFixed(2)+' GbE':'— GbE';
    $('bw-live').textContent=(gbe!==null&&gbe!==undefined)?gbe.toFixed(2):' —';

    // Bandwidth target
    const bwGbe=d.bandwidth_gbe;
    if(bwGbe!==undefined){
      $('bw-current').textContent=bwGbe.toFixed(1);
      $('bw-mbps').textContent=(bwGbe*125).toFixed(0);
      document.querySelectorAll('.bw-btn').forEach(btn=>{
        btn.classList.toggle('active', Math.abs(parseFloat(btn.dataset.gbe)-bwGbe)<0.5);
      });
    }

    // Disk
    const disk=d.disk||{};
    if(disk.total_gb){
      const pct=disk.used_gb/disk.total_gb*100;
      const bar=$('disk-bar');
      bar.style.width=pct.toFixed(1)+'%';
      bar.className='bar-inner '+(pct>90?'bar-danger':pct>70?'bar-warn':'bar-ok');
      $('disk-used').textContent=fmtGB(disk.used_gb)+' ('+pct.toFixed(1)+'%)';
      $('disk-free').textContent=fmtGB(disk.free_gb);
      $('disk-total').textContent=fmtGB(disk.total_gb);
      $('bin-count').textContent=(disk.bin_count||0)+' files';
      $('bin-size').textContent=fmtGB(disk.bin_size_gb||0);
      if(disk.chunk_dir) $('disk-path').textContent=disk.chunk_dir;
      window._diskInfo=disk;
    }
  } catch(e){ $('updated').textContent='connection error'; }
}

// ── log refresh (every 5s) ────────────────────────────────────────────────────

async function refreshLogs(){
  try{
    const d=await api('GET','/api/logs?lines=25');
    const box=$('log-box');
    if(!d.lines||!d.lines.length){ box.innerHTML='<span>No logs yet.</span>'; return; }
    box.innerHTML=d.lines.map(l=>{
      const cls=l.includes('ERROR')?'log-line log-err':l.includes('WARN')?'log-line log-warn':'log-line';
      return '<div class="'+cls+'">'+l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>';
    }).join('');
    box.scrollTop=box.scrollHeight;
  } catch(e){}
}

// ── bandwidth control ─────────────────────────────────────────────────────────

async function setBandwidth(gbe){
  const mbps=gbe*125;
  if(!confirm('Set target bandwidth to '+gbe+' GbE ('+mbps+' MB/s)?\n\nIngestion will restart automatically to apply the new speed.')) return;
  try{
    await api('POST','/api/bandwidth',{gbe});
    showToast('Bandwidth set to '+gbe+' GbE — ingestion restarting…',true);
    setTimeout(refresh,3000);
  } catch(e){ showToast('Failed: '+e,false); }
}

// ── ingestion controls ────────────────────────────────────────────────────────

async function startIngestion(){
  const btn=$('btn-start'); btn.disabled=true;
  try{ const r=await api('POST','/api/ingestion/start'); showToast(r.message,true); }
  catch(e){ showToast('Failed to start: '+e,false); }
  finally{ btn.disabled=false; }
}
async function stopIngestion(){
  const btn=$('btn-stop'); btn.disabled=true;
  try{ const r=await api('POST','/api/ingestion/stop'); showToast(r.message,true); }
  catch(e){ showToast('Failed to stop: '+e,false); }
  finally{ btn.disabled=false; }
}

// ── delete chunks ─────────────────────────────────────────────────────────────

function openDeleteModal(){
  const info=window._diskInfo||{};
  const count=info.bin_count||0, size=fmtGB(info.bin_size_gb||0);
  $('modal-info').textContent=count+' files  •  '+size+' will be freed';
  $('modal').classList.add('open');
}
function closeModal(){ $('modal').classList.remove('open'); }
async function confirmDelete(){
  closeModal();
  try{
    const r=await api('DELETE','/api/chunks');
    showToast('Deleted '+r.deleted+' files, freed '+fmtGB(r.freed_gb),true);
    refresh();
  } catch(e){ showToast('Delete failed: '+e,false); }
}
$('modal').addEventListener('click',e=>{ if(e.target===$('modal')) closeModal(); });

// ── boot ─────────────────────────────────────────────────────────────────────

refresh();
refreshLogs();
setInterval(refresh, 2000);
setInterval(refreshLogs, 5000);
</script>
</body>
</html>"""
