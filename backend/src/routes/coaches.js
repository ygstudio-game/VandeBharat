const prisma = require('../db/client');

async function coaches(fastify) {
  // GET /api/coaches/search?q=<coach number or train number>
  fastify.get('/search', async (req) => {
    const q = (req.query.q || '').trim();
    if (!q) return { coaches: [] };

    const matches = await prisma.coach.findMany({
      where: {
        OR: [
          { coach_number: { contains: q, mode: 'insensitive' } },
          { session: { train_number: { contains: q, mode: 'insensitive' } } },
        ],
      },
      orderBy: { created_at: 'desc' },
      take: 50,
      include: {
        session: {
          select: {
            id: true,
            session_code: true,
            train_number: true,
            started_at: true,
            status: true,
            station_code: true,
          },
        },
        _count: { select: { defects: true, missing_components_list: true, ocr_results: true } },
      },
    });

    return {
      coaches: matches.map((c) => ({
        id: c.id,
        coach_number: c.coach_number,
        coach_type: c.coach_type,
        coach_index: c.coach_index,
        health_score: c.health_score != null ? Number(c.health_score) : null,
        critical_defects: c.critical_defects,
        missing_components: c.missing_components,
        total_frames: c.total_frames,
        defect_count: c._count.defects,
        ocr_result_count: c._count.ocr_results,
        session_id: c.session.id,
        session_code: c.session.session_code,
        train_number: c.session.train_number,
        session_status: c.session.status,
        started_at: c.session.started_at,
        station_code: c.session.station_code,
      })),
    };
  });
}

module.exports = coaches;
