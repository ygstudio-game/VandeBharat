const prisma = require('../db/client');

async function ocrResults(fastify) {
  // GET /api/ocr-results?limit=&offset=&minConfidence=&coachNumber=&validOnly=
  fastify.get('/', async (req) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const minConfidence = req.query.minConfidence != null ? parseFloat(req.query.minConfidence) : null;
    const coachNumber = req.query.coachNumber?.trim();
    const validOnly = req.query.validOnly === 'true';
    const trainNumber = req.query.trainNumber?.trim();
    const station = req.query.station?.trim();
    const date = req.query.date?.trim();

    // Session-relation filter (train number / station)
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
      ...(minConfidence != null && !Number.isNaN(minConfidence) ? { confidence: { gte: minConfidence } } : {}),
      ...(coachNumber ? { coach_number: { contains: coachNumber, mode: 'insensitive' } } : {}),
      ...(validOnly ? { is_valid: true } : {}),
      ...(Object.keys(sessionFilter).length ? { session: sessionFilter } : {}),
      ...dateRange,
    };

    const [total, results] = await Promise.all([
      prisma.ocrResult.count({ where }),
      prisma.ocrResult.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
        include: {
          frame: { select: { cloudinary_url: true, thumbnail_url: true, sequence_number: true } },
          session: { select: { train_number: true, session_code: true, station: { select: { station_name: true } } } },
        },
      }),
    ]);

    return {
      total,
      results: results.map((r) => ({
        id: r.id,
        coach_number: r.coach_number,
        detected_text: r.detected_text,
        confidence: r.confidence != null ? Number(r.confidence) : null,
        is_valid: r.is_valid,
        pass_number: r.pass_number,
        bbox: r.bbox_x != null ? { x: r.bbox_x, y: r.bbox_y, w: r.bbox_w, h: r.bbox_h } : null,
        created_at: r.created_at,
        frame_url: r.frame?.cloudinary_url ?? null,
        thumbnail_url: r.frame?.thumbnail_url ?? null,
        sequence_number: r.frame?.sequence_number ?? null,
        train_number: r.session?.train_number ?? null,
        session_code: r.session?.session_code ?? null,
        station_name: r.session?.station?.station_name ?? null,
      })),
    };
  });
}

module.exports = ocrResults;
