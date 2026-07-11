/**
 * Intelligence routes — Phase 3
 * GET /api/sessions/:id/coaches/:coachId/intelligence
 *   → defects + component detections + missing components for one coach
 * GET /api/sessions/:id/coaches/:coachId/frames
 *   → paginated frames for one coach
 */
const prisma = require('../db/client');

async function intelligence(fastify) {
  // GET /api/sessions/:id/coaches/:coachId/intelligence
  fastify.get('/:id/coaches/:coachId/intelligence', async (req, reply) => {
    const { id: sessionId, coachId } = req.params;

    const coach = await prisma.coach.findFirst({
      where: { id: coachId, session_id: sessionId },
    });
    if (!coach) {
      reply.status(404);
      return { error: 'Coach not found' };
    }

    const [defects, componentDetections, missingComponents] = await Promise.all([
      prisma.defect.findMany({
        where: { coach_id: coachId },
        orderBy: [{ severity: 'asc' }, { created_at: 'asc' }],
        include: { frame: { select: { cloudinary_url: true, trigger_id: true } } },
      }),
      prisma.componentDetection.findMany({
        where: { coach_id: coachId },
        orderBy: { confidence: 'desc' },
        include: { frame: { select: { cloudinary_url: true, trigger_id: true } } },
      }),
      prisma.missingComponent.findMany({
        where: { coach_id: coachId },
        orderBy: { severity: 'asc' },
      }),
    ]);

    return {
      coach: {
        id: coach.id,
        coach_number: coach.coach_number,
        coach_index: coach.coach_index,
        health_score: coach.health_score ? Number(coach.health_score) : null,
        critical_defects: coach.critical_defects,
        missing_components: coach.missing_components,
        total_frames: coach.total_frames,
        start_trigger_id: coach.start_trigger_id ? Number(coach.start_trigger_id) : null,
        end_trigger_id: coach.end_trigger_id ? Number(coach.end_trigger_id) : null,
      },
      defects: defects.map((d) => ({
        id: d.id,
        defect_type: d.defect_type,
        severity: d.severity,
        confidence: Number(d.confidence),
        bbox: { x: d.bbox_x, y: d.bbox_y, w: d.bbox_w, h: d.bbox_h },
        frame_url: d.frame?.cloudinary_url ?? null,
        trigger_id: d.frame?.trigger_id ? Number(d.frame.trigger_id) : null,
        annotated_frame_url: d.annotated_frame_url,
        review_status: d.review_status,
        ai_notes: d.ai_notes,
        created_at: d.created_at,
      })),
      components_detected: componentDetections.map((c) => ({
        id: c.id,
        component_code: c.component_code,
        component_name: c.component_name,
        confidence: Number(c.confidence),
        bbox: { x: c.bbox_x, y: c.bbox_y, w: c.bbox_w, h: c.bbox_h },
        frame_url: c.frame?.cloudinary_url ?? null,
        trigger_id: c.frame?.trigger_id ? Number(c.frame.trigger_id) : null,
      })),
      missing_components: missingComponents.map((m) => ({
        id: m.id,
        component_code: m.component_code,
        component_name: m.component_name,
        expected_count: m.expected_count,
        detected_count: m.detected_count,
        severity: m.severity,
      })),
      summary: {
        total_defects: defects.length,
        critical: defects.filter((d) => d.severity === 'CRITICAL').length,
        high: defects.filter((d) => d.severity === 'HIGH').length,
        medium: defects.filter((d) => d.severity === 'MEDIUM').length,
        low: defects.filter((d) => d.severity === 'LOW').length,
        missing_components: missingComponents.length,
        components_detected: componentDetections.length,
      },
    };
  });

  // GET /api/sessions/:id/coaches/:coachId/frames?page=1&limit=50
  fastify.get('/:id/coaches/:coachId/frames', async (req, reply) => {
    const { id: sessionId, coachId } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const skip = (page - 1) * limit;

    const coach = await prisma.coach.findFirst({
      where: { id: coachId, session_id: sessionId },
      select: { id: true, total_frames: true },
    });
    if (!coach) {
      reply.status(404);
      return { error: 'Coach not found' };
    }

    const frames = await prisma.frame.findMany({
      where: { coach_id: coachId, session_id: sessionId },
      orderBy: { trigger_id: 'asc' },
      skip,
      take: limit,
      select: {
        id: true,
        trigger_id: true,
        sequence_number: true,
        captured_at_ms: true,
        cloudinary_url: true,
        thumbnail_url: true,
        width_px: true,
        height_px: true,
        is_ocr_candidate: true,
        is_defect_flagged: true,
        review_status: true,
        review_notes: true,
        session_camera: { select: { id: true, camera_type: true, name: true } },
        coach_frame_map: { select: { assignment_method: true, confidence: true } },
        ocr_results: {
          select: {
            coach_number: true,
            confidence: true,
            is_valid: true,
            bbox_x: true,
            bbox_y: true,
            bbox_w: true,
            bbox_h: true,
          },
          orderBy: { confidence: 'desc' },
        },
        defects: {
          select: {
            id: true,
            defect_type: true,
            severity: true,
            confidence: true,
            review_status: true,
            bbox_x: true,
            bbox_y: true,
            bbox_w: true,
            bbox_h: true,
          },
        },
      },
    });

    return {
      coach_id: coachId,
      page,
      limit,
      total: coach.total_frames,
      pages: Math.ceil(coach.total_frames / limit),
      frames: frames.map((f) => ({
        id: f.id,
        trigger_id: Number(f.trigger_id),
        sequence_number: f.sequence_number,
        captured_at_ms: Number(f.captured_at_ms),
        review_status: f.review_status,
        review_notes: f.review_notes,
        cloudinary_url: f.cloudinary_url,
        thumbnail_url: f.thumbnail_url,
        width: f.width_px,
        height: f.height_px,
        is_ocr_candidate: f.is_ocr_candidate,
        is_defect_flagged: f.is_defect_flagged,
        camera_type: f.session_camera?.camera_type ?? null,
        camera_name: f.session_camera?.name ?? null,
        assignment_method: f.coach_frame_map?.assignment_method ?? null,
        ocr_result: f.ocr_results[0] ?? null,
        ocr_results: f.ocr_results.map((r) => ({
          ...r,
          confidence: Number(r.confidence),
        })),
        defects: f.defects.map((d) => ({
          ...d,
          confidence: d.confidence ? Number(d.confidence) : undefined,
        })),
      })),
    };
  });

  // GET /api/sessions/:id/timeline-events
  fastify.get('/:id/timeline-events', async (req, reply) => {
    const [events, coaches] = await Promise.all([
      prisma.timelineEvent.findMany({
        where: { session_id: req.params.id },
        orderBy: { timestamp_ms: 'asc' },
        include: {
          frame: { select: { cloudinary_url: true, thumbnail_url: true, trigger_id: true } },
          coach: { select: { coach_number: true, coach_index: true, health_score: true } },
        },
      }),
      prisma.coach.findMany({
        where: { session_id: req.params.id },
        orderBy: { coach_index: 'asc' },
        select: {
          id: true, coach_number: true, coach_index: true,
          start_trigger_id: true, end_trigger_id: true,
          health_score: true, ocr_confidence: true,
        },
      }),
    ]);

    return {
      events: events.map(e => ({
        ...e,
        timestamp_ms: e.timestamp_ms ? Number(e.timestamp_ms) : null,
        frame: e.frame ? { ...e.frame, trigger_id: e.frame.trigger_id ? Number(e.frame.trigger_id) : null } : null,
        coach: e.coach ? { ...e.coach, health_score: e.coach.health_score ? Number(e.coach.health_score) : null } : null,
      })),
      coaches: coaches.map(c => ({
        ...c,
        start_trigger_id: c.start_trigger_id ? Number(c.start_trigger_id) : null,
        end_trigger_id: c.end_trigger_id ? Number(c.end_trigger_id) : null,
        health_score: c.health_score ? Number(c.health_score) : null,
        ocr_confidence: c.ocr_confidence ? Number(c.ocr_confidence) : null,
      })),
    };
  });
}

module.exports = intelligence;
