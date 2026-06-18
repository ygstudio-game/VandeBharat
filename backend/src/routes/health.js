const http = require('http');

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
// until real nvidia-smi / sensor reads can be wired in (decision: 2026-06-18).
function simulate(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
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

  // GET /api/health/system — GPU/CPU/Memory/SSD/UPS telemetry (simulated)
  fastify.get('/system', async () => {
    return {
      simulated: true,
      timestamp: new Date().toISOString(),
      gpu: {
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
