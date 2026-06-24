const prisma = require('../db/client');

async function dashboard(fastify) {
  // GET /api/dashboard/kpis
  fastify.get('/kpis', async () => {
    const [total, today, completed, active, queued, failed, unsignedReports, defectStats] = await Promise.all([
      prisma.inspectionSession.count(),
      prisma.inspectionSession.count({
        where: { started_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      prisma.inspectionSession.count({
        where: { status: 'completed' },
      }),
      prisma.inspectionSession.count({
        where: { status: { notIn: ['completed', 'failed', 'queued'] } },
      }),
      prisma.inspectionSession.count({
        where: { status: 'queued' },
      }),
      prisma.inspectionSession.count({
        where: { status: 'failed' },
      }),
      // Reports generated but awaiting signature — the "Reports to Sign" count.
      prisma.report.count({
        where: { is_signed: false, generated_at: { not: null } },
      }),
      prisma.inspectionSession.aggregate({
        _sum: { critical_defects: true },
        _avg: { health_score: true },
      }),
    ]);

    return {
      total_sessions: total,
      sessions_today: today,
      completed_sessions: completed,
      active_sessions: active,
      queued_sessions: queued,
      failed_sessions: failed,
      unsigned_reports: unsignedReports,
      critical_defects: defectStats._sum.critical_defects ?? 0,
      avg_health_score: defectStats._avg.health_score
        ? Number(defectStats._avg.health_score.toFixed(1))
        : null,
    };
  });

  // GET /api/dashboard/recent-defects
  fastify.get('/recent-defects', async (req) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

    const defects = await prisma.defect.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        defect_type: true,
        severity: true,
        confidence: true,
        bbox_x: true,
        bbox_y: true,
        bbox_w: true,
        bbox_h: true,
        session: {
          select: {
            id: true,
            train_number: true,
            started_at: true,
            station: { select: { station_name: true } },
          },
        },
        coach: { select: { coach_number: true } },
        frame: {
          select: {
            sequence_number: true,
            captured_at_ms: true,
            cloudinary_url: true,
            thumbnail_url: true,
            session_camera: { select: { camera_type: true, name: true } },
          },
        },
      },
    });

    return {
      defects: defects.map((d) => ({
        id: d.id,
        defect_type: d.defect_type,
        severity: d.severity,
        confidence: d.confidence != null ? Number(d.confidence) : null,
        bbox: d.bbox_x != null ? { x: d.bbox_x, y: d.bbox_y, w: d.bbox_w, h: d.bbox_h } : null,
        session_id: d.session?.id ?? null,
        train_number: d.session?.train_number ?? null,
        station_name: d.session?.station?.station_name ?? null,
        coach_number: d.coach?.coach_number ?? null,
        sequence_number: d.frame?.sequence_number ?? null,
        captured_at_ms: d.frame?.captured_at_ms != null ? Number(d.frame.captured_at_ms) : null,
        session_started_at: d.session?.started_at ?? null,
        cloudinary_url: d.frame?.cloudinary_url ?? null,
        thumbnail_url: d.frame?.thumbnail_url ?? null,
        camera_name: d.frame?.session_camera?.name ?? null,
        camera_type: d.frame?.session_camera?.camera_type ?? null,
      })),
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
