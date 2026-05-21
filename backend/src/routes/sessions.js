const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream/promises');
const { randomUUID } = require('crypto');
const axios = require('axios');
const prisma = require('../db/client');
const config = require('../config');
const rootConfig = require(path.join(__dirname, '..', '..', '..', 'config.json'));
const { runOcrPipeline } = require('../services/pipelineOrchestrator');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const PIPELINE_STAGES = [
  'frame_extraction',
  'ocr_detection',
  'synchronization',
  'component_detection',
  'defect_analysis',
  'report_generation',
];

// Maps upload index to camera_type
const CAM_TYPES = ['component_left', 'component_right', 'bottom', 'suspension', 'wheel', 'overview'];

function generateSessionCode() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INS-${year}-${rand}`;
}

async function sessions(fastify) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // POST /api/sessions/upload
  fastify.post('/upload', async (request, reply) => {
    const sessionId = randomUUID();
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const fields = {};
    const videoFiles = [];

    // Iterate all multipart parts — collect fields and save files to disk
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        fields[part.fieldname] = part.value;
      } else if (part.type === 'file') {
        const ext = path.extname(part.filename) || '.mp4';
        const savePath = path.join(sessionDir, `cam_${videoFiles.length + 1}${ext}`);
        await pipeline(part.file, fs.createWriteStream(savePath));
        videoFiles.push({ savePath, originalName: part.filename });
      }
    }

    const trainNumber = fields.train_number?.trim();
    if (!trainNumber) {
      reply.status(400);
      return { error: 'train_number field is required' };
    }
    if (videoFiles.length === 0) {
      reply.status(400);
      return { error: 'At least one video file is required' };
    }

    // Look up default camera setup (must exist — created by seed)
    const setup = await prisma.cameraSetup.findFirst({ where: { station_code: 'TEST01' } });
    if (!setup) {
      reply.status(500);
      return { error: 'Default camera setup not found. Run: node prisma/seed.js' };
    }

    // Create session
    const session = await prisma.inspectionSession.create({
      data: {
        id: sessionId,
        session_code: generateSessionCode(),
        train_number: trainNumber,
        station_code: 'TEST01',
        camera_setup_id: setup.id,
        status: 'extracting',
        cameras_active: videoFiles.length,
      },
    });

    // Create one camera + session_camera per uploaded video
    const sessionCameras = [];
    for (let i = 0; i < videoFiles.length; i++) {
      const camType = CAM_TYPES[i] ?? `camera_${i + 1}`;
      const camera = await prisma.camera.create({
        data: {
          camera_setup_id: setup.id,
          camera_code: `UPLOAD_${camType.toUpperCase()}_${sessionId.slice(0, 8)}`,
          camera_type: camType,
          position_label: `Upload Camera ${i + 1}`,
        },
      });

      const sc = await prisma.sessionCamera.create({
        data: {
          session_id: sessionId,
          camera_id: camera.id,
          camera_type: camType,
          name: `Camera ${i + 1} — ${path.basename(videoFiles[i].originalName)}`,
        },
      });

      sessionCameras.push({ ...sc, savePath: videoFiles[i].savePath });
    }

    // Create all pipeline stages
    await prisma.pipelineStage.createMany({
      data: PIPELINE_STAGES.map((stage) => ({
        session_id: sessionId,
        stage,
        status: stage === 'frame_extraction' ? 'running' : 'pending',
        started_at: stage === 'frame_extraction' ? new Date() : null,
        detail_message: stage === 'frame_extraction' ? 'Starting frame extraction...' : null,
      })),
    });

    // frames_per_second: prefer form field, fall back to config.json default
    const framesFps = parseFloat(fields.frames_per_second) || rootConfig.pipeline.frames_per_second || 1;

    // Fire-and-forget: call frame extractor for each camera (parallel)
    for (const sc of sessionCameras) {
      axios
        .post(`${config.services.frameExtractor}/extract`, {
          session_id: sessionId,
          session_camera_id: sc.id,
          video_path: sc.savePath,
          frames_per_second: framesFps,
        })
        .catch((err) =>
          fastify.log.error({ msg: 'Frame extractor dispatch failed', session_id: sessionId, error: err.message })
        );
    }

    reply.status(202);
    return {
      session_id: sessionId,
      session_code: session.session_code,
      status: 'extracting',
      cameras: sessionCameras.length,
      message: `Extracting frames from ${sessionCameras.length} video(s). Poll GET /api/sessions/${sessionId} for status.`,
    };
  });

  // GET /api/sessions
  fastify.get('/', async () => {
    const rows = await prisma.inspectionSession.findMany({
      orderBy: { started_at: 'desc' },
      include: {
        pipeline_stages: { select: { stage: true, status: true } },
        _count: { select: { coaches: true, defects: true, frames: true } },
      },
    });

    return {
      sessions: rows.map((s) => ({
        id: s.id,
        session_code: s.session_code,
        train_number: s.train_number,
        status: s.status,
        progress_pct: s.progress_pct,
        health_score: s.health_score ? Number(s.health_score) : null,
        total_coaches: s.total_coaches,
        total_frames: s.total_frames,
        critical_defects: s.critical_defects,
        missing_components_count: s.missing_components_count,
        coaches_count: s._count.coaches,
        defects_count: s._count.defects,
        frames_count: s._count.frames,
        started_at: s.started_at,
        completed_at: s.completed_at,
        pipeline_stages: s.pipeline_stages,
      })),
      total: rows.length,
    };
  });

  // GET /api/sessions/:id
  fastify.get('/:id', async (req, reply) => {
    const session = await prisma.inspectionSession.findUnique({
      where: { id: req.params.id },
      include: {
        pipeline_stages: { orderBy: { stage: 'asc' } },
        session_cameras: { include: { camera: true } },
        _count: { select: { coaches: true, defects: true, frames: true } },
      },
    });

    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    return {
      ...session,
      health_score: session.health_score ? Number(session.health_score) : null,
      ocr_confidence: session.ocr_confidence ? Number(session.ocr_confidence) : null,
      sync_confidence: session.sync_confidence ? Number(session.sync_confidence) : null,
      coaches_count: session._count.coaches,
      defects_count: session._count.defects,
      frames_count: session._count.frames,
    };
  });

  // GET /api/sessions/:id/hierarchy  (Phase 2)
  fastify.get('/:id/hierarchy', async (req, reply) => {
    const session = await prisma.inspectionSession.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, total_coaches: true },
    });
    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    const coaches = await prisma.coach.findMany({
      where: { session_id: req.params.id },
      orderBy: { coach_index: 'asc' },
      include: {
        _count: { select: { frames: true, defects: true } },
      },
    });

    return {
      session_id: req.params.id,
      status: session.status,
      total_coaches: session.total_coaches,
      coaches: coaches.map((c) => ({
        id: c.id,
        coach_number: c.coach_number,
        coach_index: c.coach_index,
        ocr_confidence: c.ocr_confidence ? Number(c.ocr_confidence) : null,
        health_score: c.health_score ? Number(c.health_score) : null,
        total_frames: c.total_frames,
        frames_count: c._count.frames,
        defects_count: c._count.defects,
        start_trigger_id: c.start_trigger_id ? Number(c.start_trigger_id) : null,
        end_trigger_id: c.end_trigger_id ? Number(c.end_trigger_id) : null,
      })),
    };
  });

  // GET /api/sessions/:id/frames?limit=100&offset=0
  fastify.get('/:id/frames', async (req, reply) => {
    const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0,   0);

    const [frames, total] = await Promise.all([
      prisma.frame.findMany({
        where:   { session_id: req.params.id },
        orderBy: { sequence_number: 'asc' },
        take:    limit,
        skip:    offset,
        select: {
          id: true, sequence_number: true,
          trigger_id: true, captured_at_ms: true,
          thumbnail_url: true, cloudinary_url: true,
          is_ocr_candidate: true, is_defect_flagged: true,
          ocr_results: {
            select: {
              coach_number: true, confidence: true, is_valid: true,
              bbox_x: true, bbox_y: true, bbox_w: true, bbox_h: true,
            },
            orderBy: { confidence: 'desc' },
          },
          defects: {
            select: {
              id: true, defect_type: true, severity: true,
              bbox_x: true, bbox_y: true, bbox_w: true, bbox_h: true,
            },
          },
        },
      }),
      prisma.frame.count({ where: { session_id: req.params.id } }),
    ]);

    return {
      frames: frames.map((f) => ({
        ...f,
        trigger_id:     Number(f.trigger_id),
        captured_at_ms: Number(f.captured_at_ms),
      })),
      total,
    };
  });

  // POST /api/sessions/:id/process  (Phase 2)
  // Triggers OCR → sync pipeline in background. Call this after frame extraction completes.
  fastify.post('/:id/process', async (req, reply) => {
    const session = await prisma.inspectionSession.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });

    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    const BLOCKED = ['analysing', 'completed'];
    if (BLOCKED.includes(session.status)) {
      reply.status(409);
      return { error: `Session is already in status '${session.status}' — cannot re-run pipeline` };
    }

    // Transition session into ocr_running
    await prisma.inspectionSession.update({
      where: { id: req.params.id },
      data: { status: 'ocr_running' },
    });

    // Fire-and-forget
    runOcrPipeline(req.params.id, fastify).catch((err) =>
      fastify.log.error({ msg: 'Unhandled pipeline error', session_id: req.params.id, error: err.message })
    );

    reply.status(202);
    return {
      session_id: req.params.id,
      status: 'ocr_running',
      message: 'OCR pipeline started. Poll GET /api/sessions/:id for progress.',
    };
  });
}

module.exports = sessions;
