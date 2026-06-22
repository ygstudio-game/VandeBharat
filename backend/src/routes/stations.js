const prisma = require('../db/client');

const HEARTBEAT_ONLINE_MS  = 5  * 60 * 1000; // 5 min
const HEARTBEAT_DEGRADED_MS = 30 * 60 * 1000; // 30 min
const CAMERA_SAMPLE = 20;

function stationStatus(edgeMachine, activeCameras, totalCameras) {
  const cameraPct = totalCameras > 0 ? activeCameras / totalCameras : 0;
  const now = Date.now();
  const lastHb = edgeMachine?.last_heartbeat ? new Date(edgeMachine.last_heartbeat).getTime() : null;
  const hbAge = lastHb ? now - lastHb : Infinity;

  if (hbAge > HEARTBEAT_DEGRADED_MS || cameraPct < 0.5) return 'offline';
  if (hbAge > HEARTBEAT_ONLINE_MS  || cameraPct < 0.8) return 'degraded';
  return 'online';
}

async function stations(fastify) {
  // GET /api/stations — list all stations
  fastify.get('/', async () => {
    const setups = await prisma.cameraSetup.findMany({
      orderBy: { station_name: 'asc' },
      include: {
        edge_machine: { select: { hostname: true, status: true, last_heartbeat: true, ip_address: true } },
        _count: { select: { cameras: true } },
      },
    });

    return setups.map((s) => ({
      id:           s.id,
      station_name: s.station_name,
      station_code: s.station_code,
      is_active:    s.is_active,
      installed_at: s.installed_at,
      edge_machine: s.edge_machine,
      camera_count: s._count.cameras,
    }));
  });

  // GET /api/stations/overview — per-station aggregate
  fastify.get('/overview', async () => {
    const setups = await prisma.cameraSetup.findMany({
      orderBy: { station_name: 'asc' },
      include: {
        edge_machine: { select: { hostname: true, status: true, last_heartbeat: true, ip_address: true } },
        cameras: {
          select: {
            id: true,
            is_active: true,
            camera_type: true,
            session_cameras: {
              orderBy: { created_at: 'desc' },
              take: CAMERA_SAMPLE,
              select: { frame_count: true, dropped_frames: true },
            },
          },
        },
        sessions_by_code: {
          orderBy: { started_at: 'desc' },
          take: 1,
          select: { id: true, started_at: true, status: true, train_number: true },
        },
      },
    });

    // Count active sessions across all stations
    const activeSessions = await prisma.inspectionSession.groupBy({
      by: ['station_code'],
      where: { status: { in: ['active', 'processing', 'queued'] } },
      _count: { id: true },
    });
    const activeByCode = Object.fromEntries(activeSessions.map((r) => [r.station_code, r._count.id]));

    return setups.map((s) => {
      const total   = s.cameras.length;
      const active  = s.cameras.filter((c) => c.is_active).length;

      // Camera uptime
      const cameraStats = s.cameras.map((cam) => {
        const frames   = cam.session_cameras.reduce((sum, sc) => sum + sc.frame_count, 0);
        const dropped  = cam.session_cameras.reduce((sum, sc) => sum + sc.dropped_frames, 0);
        const expected = frames + dropped;
        return expected > 0 ? (frames / expected) * 100 : null;
      }).filter((v) => v !== null);
      const avgUptime = cameraStats.length
        ? Math.round(cameraStats.reduce((a, b) => a + b, 0) / cameraStats.length * 10) / 10
        : null;

      const status = stationStatus(s.edge_machine, active, total);
      const lastSession = s.sessions_by_code[0] ?? null;

      return {
        id:               s.id,
        station_name:     s.station_name,
        station_code:     s.station_code,
        is_active:        s.is_active,
        edge_machine:     s.edge_machine,
        total_cameras:    total,
        active_cameras:   active,
        avg_uptime_pct:   avgUptime,
        active_sessions:  activeByCode[s.station_code] ?? 0,
        last_inspection:  lastSession,
        status,
      };
    });
  });

  // GET /api/stations/:code — station detail
  fastify.get('/:code', async (req, reply) => {
    const setup = await prisma.cameraSetup.findUnique({
      where: { station_code: req.params.code },
      include: {
        edge_machine: true,
        cameras: {
          select: {
            id: true,
            camera_code: true,
            camera_type: true,
            position_label: true,
            is_active: true,
            session_cameras: {
              orderBy: { created_at: 'desc' },
              take: CAMERA_SAMPLE,
              select: { frame_count: true, dropped_frames: true, created_at: true },
            },
          },
        },
        sessions_by_code: {
          orderBy: { started_at: 'desc' },
          take: 10,
          select: {
            id: true,
            session_code: true,
            train_number: true,
            status: true,
            started_at: true,
            completed_at: true,
            critical_defects: true,
            health_score: true,
          },
        },
      },
    });

    if (!setup) return reply.status(404).send({ error: 'Station not found' });

    const cameras = setup.cameras.map((cam) => {
      const frames   = cam.session_cameras.reduce((s, sc) => s + sc.frame_count, 0);
      const dropped  = cam.session_cameras.reduce((s, sc) => s + sc.dropped_frames, 0);
      const expected = frames + dropped;
      const uptime   = expected > 0 ? Math.round((frames / expected) * 1000) / 10 : null;
      const lastSeen = cam.session_cameras[0]?.created_at ?? null;

      let camStatus = 'unknown';
      if (!cam.is_active) camStatus = 'offline';
      else if (uptime == null) camStatus = 'unknown';
      else if (uptime >= 90) camStatus = 'healthy';
      else if (uptime >= 50) camStatus = 'degraded';
      else camStatus = 'offline';

      return {
        id:             cam.id,
        camera_code:    cam.camera_code,
        camera_type:    cam.camera_type,
        position_label: cam.position_label,
        is_active:      cam.is_active,
        uptime_pct:     uptime,
        last_seen:      lastSeen,
        status:         camStatus,
      };
    });

    return {
      id:           setup.id,
      station_name: setup.station_name,
      station_code: setup.station_code,
      is_active:    setup.is_active,
      installed_at: setup.installed_at,
      edge_machine: setup.edge_machine,
      cameras,
      recent_sessions: setup.sessions_by_code,
    };
  });
}

module.exports = stations;
