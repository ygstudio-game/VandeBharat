const prisma = require('../db/client');

async function dashboard(fastify) {
  // GET /api/dashboard/kpis
  fastify.get('/kpis', async () => {
    const [total, today, defectStats] = await Promise.all([
      prisma.inspectionSession.count(),
      prisma.inspectionSession.count({
        where: { started_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      prisma.inspectionSession.aggregate({
        _sum: { critical_defects: true },
        _avg: { health_score: true },
      }),
    ]);

    return {
      total_sessions: total,
      sessions_today: today,
      critical_defects: defectStats._sum.critical_defects ?? 0,
      avg_health_score: defectStats._avg.health_score
        ? Number(defectStats._avg.health_score.toFixed(1))
        : null,
    };
  });

  // GET /api/dashboard/live-queue
  fastify.get('/live-queue', async () => {
    const queue = await prisma.inspectionSession.findMany({
      where: { status: { notIn: ['completed', 'failed'] } },
      orderBy: { started_at: 'desc' },
      include: {
        pipeline_stages: { select: { stage: true, status: true, progress_pct: true } },
      },
    });

    return {
      queue: queue.map((s) => ({
        id: s.id,
        session_code: s.session_code,
        train_number: s.train_number,
        status: s.status,
        progress_pct: s.progress_pct,
        started_at: s.started_at,
        pipeline_stages: s.pipeline_stages,
      })),
    };
  });
}

module.exports = dashboard;
