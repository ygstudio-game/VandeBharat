/**
 * Pipeline orchestrator — runs after frame extraction completes.
 * Steps: OCR (frame-by-frame) → Sync Engine → mark analysing
 */
const axios = require('axios');
const prisma = require('../db/client');
const config = require('../config');

const OCR_CONCURRENCY = 4;  // parallel OCR requests (GPU can handle several at once)
const PROGRESS_EVERY = 10;  // update DB progress every N frames

async function runOcrPipeline(sessionId, fastify) {
  const log = fastify ? fastify.log : console;
  log.info({ msg: 'OCR pipeline starting', session_id: sessionId });

  try {
    // ── 1. Mark ocr_detection stage running ──────────────────────────────────
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'ocr_detection' },
      data: {
        status: 'running',
        started_at: new Date(),
        detail_message: 'Queuing frames for OCR...',
      },
    });

    // ── 2. Load all frames, ordered by trigger_id ─────────────────────────────
    const frames = await prisma.frame.findMany({
      where: { session_id: sessionId },
      orderBy: { trigger_id: 'asc' },
      select: { id: true, trigger_id: true, cloudinary_url: true },
    });

    if (frames.length === 0) {
      throw new Error('No frames found for session — frame extraction may have failed');
    }

    const total = frames.length;
    log.info({ msg: `OCR: processing ${total} frames`, session_id: sessionId });

    // Mark all frames as OCR candidates
    await prisma.frame.updateMany({
      where: { session_id: sessionId },
      data: { is_ocr_candidate: true },
    });

    // ── 3. Run OCR in sliding-window concurrency ──────────────────────────────
    let processed = 0;
    let ocrValid = 0;

    for (let i = 0; i < frames.length; i += OCR_CONCURRENCY) {
      const batch = frames.slice(i, i + OCR_CONCURRENCY);

      const results = await Promise.allSettled(
        batch.map((frame) =>
          axios.post(
            `${config.services.ocr}/ocr`,
            {
              frame_url: frame.cloudinary_url,
              frame_id: frame.id,
              trigger_id: Number(frame.trigger_id),
              session_id: sessionId,
            },
            { timeout: 30_000 },
          ),
        ),
      );

      for (const res of results) {
        if (res.status === 'fulfilled' && res.value.data?.is_valid) {
          ocrValid++;
        } else if (res.status === 'rejected') {
          log.warn({ msg: 'OCR request failed', error: res.reason?.message });
        }
      }

      processed += batch.length;

      // Periodic progress update
      if (processed % PROGRESS_EVERY === 0 || processed === total) {
        const pct = Math.round((processed / total) * 100);
        await prisma.pipelineStage.updateMany({
          where: { session_id: sessionId, stage: 'ocr_detection' },
          data: {
            detail_message: `OCR: ${processed}/${total} frames (${ocrValid} valid detections)`,
            stats: { processed, total, valid: ocrValid, progress_pct: pct },
          },
        });
      }
    }

    // ── 4. Mark ocr_detection completed ──────────────────────────────────────
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'ocr_detection' },
      data: {
        status: 'completed',
        completed_at: new Date(),
        detail_message: `OCR complete: ${ocrValid} valid detections from ${total} frames`,
        stats: { total_frames: total, valid_detections: ocrValid },
      },
    });

    log.info({ msg: `OCR done: ${ocrValid}/${total} valid`, session_id: sessionId });

    // ── 5. Call sync engine ───────────────────────────────────────────────────
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'synchronization' },
      data: { status: 'running', started_at: new Date(), detail_message: 'Running gap detection...' },
    });

    const syncResp = await axios.post(
      `${config.services.syncEngine}/sync`,
      { session_id: sessionId },
      { timeout: 120_000 },
    );

    const syncResult = syncResp.data;
    log.info({
      msg: 'Sync engine done',
      session_id: sessionId,
      coaches_created: syncResult.coaches_created,
    });

    // ── 6. Update session status + kick off Phase 3 ──────────────────────────
    await prisma.inspectionSession.update({
      where: { id: sessionId },
      data: { status: 'analysing', total_coaches: syncResult.coaches_created },
    });

    // ── 7. Phase 3: defect correlation per coach ──────────────────────────────
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'component_detection' },
      data: { status: 'running', started_at: new Date(), detail_message: 'Detecting components and defects...' },
    });
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'defect_analysis' },
      data: { status: 'running', started_at: new Date(), detail_message: 'Analysing defect severity...' },
    });

    const coaches = await prisma.coach.findMany({
      where: { session_id: sessionId },
      select: { id: true },
      orderBy: { coach_index: 'asc' },
    });

    let totalDefects = 0;
    let totalCritical = 0;
    let totalMissing = 0;
    let healthSum = 0;

    for (const coach of coaches) {
      try {
        const corrResp = await axios.post(
          `${config.services.correlation}/correlate`,
          { session_id: sessionId, coach_id: coach.id },
          { timeout: 300_000 },  // 5 min per coach
        );
        const cr = corrResp.data;
        totalDefects += cr.defects_found || 0;
        totalCritical += cr.sev_counts?.CRITICAL || 0;
        totalMissing += cr.missing_components || 0;
        healthSum += cr.health_score || 0;
      } catch (corrErr) {
        log.warn({
          msg: 'Correlation failed for coach, continuing',
          coach_id: coach.id,
          error: corrErr.message,
        });
      }
    }

    const avgHealth = coaches.length > 0 ? Math.round(healthSum / coaches.length) : 0;

    // ── 8. Mark component_detection + defect_analysis stages complete ─────────
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'component_detection' },
      data: {
        status: 'completed',
        completed_at: new Date(),
        detail_message: `Component detection complete across ${coaches.length} coaches`,
        stats: { coaches_processed: coaches.length, total_defects: totalDefects },
      },
    });
    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, stage: 'defect_analysis' },
      data: {
        status: 'completed',
        completed_at: new Date(),
        detail_message: `${totalDefects} defects found, ${totalCritical} critical`,
        stats: { total_defects: totalDefects, critical: totalCritical, missing: totalMissing },
      },
    });

    // ── 9. Update session aggregates ──────────────────────────────────────────
    await prisma.inspectionSession.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        completed_at: new Date(),
        critical_defects: totalCritical,
        missing_components_count: totalMissing,
        health_score: avgHealth,
        progress_pct: 100,
      },
    });

    log.info({
      msg: 'Pipeline complete',
      session_id: sessionId,
      coaches: coaches.length,
      defects: totalDefects,
      critical: totalCritical,
      health_score: avgHealth,
    });

  } catch (err) {
    log.error({ msg: 'OCR pipeline failed', session_id: sessionId, error: err.message });

    await prisma.pipelineStage.updateMany({
      where: { session_id: sessionId, status: 'running' },
      data: { status: 'failed', error_message: err.message },
    });

    await prisma.inspectionSession.update({
      where: { id: sessionId },
      data: { status: 'failed' },
    });
  }
}

// Legacy stub — kept for future phases
async function runPipeline(sessionId) {
  console.log(`Pipeline triggered for session ${sessionId}`);
}

module.exports = { runOcrPipeline, runPipeline };
