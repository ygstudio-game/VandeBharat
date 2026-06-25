const prisma = require('../db/client');
const { getRedis } = require('../queue/redisClient');

const PIPELINE_STAGES = ['ocr_detection', 'synchronization', 'correlation', 'report_generation'];

function streamKey(s)  { return `vande:stream:${s}`; }
function dlqKey(s)     { return `vande:stream:${s}:dlq`; }
function groupName(s)  { return `vande:group:${s}`; }

async function getStageStats(redis, stage) {
  try {
    const [streamLen, dlqLen] = await Promise.all([
      redis.xlen(streamKey(stage)).catch(() => null),
      redis.xlen(dlqKey(stage)).catch(() => 0),
    ]);

    // XPENDING summary: count + idle info
    let pending = 0;
    let consumers = 0;
    try {
      const summary = await redis.xpending(streamKey(stage), groupName(stage));
      if (summary && Array.isArray(summary)) {
        pending   = summary[0] || 0;
        consumers = Array.isArray(summary[3]) ? summary[3].length : 0;
      }
    } catch (_) {}

    return { stream_depth: streamLen ?? 0, pending, consumers, dlq_depth: dlqLen };
  } catch {
    return { stream_depth: 0, pending: 0, consumers: 0, dlq_depth: 0, error: 'unavailable' };
  }
}

async function syncHub(fastify) {
  // GET /api/sync/status?station=<name> — queue depths + recent pipeline health
  fastify.get('/status', async (req) => {
    const station = req.query.station?.trim();
    let redisOnline = false;
    let stages = {};

    try {
      const redis = getRedis();
      await redis.ping();
      redisOnline = true;

      const statsArr = await Promise.all(PIPELINE_STAGES.map((s) => getStageStats(redis, s)));
      for (let i = 0; i < PIPELINE_STAGES.length; i++) {
        stages[PIPELINE_STAGES[i]] = statsArr[i];
      }
    } catch (_) {
      for (const s of PIPELINE_STAGES) {
        stages[s] = { stream_depth: 0, pending: 0, consumers: 0, dlq_depth: 0, error: 'redis_unavailable' };
      }
    }

    // Recent session pipeline summary from DB
    const recentSessions = await prisma.inspectionSession.findMany({
      where: station ? { station: { station_name: station } } : {},
      orderBy: { started_at: 'desc' },
      take: 10,
      select: {
        id: true,
        train_number: true,
        status: true,
        started_at: true,
        completed_at: true,
        station: { select: { station_name: true } },
        pipeline_stages: {
          select: { stage: true, status: true, progress_pct: true, started_at: true, completed_at: true, worker_id: true, attempts: true },
        },
      },
    });

    // Active worker count from DB (claimed in last 5 min)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeWorkers = await prisma.pipelineStage.findMany({
      where: {
        claimed_at: { gte: fiveMinAgo },
        status: 'running',
        worker_id: { not: null },
      },
      select: { worker_id: true },
      distinct: ['worker_id'],
    });

    const totalDlq = Object.values(stages).reduce((s, v) => s + (v.dlq_depth || 0), 0);
    const totalPending = Object.values(stages).reduce((s, v) => s + (v.pending || 0), 0);

    return {
      redis_online: redisOnline,
      total_dlq: totalDlq,
      total_pending: totalPending,
      active_workers: activeWorkers.length,
      stages,
      recent_sessions: recentSessions.map((s) => ({
        id: s.id,
        train_number: s.train_number,
        station_name: s.station?.station_name || null,
        status: s.status,
        started_at: s.started_at,
        completed_at: s.completed_at,
        stages: s.pipeline_stages,
      })),
    };
  });

  // GET /api/sync/history — pipeline stage event log from DB
  fastify.get('/history', async (req) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const stage = req.query.stage;
    const station = req.query.station?.trim();

    const where = stage ? { stage } : {};
    const events = await prisma.pipelineStage.findMany({
      where: {
        ...where,
        started_at: { not: null },
        ...(station ? { session: { station: { station_name: station } } } : {}),
      },
      orderBy: { started_at: 'desc' },
      take: limit,
      select: {
        id: true,
        stage: true,
        status: true,
        progress_pct: true,
        attempts: true,
        worker_id: true,
        error_message: true,
        detail_message: true,
        started_at: true,
        completed_at: true,
        session: {
          select: { id: true, train_number: true, station: { select: { station_name: true } } },
        },
      },
    });

    return { events, total: events.length };
  });

  // POST /api/sync/retry-dlq/:stage — requeue DLQ items back to main stream
  fastify.post('/retry-dlq/:stage', async (req, reply) => {
    const { stage } = req.params;
    if (!PIPELINE_STAGES.includes(stage))
      return reply.status(400).send({ error: `Unknown stage: ${stage}` });

    try {
      const redis = getRedis();
      const entries = await redis.xrange(dlqKey(stage), '-', '+', 'COUNT', 50);
      if (!entries || entries.length === 0)
        return { requeued: 0, message: 'DLQ empty' };

      let requeued = 0;
      for (const [id, fields] of entries) {
        const raw = fields[fields.indexOf('data') + 1];
        if (raw) {
          let payload;
          try { payload = JSON.parse(raw); } catch { payload = {}; }
          // Reset attempt count when manually retrying
          delete payload._attempts;
          delete payload._error;
          delete payload._dlq_at;
          await redis.xadd(streamKey(stage), '*', 'data', JSON.stringify(payload));
          await redis.xdel(dlqKey(stage), id);
          requeued++;
        }
      }

      return { requeued, stage };
    } catch (err) {
      return reply.status(503).send({ error: `Redis unavailable: ${err.message}` });
    }
  });
}

module.exports = syncHub;
