const prisma = require('../db/client');

const RANGE_DAYS = { '24h': 1, '7d': 7, '30d': 30 };

function rangeStart(range) {
  const days = RANGE_DAYS[range] || 7;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function analytics(fastify) {
  // GET /api/analytics/defects-over-time?range=24h|7d|30d
  fastify.get('/defects-over-time', async (req) => {
    const range = req.query.range || '7d';
    const since = rangeStart(range);

    const defects = await prisma.defect.findMany({
      where: { created_at: { gte: since } },
      select: { created_at: true },
    });

    const bucketKey = (d) => (range === '24h'
      ? `${String(d.getHours()).padStart(2, '0')}:00`
      : d.toISOString().slice(0, 10));

    const buckets = {};
    for (const d of defects) {
      const key = bucketKey(new Date(d.created_at));
      buckets[key] = (buckets[key] || 0) + 1;
    }

    const series = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, count]) => ({ bucket, count }));

    return { range, series };
  });

  // GET /api/analytics/defects-by-type?range=24h|7d|30d
  fastify.get('/defects-by-type', async (req) => {
    const range = req.query.range || '7d';
    const since = rangeStart(range);

    const grouped = await prisma.defect.groupBy({
      by: ['defect_type'],
      where: { created_at: { gte: since } },
      _count: { _all: true },
    });

    return {
      range,
      series: grouped
        .map((g) => ({ defect_type: g.defect_type, count: g._count._all }))
        .sort((a, b) => b.count - a.count),
    };
  });

  // GET /api/analytics/defects-by-coach-class?range=24h|7d|30d
  fastify.get('/defects-by-coach-class', async (req) => {
    const range = req.query.range || '7d';
    const since = rangeStart(range);

    const defects = await prisma.defect.findMany({
      where: { created_at: { gte: since } },
      select: { coach: { select: { coach_type: true } } },
    });

    const counts = {};
    for (const d of defects) {
      const key = d.coach?.coach_type || 'Unclassified';
      counts[key] = (counts[key] || 0) + 1;
    }

    return {
      range,
      series: Object.entries(counts)
        .map(([coach_class, count]) => ({ coach_class, count }))
        .sort((a, b) => b.count - a.count),
    };
  });

  // GET /api/analytics/inference-latency?range=24h|7d|30d
  fastify.get('/inference-latency', async (req) => {
    const range = req.query.range || '7d';
    const since = rangeStart(range);

    const stages = await prisma.pipelineStage.findMany({
      where: {
        status: 'completed',
        started_at: { not: null, gte: since },
        completed_at: { not: null },
      },
      select: { stage: true, started_at: true, completed_at: true },
    });

    const sums = {};
    for (const s of stages) {
      const ms = new Date(s.completed_at).getTime() - new Date(s.started_at).getTime();
      if (ms < 0) continue;
      if (!sums[s.stage]) sums[s.stage] = { total: 0, count: 0 };
      sums[s.stage].total += ms;
      sums[s.stage].count += 1;
    }

    return {
      range,
      series: Object.entries(sums).map(([stage, { total, count }]) => ({
        stage,
        avg_duration_ms: Math.round(total / count),
        samples: count,
      })),
    };
  });
}

module.exports = analytics;
