const http = require('http');

const SERVICES = [
  { name: 'YOLO',       port: 5002, label: 'YOLO Defect Detector' },
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
}

module.exports = healthRoutes;
