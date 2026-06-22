const prisma = require('../db/client');

async function history(fastify) {
  // GET /api/history/passages?train_number=&date_from=&date_to=&status=&limit=50&offset=0
  fastify.get('/passages', async (req, reply) => {
    const { train_number, date_from, date_to, status, limit = '50', offset = '0' } = req.query;

    const where = {};
    if (train_number) where.train_number = { contains: train_number, mode: 'insensitive' };
    if (status)       where.status       = status;
    if (date_from || date_to) {
      where.started_at = {};
      if (date_from) where.started_at.gte = new Date(date_from);
      if (date_to)   where.started_at.lte = new Date(new Date(date_to).setDate(new Date(date_to).getDate() + 1));
    }

    const [rows, total] = await Promise.all([
      prisma.inspectionSession.findMany({
        where,
        orderBy: { started_at: 'desc' },
        take:    parseInt(limit,  10),
        skip:    parseInt(offset, 10),
        include: {
          station: { select: { station_name: true } },
          _count:  { select: { coaches: true, defects: true, frames: true } },
          report:  { select: { pdf_url: true, status: true } },
        },
      }),
      prisma.inspectionSession.count({ where }),
    ]);

    return {
      passages: rows.map(s => ({
        id:                      s.id,
        session_code:            s.session_code,
        train_number:            s.train_number,
        train_type:              s.train_type,
        station_name:            s.station?.station_name || null,
        status:                  s.status,
        health_score:            s.health_score            ? Number(s.health_score)   : null,
        ocr_confidence:          s.ocr_confidence          ? Number(s.ocr_confidence) : null,
        total_coaches:           s.total_coaches,
        total_frames:            s.total_frames,
        critical_defects:        s.critical_defects,
        missing_components_count:s.missing_components_count,
        defects_count:           s._count.defects,
        frames_count:            s._count.frames,
        started_at:              s.started_at,
        completed_at:            s.completed_at,
        report_pdf_url:          s.report?.pdf_url   || null,
        report_status:           s.report?.status    || null,
      })),
      total,
      limit:  parseInt(limit,  10),
      offset: parseInt(offset, 10),
    };
  });

  // GET /api/history/train/:trainNumber/trend
  fastify.get('/train/:trainNumber/trend', async (req, reply) => {
    const rows = await prisma.inspectionSession.findMany({
      where:   { train_number: req.params.trainNumber, status: 'completed' },
      orderBy: { started_at: 'asc' },
      select:  {
        id:               true,
        session_code:     true,
        started_at:       true,
        completed_at:     true,
        health_score:     true,
        critical_defects: true,
        total_coaches:    true,
        _count: { select: { defects: true } },
      },
    });

    return {
      train_number: req.params.trainNumber,
      data_points: rows.map(s => ({
        id:               s.id,
        session_code:     s.session_code,
        date:             s.started_at,
        health_score:     s.health_score ? Number(s.health_score) : null,
        critical_defects: s.critical_defects,
        total_defects:    s._count.defects,
        total_coaches:    s.total_coaches,
      })),
    };
  });

  // GET /api/history/compare?session_a=<id>&session_b=<id>
  fastify.get('/compare', async (req, reply) => {
    const { session_a, session_b } = req.query;
    if (!session_a || !session_b) {
      reply.status(400);
      return { error: 'session_a and session_b are required' };
    }

    const [a, b] = await Promise.all([
      prisma.inspectionSession.findUnique({
        where:   { id: session_a },
        include: {
          defects: {
            select: {
              id: true, defect_type: true, severity: true, confidence: true,
              review_status: true, annotated_frame_url: true,
              coach: { select: { coach_number: true, coach_index: true } },
            },
            orderBy: { created_at: 'asc' },
          },
          coaches: { select: { id: true, coach_number: true, coach_index: true, health_score: true }, orderBy: { coach_index: 'asc' } },
        },
      }),
      prisma.inspectionSession.findUnique({
        where:   { id: session_b },
        include: {
          defects: {
            select: {
              id: true, defect_type: true, severity: true, confidence: true,
              review_status: true, annotated_frame_url: true,
              coach: { select: { coach_number: true, coach_index: true } },
            },
            orderBy: { created_at: 'asc' },
          },
          coaches: { select: { id: true, coach_number: true, coach_index: true, health_score: true }, orderBy: { coach_index: 'asc' } },
        },
      }),
    ]);

    if (!a) { reply.status(404); return { error: `Session ${session_a} not found` }; }
    if (!b) { reply.status(404); return { error: `Session ${session_b} not found` }; }

    function mapSession(s) {
      return {
        id:               s.id,
        session_code:     s.session_code,
        train_number:     s.train_number,
        started_at:       s.started_at,
        health_score:     s.health_score ? Number(s.health_score) : null,
        critical_defects: s.critical_defects,
        total_coaches:    s.total_coaches,
        defects:          s.defects.map(d => ({
          ...d,
          confidence: d.confidence ? Number(d.confidence) : null,
          coach: d.coach ? { ...d.coach } : null,
        })),
        coaches:          s.coaches.map(c => ({
          ...c,
          health_score: c.health_score ? Number(c.health_score) : null,
        })),
      };
    }

    return { session_a: mapSession(a), session_b: mapSession(b) };
  });
}

module.exports = history;
