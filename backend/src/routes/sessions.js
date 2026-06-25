const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream/promises');
const { randomUUID } = require('crypto');
const axios = require('axios');
const prisma = require('../db/client');
const config = require('../config');
const rootConfig = require(path.join(__dirname, '..', '..', '..', 'config.json'));
const { publishJob } = require('../queue/queue');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const PIPELINE_STAGES = [
  'frame_extraction',
  'ocr_detection',
  'synchronization',
  'component_detection',
  'defect_analysis',
  'report_generation',
];

// camera_type values for component feeds (index 0 = first component video uploaded)
const COMPONENT_CAM_TYPES = ['component_left', 'component_right', 'bottom', 'suspension', 'wheel', 'overview'];

// Must match component_manifests.coach_type values (see prisma/seed.js) — this is
// what the correlation engine uses to look up the expected-component manifest,
// and what gets stamped onto every Coach row so "Defects by Coach Class"
// analytics stop showing everything as Unclassified.
const VALID_TRAIN_TYPES = ['VANDE_BHARAT', 'LHB_SLEEPER'];

function generateSessionCode() {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INS-${year}-${rand}`;
}

// Synthetic train number for sessions where OCR auto-detect found nothing —
// 5 digits, always leading with '5' (Indian Railways "passenger train" category)
// to look like a real train number without colliding with real mail/express/superfast ranges.
async function generateTrainNumber() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `5${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const exists = await prisma.inspectionSession.findFirst({ where: { train_number: candidate } });
    if (!exists) return candidate;
  }
  throw new Error('Could not generate a unique train number');
}

async function sessions(fastify) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // POST /api/sessions/upload
  fastify.post('/upload', async (request, reply) => {
    const sessionId = randomUUID();
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const fields = {};
    const ocrFiles = [];        // from field name 'ocr_video' — exactly one expected
    const componentFiles = [];  // from field name 'component_video' — one or more

    // Iterate all multipart parts — route files by fieldname
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        fields[part.fieldname] = part.value;
      } else if (part.type === 'file') {
        const ext = path.extname(part.filename) || '.mp4';
        if (part.fieldname === 'ocr_video') {
          const savePath = path.join(sessionDir, `cam_ocr${ext}`);
          await pipeline(part.file, fs.createWriteStream(savePath));
          ocrFiles.push({ savePath, originalName: part.filename, cameraType: 'ocr' });
        } else {
          // component_video (repeated field) — or legacy video_files for backwards compat
          const idx = componentFiles.length;
          const savePath = path.join(sessionDir, `cam_component_${idx + 1}${ext}`);
          await pipeline(part.file, fs.createWriteStream(savePath));
          componentFiles.push({ savePath, originalName: part.filename, cameraType: COMPONENT_CAM_TYPES[idx] ?? `component_${idx + 1}` });
        }
      }
    }

    const trainNumber = fields.train_number?.trim() || await generateTrainNumber();
    const trainType = VALID_TRAIN_TYPES.includes(fields.train_type) ? fields.train_type : 'VANDE_BHARAT';
    if (ocrFiles.length === 0) {
      reply.status(400);
      return { error: 'ocr_video is required — upload the placard/OCR camera feed' };
    }
    if (componentFiles.length === 0) {
      reply.status(400);
      return { error: 'At least one component_video is required — upload one or more assembly camera feeds' };
    }

    // Combine: OCR camera first, then component cameras
    const allFiles = [...ocrFiles, ...componentFiles];

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
        train_type: trainType,
        station_code: 'TEST01',
        camera_setup_id: setup.id,
        status: 'extracting',
        cameras_active: allFiles.length,
      },
    });

    // Link each uploaded video to one of the station's FIXED physical cameras
    // (do NOT create a new camera per upload — that bloats the registry).
    // Cameras are matched by type and assigned round-robin within that type.
    const fixedCameras = await prisma.camera.findMany({
      where: { camera_setup_id: setup.id },
      orderBy: { camera_code: 'asc' },
    });
    const ocrCameras = fixedCameras.filter((c) => c.camera_type === 'ocr');
    const componentCameras = fixedCameras.filter((c) => c.camera_type === 'component');

    const sessionCameras = [];
    let ocrIdx = 0;
    let compIdx = 0;
    for (let i = 0; i < allFiles.length; i++) {
      const { savePath, originalName, cameraType } = allFiles[i];

      // Pick a fixed camera of the matching type (round-robin); fall back to any camera.
      let camera;
      if (cameraType === 'ocr' && ocrCameras.length) {
        camera = ocrCameras[ocrIdx++ % ocrCameras.length];
      } else if (componentCameras.length) {
        camera = componentCameras[compIdx++ % componentCameras.length];
      } else {
        camera = fixedCameras[i % fixedCameras.length];
      }
      if (!camera) {
        reply.status(500);
        return { error: 'No cameras registered for this station. Run: node prisma/seed.js' };
      }

      const sc = await prisma.sessionCamera.create({
        data: {
          session_id: sessionId,
          camera_id: camera.id,
          camera_type: cameraType,
          name: `${cameraType === 'ocr' ? 'OCR Camera' : `Component Cam ${i}`} — ${path.basename(originalName)}`,
        },
      });

      sessionCameras.push({ ...sc, savePath });
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
      ocr_cameras: ocrFiles.length,
      component_cameras: componentFiles.length,
      message: `Extracting frames from ${sessionCameras.length} video(s) (1 OCR + ${componentFiles.length} component). Poll GET /api/sessions/${sessionId} for status.`,
    };
  });

  // GET /api/sessions
  fastify.get('/', async () => {
    const rows = await prisma.inspectionSession.findMany({
      orderBy: { started_at: 'desc' },
      include: {
        pipeline_stages: { select: { stage: true, status: true } },
        _count: { select: { coaches: true, defects: true, frames: true } },
        station: { select: { station_name: true } },
      },
    });

    return {
      sessions: rows.map((s) => ({
        id: s.id,
        session_code: s.session_code,
        train_number: s.train_number,
        station_name: s.station?.station_name || null,
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
        ocr_frame_count: c.ocr_frame_count || 0,
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

    // Publish to the durable queue instead of calling the pipeline inline —
    // a worker process (npm run worker) claims and runs it. If the API
    // process restarts after this point, the job is not lost.
    try {
      await publishJob('ocr_detection', { session_id: req.params.id });
    } catch (err) {
      fastify.log.error({ msg: 'Failed to publish pipeline job to queue', session_id: req.params.id, error: err.message });
      reply.status(503);
      return { error: 'Pipeline queue unavailable — is Redis running?' };
    }

    reply.status(202);
    return {
      session_id: req.params.id,
      status: 'ocr_running',
      message: 'OCR pipeline job queued. Poll GET /api/sessions/:id for progress.',
    };
  });

  // DELETE /api/sessions/:id
  fastify.delete('/:id', async (req, reply) => {
    const sessionId = req.params.id;
    const session = await prisma.inspectionSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }

    // Delete any associated audit logs first
    await prisma.auditLog.deleteMany({
      where: { session_id: sessionId },
    });

    // Delete session (cascades to other tables)
    await prisma.inspectionSession.delete({
      where: { id: sessionId },
    });

    // Delete session files from uploads directory asynchronously (fire-and-forget)
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rm(sessionDir, { recursive: true, force: true }, (err) => {
        if (err) {
          fastify.log.error({ msg: 'Failed to delete session directory asynchronously', session_id: sessionId, error: err.message });
        } else {
          fastify.log.info({ msg: 'Asynchronously deleted session directory', session_id: sessionId });
        }
      });
    }

    return { success: true, message: `Session ${sessionId} deleted successfully` };
  });
}

module.exports = sessions;
