/**
 * Report routes — Phase 4
 * POST /api/sessions/:id/report  → trigger report generation
 * GET  /api/sessions/:id/report  → return report metadata + download URLs
 */
const axios = require('axios');
const prisma = require('../db/client');
const config = require('../config');
const { publishJob } = require('../queue/queue');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../services/auditLog');
const { ROLES } = require('../constants/roles');

async function reports(fastify) {
  // POST /api/sessions/:id/report
  fastify.post('/:id/report', async (req, reply) => {
    const session = await prisma.inspectionSession.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });

    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    if (!['analysing', 'completed'].includes(session.status)) {
      reply.status(409);
      return {
        error: `Session status is '${session.status}' — pipeline must reach 'analysing' or 'completed' before generating a report`,
      };
    }

    // Publish to the queue instead of calling the report generator inline —
    // the worker process (npm run worker) claims and runs it, durably.
    try {
      await publishJob('report_generation', { session_id: req.params.id });
    } catch (err) {
      fastify.log.error({ msg: 'Failed to publish report job to queue', session_id: req.params.id, error: err.message });
      reply.status(503);
      return { error: 'Pipeline queue unavailable — is Redis running?' };
    }

    reply.status(202);
    return {
      session_id: req.params.id,
      message: 'Report generation job queued. Poll GET /api/sessions/:id/report for the download URL.',
    };
  });

  // GET /api/sessions/:id/report
  fastify.get('/:id/report', async (req, reply) => {
    const report = await prisma.report.findUnique({
      where: { session_id: req.params.id },
    });

    if (!report) {
      // Check if session exists at all
      const session = await prisma.inspectionSession.findUnique({
        where: { id: req.params.id },
        select: { id: true, status: true },
      });
      if (!session) {
        reply.status(404);
        return { error: 'Session not found' };
      }
      // Session exists but no report yet
      const stage = await prisma.pipelineStage.findFirst({
        where: { session_id: req.params.id, stage: 'report_generation' },
        select: { status: true, detail_message: true },
      });
      reply.status(202);
      return {
        session_id: req.params.id,
        report_ready: false,
        pipeline_status: stage?.status ?? 'pending',
        message: stage?.detail_message ?? 'Report not yet generated. POST to trigger.',
      };
    }

    return {
      report_ready: report.status === 'completed',
      id: report.id,
      session_id: report.session_id,
      train_number: report.train_number,
      status: report.status,
      generated_at: report.generated_at,
      overall_health: report.overall_health ? Number(report.overall_health) : null,
      total_coaches: report.total_coaches,
      total_frames: report.total_frames,
      total_defects: report.total_defects,
      critical_defects: report.critical_defects,
      missing_components_count: report.missing_components_count,
      pdf_url: report.pdf_url,
      json_url: report.json_url,
      is_signed: report.is_signed,
    };
  });

  // PUT /api/sessions/:id/report/sign — sign-off is a certification act,
  // restricted to roles with sign-off authority (not field staff / ZR view-only).
  fastify.put('/:id/report/sign', {
    preHandler: [authenticate, requireRole(ROLES.ADMIN, ROLES.RDSO_INSPECTOR)],
  }, async (req, reply) => {
    const sessionId = req.params.id;
    const session = await prisma.inspectionSession.findUnique({
      where: { id: sessionId },
      include: { report: true }
    });

    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    if (!session.report) {
      await prisma.report.create({
        data: {
          session_id: sessionId,
          train_number: session.train_number,
          total_coaches: session.total_coaches || 0,
          total_frames: session.total_frames || 0,
          total_defects: session.critical_defects || 0,
          critical_defects: session.critical_defects || 0,
          missing_components_count: session.missing_components_count || 0,
          overall_health: session.health_score || 100,
          status: 'completed',
          is_signed: true,
          signed_off_at: new Date(),
          sign_off_notes: req.body?.notes || 'Signed off by inspector via Reports dashboard',
        }
      });
    } else {
      await prisma.report.update({
        where: { session_id: sessionId },
        data: {
          is_signed: true,
          status: 'completed',
          signed_off_at: new Date(),
          sign_off_notes: req.body?.notes || 'Signed off by inspector via Reports dashboard',
        }
      });
    }

    await logAction({
      userId: req.user.id, sessionId, action: 'REPORT_SIGNED_OFF',
      resourceType: 'Report', resourceId: sessionId, ip: req.ip,
      metadata: { notes: req.body?.notes || null },
    });

    return { success: true, message: `Report signed off successfully` };
  });

  // GET /api/sessions/:id/evidence — build evidence bundle, return zip download URL
  fastify.get('/:id/evidence', async (req, reply) => {
    const session = await prisma.inspectionSession.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }
    if (!['analysing', 'completed'].includes(session.status)) {
      reply.status(409);
      return { error: `Session status is '${session.status}' — pipeline must reach 'analysing' or 'completed' before exporting an evidence bundle` };
    }

    try {
      const resp = await axios.post(
        `${config.services.reportGenerator}/evidence`,
        { session_id: req.params.id },
        { timeout: 300_000 },  // bundling downloads annotated frames — allow time
      );
      fastify.log.info({ msg: 'Evidence bundle built', session_id: req.params.id, frames: resp.data.frames_included });
      return resp.data;  // { zip_url, frames_included, frames_failed, size_bytes }
    } catch (err) {
      fastify.log.error({ msg: 'Evidence bundle failed', session_id: req.params.id, error: err.message });
      reply.status(500);
      return { error: 'Evidence bundle generation failed: ' + err.message };
    }
  });

  // GET /api/sessions/:id/evidence/zip — serve local evidence bundle
  fastify.get('/:id/evidence/zip', async (req, reply) => {
    const fs = require('fs');
    const path = require('path');
    const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
    const zipPath = path.join(UPLOAD_DIR, 'reports', `evidence_${req.params.id}.zip`);

    if (!fs.existsSync(zipPath)) {
      reply.status(404);
      return { error: 'Evidence bundle not found. Please trigger generation first.' };
    }

    reply.type('application/zip');
    reply.header('Content-Disposition', `attachment; filename="evidence_${req.params.id}.zip"`);
    return fs.createReadStream(zipPath);
  });

  // GET /api/sessions/:id/report/pdf — serve local generated PDF report
  fastify.get('/:id/report/pdf', async (req, reply) => {
    const fs = require('fs');
    const path = require('path');
    const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
    const pdfPath = path.join(UPLOAD_DIR, 'reports', `report_${req.params.id}.pdf`);

    if (!fs.existsSync(pdfPath)) {
      reply.status(404);
      return { error: 'PDF Report not found. Please trigger generation first.' };
    }

    reply.type('application/pdf');
    reply.header('Content-Disposition', `inline; filename="report_${req.params.id}.pdf"`);
    return fs.createReadStream(pdfPath);
  });

  // GET /api/sessions/:id/report/json — serve local generated JSON report metadata
  fastify.get('/:id/report/json', async (req, reply) => {
    const fs = require('fs');
    const path = require('path');
    const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
    const jsonPath = path.join(UPLOAD_DIR, 'reports', `report_${req.params.id}.json`);

    if (!fs.existsSync(jsonPath)) {
      reply.status(404);
      return { error: 'JSON Report not found. Please trigger generation first.' };
    }

    reply.type('application/json');
    return fs.createReadStream(jsonPath);
  });
}

module.exports = reports;
