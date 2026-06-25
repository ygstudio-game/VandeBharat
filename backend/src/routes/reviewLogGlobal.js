const prisma = require('../db/client');

// Flat cross-session view of the FP/FN review log — used by Historical Reports.
async function reviewLogGlobal(fastify) {
  // GET /api/review-log?logType=&limit=&offset=
  fastify.get('/', async (req) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const logType = req.query.logType;
    const trainNumber = req.query.trainNumber?.trim();
    const station = req.query.station?.trim();
    const date = req.query.date?.trim();

    // Train number / station filters via parent session relation
    const sessionFilter = {
      ...(trainNumber ? { train_number: { contains: trainNumber, mode: 'insensitive' } } : {}),
      ...(station ? { station: { station_name: station } } : {}),
    };

    // Single-day date filter on created_at → [date, date + 1 day)
    let dateRange = {};
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        dateRange = { created_at: { gte: start, lt: end } };
      }
    }

    const where = {
      ...(logType ? { log_type: logType } : {}),
      ...(Object.keys(sessionFilter).length ? { session: sessionFilter } : {}),
      ...dateRange,
    };

    const [total, entries] = await Promise.all([
      prisma.defectReviewLog.count({ where }),
      prisma.defectReviewLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
        include: {
          session: { select: { train_number: true, session_code: true, station: { select: { station_name: true } } } },
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
        station_name: e.session?.station?.station_name ?? null,
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
