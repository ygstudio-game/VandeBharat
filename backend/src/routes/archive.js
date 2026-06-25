const prisma = require('../db/client');
const { runArchivePass, getArchiveStats, restoreFrame } = require('../services/archiveService');

async function archive(fastify) {
  // GET /api/archive/stats
  fastify.get('/stats', async (req, reply) => {
    return getArchiveStats();
  });

  // GET /api/archive/frames?session_id=&coach_id=&date=&storage_tier=&limit=&offset=
  fastify.get('/frames', async (req, reply) => {
    const { session_id, coach_id, date, storage_tier, train_number, station, limit = '50', offset = '0' } = req.query;

    const where = {};
    if (session_id)   where.session_id = session_id;
    if (coach_id)     where.coach_id   = coach_id;
    if (storage_tier) where.storage_tier = storage_tier;
    else              where.storage_tier = { in: ['archived', 'cold', 'deleted'] };

    // Train number / station filters via the parent session relation
    const sessionFilter = {};
    if (train_number?.trim()) sessionFilter.train_number = { contains: train_number.trim(), mode: 'insensitive' };
    if (station?.trim())      sessionFilter.station = { station_name: station.trim() };
    if (Object.keys(sessionFilter).length) where.session = sessionFilter;

    if (date) {
      const d = new Date(date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.created_at = { gte: d, lt: next };
    }

    const [frames, total] = await Promise.all([
      prisma.frame.findMany({
        where,
        select: {
          id: true,
          session_id: true,
          coach_id: true,
          sequence_number: true,
          trigger_id: true,
          cloudinary_url: true,
          thumbnail_url: true,
          file_size_bytes: true,
          storage_tier: true,
          archived_at: true,
          created_at: true,
          session: { select: { train_number: true, session_code: true, station: { select: { station_name: true } } } },
          coach:   { select: { coach_number: true } },
        },
        orderBy: { created_at: 'desc' },
        take: parseInt(limit, 10),
        skip: parseInt(offset, 10),
      }),
      prisma.frame.count({ where }),
    ]);

    return {
      frames: frames.map(f => ({
        ...f,
        trigger_id: f.trigger_id ? Number(f.trigger_id) : null,
      })),
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    };
  });

  // POST /api/archive/run — trigger archive pass manually
  fastify.post('/run', async (req, reply) => {
    const result = await runArchivePass();
    return { ok: true, ...result };
  });

  // POST /api/archive/restore/:frameId
  fastify.post('/restore/:frameId', async (req, reply) => {
    const { frameId } = req.params;
    const frame = await prisma.frame.findUnique({ where: { id: frameId } });
    if (!frame) {
      reply.status(404);
      return { error: 'Frame not found' };
    }
    if (frame.storage_tier === 'deleted') {
      reply.status(400);
      return { error: 'Cannot restore deleted frame' };
    }
    const updated = await restoreFrame(frameId);
    return { ok: true, frame: { id: updated.id, storage_tier: updated.storage_tier } };
  });
}

module.exports = archive;
