const prisma = require('../db/client');

const UPTIME_ALERT_THRESHOLD = 90;
const SAMPLE_SIZE = 20; // most recent SessionCamera rows per camera

async function cameraHealth(fastify) {
  // GET /api/cameras/health — live status for every registered camera
  fastify.get('/health', async () => {
    const cameras = await prisma.camera.findMany({
      // Exclude legacy per-upload cameras (created before the fixed-registry fix).
      where: { NOT: { camera_code: { startsWith: 'UPLOAD_' } } },
      include: {
        camera_setup: { select: { station_name: true, station_code: true } },
        session_cameras: {
          orderBy: { created_at: 'desc' },
          take: SAMPLE_SIZE,
          select: { frame_count: true, dropped_frames: true, created_at: true },
        },
      },
    });

    const results = cameras.map((cam) => {
      const recent = cam.session_cameras;
      const totalFrames = recent.reduce((s, r) => s + r.frame_count, 0);
      const totalDropped = recent.reduce((s, r) => s + r.dropped_frames, 0);
      const totalExpected = totalFrames + totalDropped;
      const uptimePct = totalExpected > 0 ? Math.round((totalFrames / totalExpected) * 1000) / 10 : null;
      const lastSeen = recent[0]?.created_at ?? null;

      let status = 'unknown';
      if (!cam.is_active) status = 'offline';
      else if (uptimePct == null) status = 'unknown';
      else if (uptimePct >= UPTIME_ALERT_THRESHOLD) status = 'healthy';
      else if (uptimePct >= 50) status = 'degraded';
      else status = 'offline';

      return {
        id: cam.id,
        camera_code: cam.camera_code,
        camera_type: cam.camera_type,
        position_label: cam.position_label,
        station_name: cam.camera_setup?.station_name ?? null,
        station_code: cam.camera_setup?.station_code ?? null,
        is_active: cam.is_active,
        uptime_pct: uptimePct,
        sessions_sampled: recent.length,
        last_seen: lastSeen,
        status,
        alert: uptimePct != null && uptimePct < UPTIME_ALERT_THRESHOLD,
      };
    });

    return {
      cameras: results,
      alert_count: results.filter((r) => r.alert).length,
      uptime_threshold: UPTIME_ALERT_THRESHOLD,
    };
  });
}

module.exports = cameraHealth;
