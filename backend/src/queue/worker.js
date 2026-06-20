/**
 * Standalone pipeline worker process — consumes every pipeline-stage stream
 * and runs the matching stage handler. Each stage publishes the next stage's
 * job itself (see pipelineOrchestrator.js) — this file only wires handlers
 * to streams and persists queue-level claim bookkeeping.
 *
 * Run with: npm run worker
 * Can run multiple instances; each stream's consumer group fans work out
 * across whichever instances are alive.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const os = require('os');
const { randomUUID } = require('crypto');
const prisma = require('../db/client');
const { consumeStream } = require('./queue');
const {
  runOcrDetectionStage,
  runSynchronizationStage,
  runCorrelationStage,
  runReportGenerationStage,
} = require('../services/pipelineOrchestrator');

const WORKER_ID = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

// Maps stream name -> { dbStages, run } — dbStages are the PipelineStage rows to
// stamp with claimed_at/worker_id/attempts before handing off to the runner.
// 'correlation' lists two: runCorrelationStage drives both component_detection
// AND defect_analysis in one job, so both rows need the claim bookkeeping —
// stamping only one left defect_analysis.claimed_at permanently null (Day 6 finding).
const STAGES = {
  ocr_detection:     { dbStages: ['ocr_detection'],     run: runOcrDetectionStage },
  synchronization:   { dbStages: ['synchronization'],   run: runSynchronizationStage },
  correlation:       { dbStages: ['component_detection', 'defect_analysis'], run: runCorrelationStage },
  report_generation: { dbStages: ['report_generation'], run: runReportGenerationStage },
};

function makeHandler(streamName, { dbStages, run }) {
  return async function handle(payload, { attempts }) {
    const { session_id } = payload;
    if (!session_id) throw new Error('Job payload missing session_id');

    console.log({ msg: 'Worker claimed job', worker_id: WORKER_ID, stream: streamName, session_id, attempts });

    await prisma.pipelineStage.updateMany({
      where: { session_id, stage: { in: dbStages } },
      data: { claimed_at: new Date(), worker_id: WORKER_ID, attempts },
    });

    await run(session_id);
    // Each stage handler manages its own success/failure DB state and never
    // rethrows on business-level failure — it only throws on a hard infra
    // fault (e.g. DB unreachable before the handler's own try/catch).
  };
}

console.log({ msg: 'Pipeline worker starting', worker_id: WORKER_ID, stages: Object.keys(STAGES) });

for (const [streamName, stageConfig] of Object.entries(STAGES)) {
  consumeStream(streamName, WORKER_ID, makeHandler(streamName, stageConfig), { maxAttempts: 3 });
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
