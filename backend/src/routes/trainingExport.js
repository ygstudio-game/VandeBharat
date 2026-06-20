/**
 * Dataset export — turns DefectReviewLog feedback (FP/FN/confirmed) into a
 * versioned training manifest. This is what makes the review log something
 * other than a write-only audit trail: every reviewer correction becomes a
 * traceable input to the next model retrain (Phase 9).
 */
const cloudinary = require('../services/cloudinaryService');
const prisma = require('../db/client');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../services/auditLog');
const { ROLES } = require('../constants/roles');

async function trainingExportRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireRole(ROLES.ADMIN));

  // POST /api/training/export — build a manifest from review-log feedback since `since` (ISO date, optional)
  fastify.post('/export', async (req, reply) => {
    const since = req.body?.since ? new Date(req.body.since) : null;

    const logs = await prisma.defectReviewLog.findMany({
      where: since ? { created_at: { gte: since } } : {},
      orderBy: { created_at: 'asc' },
    });

    if (logs.length === 0) {
      reply.status(404);
      return { error: 'No review-log entries to export for the given window' };
    }

    const defectIds = logs.filter((l) => l.defect_id).map((l) => l.defect_id);
    const defects = defectIds.length
      ? await prisma.defect.findMany({
          where: { id: { in: defectIds } },
          include: { frame: { select: { cloudinary_url: true, trigger_id: true } } },
        })
      : [];
    const defectById = new Map(defects.map((d) => [d.id, d]));

    const samples = logs.map((log) => {
      const defect = log.defect_id ? defectById.get(log.defect_id) : null;
      return {
        review_log_id: log.id,
        session_id: log.session_id,
        coach_number: log.coach_number,
        label_type: log.log_type, // false_positive | false_negative | confirmed
        defect_type: log.defect_type || defect?.defect_type || null,
        frame_url: defect?.frame?.cloudinary_url || null,
        bbox: defect ? { x: defect.bbox_x, y: defect.bbox_y, w: defect.bbox_w, h: defect.bbox_h } : null,
        ai_confidence: defect ? Number(defect.confidence) : null,
        notes: log.notes,
        logged_at: log.created_at,
      };
    });

    const manifest = {
      export_id: `export-${Date.now()}`,
      generated_at: new Date().toISOString(),
      window_since: since ? since.toISOString() : null,
      sample_count: samples.length,
      counts_by_label: samples.reduce((acc, s) => {
        acc[s.label_type] = (acc[s.label_type] || 0) + 1;
        return acc;
      }, {}),
      samples,
    };

    const base64 = Buffer.from(JSON.stringify(manifest, null, 2)).toString('base64');
    const upload = await cloudinary.uploader.upload(
      `data:application/json;base64,${base64}`,
      { resource_type: 'raw', folder: 'vande/training-exports', public_id: manifest.export_id },
    );

    await logAction({
      userId: req.user.id, action: 'DATASET_EXPORTED', resourceType: 'TrainingExport',
      ip: req.ip, metadata: { export_id: manifest.export_id, sample_count: samples.length, manifest_url: upload.secure_url },
    });

    return { export_id: manifest.export_id, manifest_url: upload.secure_url, sample_count: samples.length, counts_by_label: manifest.counts_by_label };
  });
}

module.exports = trainingExportRoutes;
