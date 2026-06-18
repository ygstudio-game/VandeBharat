const prisma = require('../db/client');

const LOG_TYPES = new Set(['false_positive', 'false_negative', 'confirmed']);

// Nested under /api/sessions — capture mechanism for FP/FN inspector feedback.
async function reviewLog(fastify) {
  // POST /api/sessions/:id/review-log
  fastify.post('/:id/review-log', async (req, reply) => {
    const { log_type, defect_id, coach_id, defect_type, coach_number, notes } = req.body || {};

    if (!LOG_TYPES.has(log_type)) {
      reply.status(400);
      return { error: `log_type must be one of: ${[...LOG_TYPES].join(', ')}` };
    }

    const session = await prisma.inspectionSession.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    const entry = await prisma.defectReviewLog.create({
      data: {
        session_id: req.params.id,
        coach_id: coach_id || null,
        defect_id: defect_id || null,
        log_type,
        defect_type: defect_type || null,
        coach_number: coach_number || null,
        notes: notes || null,
      },
    });

    // Keep the underlying Defect row's review_status in sync when reviewing an AI detection.
    if (defect_id && (log_type === 'false_positive' || log_type === 'confirmed')) {
      await prisma.defect.update({
        where: { id: defect_id },
        data: { review_status: log_type, reviewed_at: new Date(), review_notes: notes || null },
      }).catch(() => {}); // defect_id may not exist — log entry already created, don't fail the request
    }

    return { entry };
  });

  // GET /api/sessions/:id/review-log
  fastify.get('/:id/review-log', async (req) => {
    const entries = await prisma.defectReviewLog.findMany({
      where: { session_id: req.params.id },
      orderBy: { created_at: 'desc' },
    });
    return { entries };
  });
}

module.exports = reviewLog;
