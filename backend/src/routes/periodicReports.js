const fs = require('fs');
const path = require('path');
const prisma = require('../db/client');
const { generatePeriodicReport, getPreviousPeriod } = require('../services/periodicReportScheduler');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const PERIOD_TYPES = new Set(['shift', 'day', 'week']);

function serialize(r) {
  return { ...r, system_uptime_pct: r.system_uptime_pct != null ? Number(r.system_uptime_pct) : null };
}

async function periodicReports(fastify) {
  // GET /api/periodic-reports?periodType=&limit=
  fastify.get('/', async (req) => {
    const periodType = req.query.periodType;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const reports = await prisma.periodicReport.findMany({
      where: periodType ? { period_type: periodType } : {},
      orderBy: { period_start: 'desc' },
      take: limit,
    });

    return { reports: reports.map(serialize) };
  });

  // POST /api/periodic-reports/generate { periodType }
  // Manual trigger for the most recently completed period — useful for demos/testing
  // since real boundaries roll over slowly (a "week" report only auto-generates once a week).
  fastify.post('/generate', async (req, reply) => {
    const periodType = req.body?.periodType;
    if (!PERIOD_TYPES.has(periodType)) {
      reply.status(400);
      return { error: 'periodType must be shift, day, or week' };
    }

    const period = getPreviousPeriod(periodType);
    const report = await generatePeriodicReport(periodType, period);
    return { report: serialize(report) };
  });

  // GET /api/periodic-reports/:id/pdf — serve the locally-rendered PDF
  // (Cloudinary blocks raw PDF delivery by default, same as per-session reports)
  fastify.get('/:id/pdf', async (req, reply) => {
    const pdfPath = path.join(UPLOAD_DIR, 'reports', `periodic_${req.params.id}.pdf`);
    if (!fs.existsSync(pdfPath)) {
      reply.status(404);
      return { error: 'Periodic report PDF not found. Generate it first via POST /api/periodic-reports/generate.' };
    }
    reply.type('application/pdf');
    reply.header('Content-Disposition', `inline; filename="periodic_report_${req.params.id}.pdf"`);
    return fs.createReadStream(pdfPath);
  });
}

module.exports = periodicReports;
