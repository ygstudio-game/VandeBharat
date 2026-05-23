/**
 * Report routes — Phase 4
 * POST /api/sessions/:id/report  → trigger report generation
 * GET  /api/sessions/:id/report  → return report metadata + download URLs
 */
const axios = require('axios');
const prisma = require('../db/client');
const config = require('../config');

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

    // Mark report_generation stage running
    await prisma.pipelineStage.updateMany({
      where: { session_id: req.params.id, stage: 'report_generation' },
      data: { status: 'running', started_at: new Date(), detail_message: 'Generating report...' },
    });

    // Fire-and-forget to report generator service
    axios
      .post(`${config.services.reportGenerator}/generate`, { session_id: req.params.id }, { timeout: 120_000 })
      .then(async (resp) => {
        fastify.log.info({ msg: 'Report generated', session_id: req.params.id, pdf_url: resp.data.pdf_url });
      })
      .catch(async (err) => {
        fastify.log.error({ msg: 'Report generation failed', session_id: req.params.id, error: err.message });
        await prisma.pipelineStage.updateMany({
          where: { session_id: req.params.id, stage: 'report_generation' },
          data: { status: 'failed', error_message: err.message },
        });
      });

    reply.status(202);
    return {
      session_id: req.params.id,
      message: 'Report generation started. Poll GET /api/sessions/:id/report for the download URL.',
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

  // PUT /api/sessions/:id/report/sign
  fastify.put('/:id/report/sign', async (req, reply) => {
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

    return { success: true, message: `Report signed off successfully` };
  });
}

module.exports = reports;
