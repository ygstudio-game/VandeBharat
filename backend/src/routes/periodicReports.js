const prisma = require('../db/client');
const { generatePeriodicReport, getPreviousPeriod } = require('../services/periodicReportScheduler');

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
}

module.exports = periodicReports;
