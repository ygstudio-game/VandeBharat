/**
 * Defect Verification Console (Module 12) — human-in-the-loop review queue.
 * review_status values follow the existing convention from reviewLog.js:
 * 'pending' (default) | 'confirmed' | 'false_positive'. The module-12 plan
 * doc said to query 'unreviewed' — that value never existed in the schema
 * (default is 'pending'), would have returned an empty queue forever. Using
 * the real convention here.
 */
const prisma = require('../db/client');
const { logAction } = require('../services/auditLog');

const REVIEW_STATUSES = new Set(['confirmed', 'false_positive']);

async function defectsRoutes(fastify) {
  // GET /api/defects/pending-review?limit=50&offset=0
  fastify.get('/pending-review', async (req) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const [defects, total] = await Promise.all([
      prisma.defect.findMany({
        where: { review_status: 'pending' },
        orderBy: { created_at: 'asc' },
        take: limit,
        skip: offset,
        include: {
          frame: { select: { cloudinary_url: true, width_px: true, height_px: true } },
          coach: { select: { coach_number: true, coach_type: true } },
          session: { select: { train_number: true, session_code: true } },
        },
      }),
      prisma.defect.count({ where: { review_status: 'pending' } }),
    ]);

    return {
      defects: defects.map((d) => ({
        id: d.id,
        session_id: d.session_id,
        coach_id: d.coach_id,
        defect_type: d.defect_type,
        severity: d.severity,
        confidence: Number(d.confidence),
        bbox: d.bbox_x != null ? { x: d.bbox_x, y: d.bbox_y, w: d.bbox_w, h: d.bbox_h } : null,
        ai_notes: d.ai_notes,
        annotated_frame_url: d.annotated_frame_url,
        frame_url: d.frame?.cloudinary_url || null,
        frame_width: d.frame?.width_px || null,
        frame_height: d.frame?.height_px || null,
        coach_number: d.coach?.coach_number || null,
        coach_type: d.coach?.coach_type || null,
        train_number: d.session?.train_number || null,
        session_code: d.session?.session_code || null,
        created_at: d.created_at,
      })),
      total,
    };
  });

  // PATCH /api/defects/:id/review { status: 'confirmed' | 'false_positive', notes }
  fastify.patch('/:id/review', async (req, reply) => {
    const { status, notes } = req.body || {};
    if (!REVIEW_STATUSES.has(status)) {
      reply.status(400);
      return { error: `status must be one of: ${[...REVIEW_STATUSES].join(', ')}` };
    }

    const existing = await prisma.defect.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      reply.status(404);
      return { error: 'Defect not found' };
    }

    const defect = await prisma.defect.update({
      where: { id: req.params.id },
      data: {
        review_status: status,
        reviewed_by: req.user.id,
        reviewed_at: new Date(),
        review_notes: notes || null,
      },
    });

    // Same audit trail the export-manifest job (Day 4 training export) already
    // reads from — keeps both export paths (JSON manifest + YOLO dataset) fed
    // by one source of reviewer feedback.
    await prisma.defectReviewLog.create({
      data: {
        session_id: defect.session_id,
        coach_id: defect.coach_id,
        defect_id: defect.id,
        log_type: status,
        defect_type: defect.defect_type,
        notes: notes || null,
        logged_by: req.user.id,
      },
    });

    await logAction({
      userId: req.user.id, sessionId: defect.session_id, action: 'DEFECT_REVIEWED',
      resourceType: 'Defect', resourceId: defect.id, ip: req.ip,
      metadata: { status, defect_type: defect.defect_type },
    });

    return { defect };
  });
}

module.exports = defectsRoutes;
