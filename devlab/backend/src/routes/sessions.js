const { Router } = require('express');
const { PrismaClient } = require('@prisma/client');

const router = Router();
const prisma = new PrismaClient();

// GET /api/dev/sessions — all sessions for the picker
router.get('/', async (req, res, next) => {
  try {
    const sessions = await prisma.inspectionSession.findMany({
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        session_code: true,
        train_number: true,
        status: true,
        total_frames: true,
        total_coaches: true,
        ocr_confidence: true,
        sync_confidence: true,
        started_at: true,
        completed_at: true,
      },
    });
    res.json(sessions);
  } catch (err) {
    next(err);
  }
});

// GET /api/dev/sessions/:id/frames — frames for a session, paginated
router.get('/:id/frames', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ocr_only, page = '1', limit = '50' } = req.query;

    const where = { session_id: id };
    if (ocr_only === 'true') where.is_ocr_candidate = true;

    const frames = await prisma.frame.findMany({
      where,
      orderBy: { sequence_number: 'asc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      select: {
        id: true,
        sequence_number: true,
        trigger_id: true,
        cloudinary_url: true,
        thumbnail_url: true,
        is_ocr_candidate: true,
        is_defect_flagged: true,
        coach_id: true,
        session_camera: { select: { camera_type: true } },
        ocr_results: {
          select: { coach_number: true, confidence: true, is_valid: true, pass_number: true },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    });

    const total = await prisma.frame.count({ where });
    res.json({ frames, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/dev/sessions/:id/coaches — coaches with stats
router.get('/:id/coaches', async (req, res, next) => {
  try {
    const coaches = await prisma.coach.findMany({
      where: { session_id: req.params.id },
      orderBy: { coach_index: 'asc' },
      select: {
        id: true,
        coach_number: true,
        coach_type: true,
        coach_index: true,
        ocr_confidence: true,
        sync_confidence: true,
        start_trigger_id: true,
        end_trigger_id: true,
        total_frames: true,
        critical_defects: true,
        health_score: true,
      },
    });
    res.json(coaches);
  } catch (err) {
    next(err);
  }
});

// GET /api/dev/sessions/:id/coaches/:coachId/frames — frames for a specific coach
// Optional ?camera_type=component_left to filter by camera
router.get('/:id/coaches/:coachId/frames', async (req, res, next) => {
  try {
    const { camera_type } = req.query;

    // If filtering by camera_type, resolve the session_camera id first
    let sessionCameraFilter = undefined;
    if (camera_type) {
      const cam = await prisma.sessionCamera.findFirst({
        where: { session_id: req.params.id, camera_type },
        select: { id: true },
      });
      if (cam) sessionCameraFilter = cam.id;
    }

    const where = {
      session_id: req.params.id,
      coach_id: req.params.coachId,
      ...(sessionCameraFilter ? { session_camera_id: sessionCameraFilter } : {}),
    };

    const frames = await prisma.frame.findMany({
      where,
      orderBy: { sequence_number: 'asc' },
      select: {
        id: true,
        sequence_number: true,
        trigger_id: true,
        cloudinary_url: true,
        thumbnail_url: true,
        is_ocr_candidate: true,
        is_defect_flagged: true,
        session_camera: { select: { camera_type: true } },
      },
    });
    res.json(frames);
  } catch (err) {
    next(err);
  }
});

// GET /api/dev/sessions/:id/coaches/:coachId/camera-types — distinct camera types for a coach
router.get('/:id/coaches/:coachId/camera-types', async (req, res, next) => {
  try {
    const frames = await prisma.frame.findMany({
      where: { session_id: req.params.id, coach_id: req.params.coachId },
      select: { session_camera: { select: { camera_type: true } } },
      distinct: ['session_camera_id'],
    });
    const types = [...new Set(frames.map((f) => f.session_camera?.camera_type).filter(Boolean))];
    res.json(types);
  } catch (err) {
    next(err);
  }
});

// GET /api/dev/frames/:frameId/detections — stored component_detections from DB for a frame
router.get('/frames/:frameId/detections', async (req, res, next) => {
  try {
    const detections = await prisma.componentDetection.findMany({
      where: { frame_id: req.params.frameId },
      orderBy: { confidence: 'desc' },
      select: {
        id: true,
        component_code: true,
        component_name: true,
        detection_type: true,
        confidence: true,
        bbox_x: true,
        bbox_y: true,
        bbox_w: true,
        bbox_h: true,
        is_expected: true,
        status: true,
      },
    });
    res.json(detections);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
