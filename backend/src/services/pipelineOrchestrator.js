/**
 * Pipeline orchestrator — each function below is one queue-stage handler.
 * Each stage is claimed from its own Redis Stream (see queue/worker.js) and,
 * on success, publishes a job for the next stage instead of calling it inline.
 * This is what makes the chain resumable: if a worker dies mid-stage, the
 * stage's job is still sitting in the stream (or in the consumer group's
 * pending list) for another worker to claim — nothing is held only in
 * process memory.
 */
const axios = require('axios');
const prisma = require('../db/client');
const config = require('../config');
const { broadcast, broadcastAll } = require('./wsGateway');
const { publishJob } = require('../queue/queue');

function emitStage(sessionId, stage, status, message = '') {
  broadcast(sessionId, { type: 'stage_update', sessionId, stage, status, message });
}

const OCR_CONCURRENCY = 4;  // parallel OCR requests (GPU can handle several at once)
const PROGRESS_EVERY = 10;  // update DB progress every N frames

async function failStage(sessionId, stage, err, log, { affectsSession = true } = {}) {
  log.error({ msg: `${stage} stage failed`, session_id: sessionId, error: err.message });
  await prisma.pipelineStage.updateMany({
    where: { session_id: sessionId, stage },
    data: { status: 'failed', error_message: err.message },
  });
  if (affectsSession) {
    await prisma.inspectionSession.update({
      where: { id: sessionId },
      data: { status: 'failed' },
    });
  }
  broadcastAll({ type: 'session_failed', sessionId, stage, error: err.message });
}

// ── Stage 1: OCR detection ───────────────────────────────────────────────
async function runOcrDetectionStage(sessionId, fastify) {
  const log = fastify ? fastify.log : console;
  log.info({ msg: 'OCR stage starting', session_id: sessionId });

  try {
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'ocr_detection' },
      data: { status: 'running', started_at: new Date(), detail_message: 'Queuing frames for OCR...' },
    });
    emitStage(sessionId, 'ocr_detection', 'running', 'Queuing frames for OCR...');

    const ocrCameras = await prisma.sessionCamera.findMany({
      where: { session_id: sessionId, camera_type: 'ocr' },
      select: { id: true },
    });

    const ocrCameraIds = ocrCameras.map((c) => c.id);
    const frameFilter = ocrCameraIds.length > 0
      ? { session_id: sessionId, session_camera_id: { in: ocrCameraIds } }
      : { session_id: sessionId };

    const frames = await prisma.frame.findMany({
      where: frameFilter,
      orderBy: { trigger_id: 'asc' },
      select: { id: true, trigger_id: true, cloudinary_url: true },
    });

    if (frames.length === 0) {
      throw new Error('No frames found for OCR — frame extraction may have failed');
    }

    const total = frames.length;
    log.info({ msg: `OCR: processing ${total} frames from ${ocrCameraIds.length || 'all'} OCR camera(s)`, session_id: sessionId });

    await prisma.frame.updateMany({ where: frameFilter, data: { is_ocr_candidate: true } });

    let processed = 0;
    let ocrValid = 0;

    for (let i = 0; i < frames.length; i += OCR_CONCURRENCY) {
      const batch = frames.slice(i, i + OCR_CONCURRENCY);

      const results = await Promise.allSettled(
        batch.map((frame) =>
          axios.post(
            `${config.services.ocr}/ocr`,
            { frame_url: frame.cloudinary_url, frame_id: frame.id, trigger_id: Number(frame.trigger_id), session_id: sessionId },
            { timeout: 30_000 },
          ),
        ),
      );

      for (const res of results) {
        if (res.status === 'fulfilled' && res.value.data?.is_valid) ocrValid++;
        else if (res.status === 'rejected') log.warn({ msg: 'OCR request failed', error: res.reason?.message });
      }

      processed += batch.length;

      if (processed % PROGRESS_EVERY === 0 || processed === total) {
        const pct = Math.round((processed / total) * 100);
        await prisma.pipelineStage.updateMany({
          where: { session_id: sessionId, stage: 'ocr_detection' },
          data: {
            detail_message: `OCR: ${processed}/${total} frames (${ocrValid} valid detections)`,
            stats: { processed, total, valid: ocrValid, progress_pct: pct },
          },
        });
        broadcast(sessionId, { type: 'progress_update', sessionId, stage: 'ocr_detection', processed, total, pct });
      }
    }

    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'ocr_detection' },
      data: {
        status: 'completed',
        completed_at: new Date(),
        detail_message: `OCR complete: ${ocrValid} valid detections from ${total} frames`,
        stats: { total_frames: total, valid_detections: ocrValid },
      },
    });
    emitStage(sessionId, 'ocr_detection', 'completed', `OCR complete: ${ocrValid} valid detections from ${total} frames`);
    log.info({ msg: `OCR done: ${ocrValid}/${total} valid`, session_id: sessionId });

    // Hand off to the next stage via the queue — not an inline call.
    await publishJob('synchronization', { session_id: sessionId });
  } catch (err) {
    await failStage(sessionId, 'ocr_detection', err, log);
  }
}

// ── Stage 2: Synchronization (gap detection → coach mapping) ────────────
async function runSynchronizationStage(sessionId, fastify) {
  const log = fastify ? fastify.log : console;

  try {
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'synchronization' },
      data: { status: 'running', started_at: new Date(), detail_message: 'Running gap detection...' },
    });
    emitStage(sessionId, 'synchronization', 'running', 'Running gap detection...');

    const syncResp = await axios.post(
      `${config.services.syncEngine}/sync`,
      { session_id: sessionId },
      { timeout: 120_000 },
    );
    const syncResult = syncResp.data;
    log.info({ msg: 'Sync engine done', session_id: sessionId, coaches_created: syncResult.coaches_created });

    await prisma.inspectionSession.update({
      where: { id: sessionId },
      data: { status: 'analysing', total_coaches: syncResult.coaches_created },
    });

    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'synchronization' },
      data: { status: 'completed', completed_at: new Date(), detail_message: `${syncResult.coaches_created} coaches mapped` },
    });
    emitStage(sessionId, 'synchronization', 'completed', `${syncResult.coaches_created} coaches mapped`);
    broadcast(sessionId, { type: 'coaches_mapped', sessionId, count: syncResult.coaches_created });

    await publishJob('correlation', { session_id: sessionId });
  } catch (err) {
    await failStage(sessionId, 'synchronization', err, log);
  }
}

// ── Stage 3: Correlation (component + defect detection per coach) ───────
async function runCorrelationStage(sessionId, fastify) {
  const log = fastify ? fastify.log : console;

  try {
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'component_detection' },
      data: { status: 'running', started_at: new Date(), detail_message: 'Detecting components and defects...' },
    });
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'defect_analysis' },
      data: { status: 'running', started_at: new Date(), detail_message: 'Analysing defect severity...' },
    });
    emitStage(sessionId, 'component_detection', 'running', 'Detecting components and defects...');
    emitStage(sessionId, 'defect_analysis', 'running', 'Analysing defect severity...');

    const coaches = await prisma.coach.findMany({
      where: { session_id: sessionId },
      select: { id: true },
      orderBy: { coach_index: 'asc' },
    });

    let totalDefects = 0, totalCritical = 0, totalMissing = 0, healthSum = 0;

    for (const coach of coaches) {
      try {
        const corrResp = await axios.post(
          `${config.services.correlation}/correlate`,
          { session_id: sessionId, coach_id: coach.id },
          { timeout: 300_000 },
        );
        const cr = corrResp.data;
        totalDefects += cr.defects_found || 0;
        totalCritical += cr.sev_counts?.CRITICAL || 0;
        totalMissing += cr.missing_components || 0;
        healthSum += cr.health_score || 0;

        if (cr.defects_found > 0) {
          broadcast(sessionId, {
            type: 'defects_found', sessionId, coachId: coach.id,
            count: cr.defects_found, critical: cr.sev_counts?.CRITICAL || 0,
          });
        }
      } catch (corrErr) {
        log.warn({ msg: 'Correlation failed for coach, continuing', coach_id: coach.id, error: corrErr.message });
      }
    }

    const avgHealth = coaches.length > 0 ? Math.round(healthSum / coaches.length) : 0;

    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'component_detection' },
      data: {
        status: 'completed', completed_at: new Date(),
        detail_message: `Component detection complete across ${coaches.length} coaches`,
        stats: { coaches_processed: coaches.length, total_defects: totalDefects },
      },
    });
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'defect_analysis' },
      data: {
        status: 'completed', completed_at: new Date(),
        detail_message: `${totalDefects} defects found, ${totalCritical} critical`,
        stats: { total_defects: totalDefects, critical: totalCritical, missing: totalMissing },
      },
    });
    emitStage(sessionId, 'component_detection', 'completed', `Component scan complete across ${coaches.length} coaches`);
    emitStage(sessionId, 'defect_analysis', 'completed', `${totalDefects} defects found, ${totalCritical} critical`);

    await prisma.inspectionSession.update({
      where: { id: sessionId },
      data: {
        status: 'completed', completed_at: new Date(),
        critical_defects: totalCritical, missing_components_count: totalMissing,
        health_score: avgHealth, progress_pct: 100,
      },
    });
    broadcastAll({
      type: 'session_completed', sessionId,
      criticalDefects: totalCritical, healthScore: avgHealth, coaches: coaches.length,
    });

    log.info({
      msg: 'Pipeline complete', session_id: sessionId, coaches: coaches.length,
      defects: totalDefects, critical: totalCritical, health_score: avgHealth,
    });
  } catch (err) {
    await failStage(sessionId, 'component_detection', err, log);
  }
}

// ── Stage 4: Report generation ───────────────────────────────────────────
// Triggered by the operator (POST /api/sessions/:id/report), not auto-chained
// after correlation — sign-off is a deliberate human step, not pipeline-automatic.
async function runReportGenerationStage(sessionId, fastify) {
  const log = fastify ? fastify.log : console;

  try {
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'report_generation' },
      data: { status: 'running', started_at: new Date(), detail_message: 'Generating report...' },
    });

    const resp = await axios.post(
      `${config.services.reportGenerator}/generate`,
      { session_id: sessionId },
      { timeout: 120_000 },
    );

    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'report_generation' },
      data: { status: 'completed', completed_at: new Date(), detail_message: 'Report generated' },
    });
    log.info({ msg: 'Report generated', session_id: sessionId, pdf_url: resp.data.pdf_url });
  } catch (err) {
    // Report generation failing after a session already completed shouldn't
    // flip the session itself back to 'failed' — only the report stage.
    await failStage(sessionId, 'report_generation', err, log, { affectsSession: false });
  }
}

module.exports = {
  runOcrDetectionStage,
  runSynchronizationStage,
  runCorrelationStage,
  runReportGenerationStage,
};
