const prisma = require('../db/client');

// Flat cross-session view of the FP/FN review log — used by Historical Reports.
async function reviewLogGlobal(fastify) {
  // GET /api/review-log?logType=&limit=&offset=
  fastify.get('/', async (req) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const logType = req.query.logType;

    const where = logType ? { log_type: logType } : {};

    const [total, entries] = await Promise.all([
      prisma.defectReviewLog.count({ where }),
      prisma.defectReviewLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
        include: {
          session: { select: { train_number: true, session_code: true } },
        },
      }),
    ]);

    return {
      total,
      entries: entries.map((e) => ({
        id: e.id,
        session_id: e.session_id,
        train_number: e.session?.train_number ?? null,
        session_code: e.session?.session_code ?? null,
        log_type: e.log_type,
        defect_type: e.defect_type,
        coach_number: e.coach_number,
        notes: e.notes,
        created_at: e.created_at,
      })),
    };
  });
}

module.exports = reviewLogGlobal;
