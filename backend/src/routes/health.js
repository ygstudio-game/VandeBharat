const http = require('http');
const { execFile } = require('child_process');
const { getDlqDepth } = require('../queue/queue');

const PIPELINE_STREAMS = ['ocr_detection', 'synchronization', 'correlation', 'report_generation'];

const SERVICES = [
  { name: 'YOLO',       port: 5002, label: 'Defect Detector' },
  { name: 'OCR',        port: 5000, label: 'PaddleOCR Engine' },
  { name: 'FRAME-EXT',  port: 5003, label: 'Frame Extractor' },
  { name: 'SYNC-ENG',   port: 5004, label: 'Sync Engine' },
  { name: 'CORRELATE',  port: 5005, label: 'Correlation Service' },
  { name: 'REPORT-GEN', port: 5006, label: 'Report Generator' },
];

function pingService(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: '127.0.0.1', port, path: '/health', timeout: 3000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200 ? 'healthy' : 'degraded');
      }
    );
    req.on('error',   () => resolve('offline'));
    req.on('timeout', () => { req.destroy(); resolve('offline'); });
  });
}

// No physical Jetson device available yet — return plausible simulated values
// until real sensor reads (CPU temp, SSD health, UPS) can be wired in (decision: 2026-06-18).
function simulate(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

// GPU utilization/VRAM/temperature ARE real when an NVIDIA GPU + driver is
// present — `nvidia-smi` ships with every CUDA install these services already
// require, so this isn't an extra dependency. Returns null on any failure
// (no GPU, no driver, not on PATH) and the route falls back to simulated
// values for just that field instead of failing the whole request.
function readNvidiaSmi() {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits'],
      { timeout: 3000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const line = stdout.trim().split('\n')[0];
        const [util, memUsed, memTotal, temp] = line.split(',').map((s) => parseFloat(s.trim()));
        if ([util, memUsed, memTotal, temp].some(Number.isNaN)) return resolve(null);
        resolve({
          utilization_pct: util,
          temperature_c: temp,
          vram_used_gb: Math.round((memUsed / 1024) * 10) / 10,
          vram_total_gb: Math.round((memTotal / 1024) * 10) / 10,
        });
      },
    );
  });
}

async function healthRoutes(fastify) {
  // GET /api/health/services
  fastify.get('/services', async () => {
    const results = await Promise.all(
      SERVICES.map(async (svc) => ({
        name:   svc.name,
        label:  svc.label,
        port:   svc.port,
        status: await pingService(svc.port),
      }))
    );
    return { services: results };
  });

  // GET /api/health/queue — real dead-letter depth per pipeline stage (NOT simulated)
  fastify.get('/queue', async () => {
    const depths = await Promise.all(PIPELINE_STREAMS.map((stage) => getDlqDepth(stage)));
    const dlq = Object.fromEntries(PIPELINE_STREAMS.map((stage, i) => [stage, depths[i]]));
    return {
      simulated: false,
      timestamp: new Date().toISOString(),
      dead_letter_depth: dlq,
      total_dead_letter: depths.reduce((a, b) => a + b, 0),
    };
  });

  // GET /api/health/system — GPU is real (nvidia-smi) when available; CPU/memory/SSD/UPS still simulated
  fastify.get('/system', async () => {
    const realGpu = await readNvidiaSmi();

    return {
      simulated: !realGpu, // top-level flag now reflects whether ANY real reading was used
      gpu_simulated: !realGpu,
      timestamp: new Date().toISOString(),
      gpu: realGpu || {
        utilization_pct: simulate(35, 85),
        temperature_c: simulate(48, 68),
        vram_used_gb: simulate(3.5, 7.2),
        vram_total_gb: 8,
      },
      cpu: {
        utilization_pct: simulate(15, 60),
        temperature_c: simulate(40, 55),
      },
      memory: {
        used_gb: simulate(4, 10),
        total_gb: 16,
      },
      ssd: {
        used_gb: simulate(120, 380),
        total_gb: 512,
        health_pct: simulate(92, 99),
      },
      ups: {
        battery_pct: simulate(75, 100),
        on_mains: true,
      },
    };
  });
}

module.exports = healthRoutes;
