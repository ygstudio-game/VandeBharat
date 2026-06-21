/**
 * Dataset export — turns DefectReviewLog feedback (FP/FN/confirmed) into a
 * versioned training manifest. This is what makes the review log something
 * other than a write-only audit trail: every reviewer correction becomes a
 * traceable input to the next model retrain (Phase 9).
 */
const axios = require('axios');
const archiver = require('archiver');
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

  // GET /api/training/export-yolo-dataset — confirmed defects only, streamed as a
  // YOLO-format zip (images/ + labels/ + classes.txt). Module 12's reviewer queue
  // is what populates this — a defect only gets here after a human clicks Confirm.
  fastify.get('/export-yolo-dataset', async (req, reply) => {
    const defects = await prisma.defect.findMany({
      where: { review_status: 'confirmed' },
      include: { frame: { select: { cloudinary_url: true, width_px: true, height_px: true } } },
    });

    const usable = defects.filter((d) => d.bbox_x != null && d.frame?.width_px && d.frame?.height_px);
    if (usable.length === 0) {
      reply.status(404);
      return { error: 'No confirmed defects with bbox + known frame dimensions to export yet' };
    }

    const classNames = [...new Set(usable.map((d) => d.defect_type))].sort();
    const classIndex = new Map(classNames.map((name, i) => [name, i]));

    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', 'attachment; filename="yolo_dataset.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    reply.send(archive);

    archive.append(classNames.join('\n'), { name: 'classes.txt' });

    let included = 0;
    for (const d of usable) {
      try {
        const resp = await axios.get(d.frame.cloudinary_url, { responseType: 'arraybuffer', timeout: 15000 });
        archive.append(Buffer.from(resp.data), { name: `images/${d.id}.jpg` });

        // Pixel bbox -> YOLO normalized cx,cy,w,h (0-1), origin top-left, per frame dims.
        const fw = d.frame.width_px, fh = d.frame.height_px;
        const cx = (d.bbox_x + d.bbox_w / 2) / fw;
        const cy = (d.bbox_y + d.bbox_h / 2) / fh;
        const w = d.bbox_w / fw;
        const h = d.bbox_h / fh;
        archive.append(`${classIndex.get(d.defect_type)} ${cx.toFixed(6)} ${cy.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}\n`, {
          name: `labels/${d.id}.txt`,
        });
        included++;
      } catch (err) {
        req.log.warn({ msg: 'Skipping defect in YOLO export — frame download failed', defect_id: d.id, error: err.message });
      }
    }

    await archive.finalize();

    await logAction({
      userId: req.user.id, action: 'YOLO_DATASET_EXPORTED', resourceType: 'TrainingExport',
      ip: req.ip, metadata: { sample_count: included, class_count: classNames.length },
    });
  });
}

module.exports = trainingExportRoutes;
