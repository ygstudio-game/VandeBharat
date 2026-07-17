/**
 * Minimal durable job queue on Redis Streams.
 *
 * Each pipeline stage gets one stream + one consumer group:
 *   vande:stream:<stage>        — job stream
 *   vande:group:<stage>         — consumer group (shared by all workers for that stage)
 *   vande:stream:<stage>:dlq    — dead-letter stream after maxAttempts exhausted
 *
 * Crash recovery: claimStale() uses XAUTOCLAIM to pick up messages left pending
 * by a worker that died mid-job (visibility-timeout pattern), instead of losing them.
 */
const { getRedis } = require('./redisClient');

function streamKey(stage) {
  return `vande:stream:${stage}`;
}
function dlqKey(stage) {
  return `vande:stream:${stage}:dlq`;
}
function groupName(stage) {
  return `vande:group:${stage}`;
}

async function publishJob(stage, payload) {
  const redis = getRedis();
  const id = await redis.xadd(streamKey(stage), '*', 'data', JSON.stringify(payload));
  return id;
}

async function publishToDlq(stage, payload, errorMessage) {
  const redis = getRedis();
  await redis.xadd(dlqKey(stage), '*', 'data', JSON.stringify({ ...payload, _error: errorMessage, _dlq_at: new Date().toISOString() }));
}

async function ensureGroup(stage) {
  const redis = getRedis();
  try {
    await redis.xgroup('CREATE', streamKey(stage), groupName(stage), '0', 'MKSTREAM');
  } catch (err) {
    if (!String(err.message).includes('BUSYGROUP')) throw err;
  }
}

async function getDlqDepth(stage) {
  const redis = getRedis();
  try {
    return await redis.xlen(dlqKey(stage));
  } catch {
    return 0;
  }
}

/**
 * Reclaim messages left pending (claimed but never acked — worker crashed)
 * for longer than `idleMs`. Returns reclaimed [id, fields] entries to be reprocessed.
 */
async function claimStale(stage, consumerName, idleMs = 60_000, count = 10) {
  const redis = getRedis();
  const [, entries] = await redis.xautoclaim(
    streamKey(stage), groupName(stage), consumerName, idleMs, '0-0', 'COUNT', count,
  );
  return entries || [];
}

/**
 * Long-running consumer loop for one stage. `handler(payload)` must return a Promise.
 * On failure: retries up to maxAttempts with exponential backoff (by republishing a
 * new message), then routes to the dead-letter stream.
 */
function consumeStream(stage, consumerName, handler, { maxAttempts = 3, blockMs = 5000 } = {}) {
  let stopped = false;

  async function processEntry(id, fields) {
    const raw = fields[fields.indexOf('data') + 1];
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }

    const attempts = (payload._attempts || 0) + 1;

    try {
      await handler(payload, { attempts });
      await getRedis().xack(streamKey(stage), groupName(stage), id);
    } catch (err) {
      await getRedis().xack(streamKey(stage), groupName(stage), id);

      if (attempts >= maxAttempts) {
        await publishToDlq(stage, payload, err.message);
        console.error({ msg: 'Job exhausted retries, moved to DLQ', stage, attempts, error: err.message });
      } else {
        const backoffMs = Math.min(1000 * 2 ** attempts, 30_000);
        const retryPayload = { ...payload, _attempts: attempts };
        setTimeout(() => publishJob(stage, retryPayload), backoffMs);
        console.warn({ msg: 'Job failed, retrying with backoff', stage, attempts, backoffMs, error: err.message });
      }
    }
  }

  async function loop() {
    await ensureGroup(stage);
    const redis = getRedis();

    while (!stopped) {
      // Recover anything orphaned by a crashed worker before reading new work.
      try {
        const stale = await claimStale(stage, consumerName);
        for (const [id, fields] of stale) {
          await processEntry(id, fields);
        }
      } catch (err) {
        console.error({ msg: 'claimStale failed', stage, error: err.message });
      }

      let res;
      try {
        res = await redis.xreadgroup(
          'GROUP', groupName(stage), consumerName,
          'COUNT', 1, 'BLOCK', blockMs,
          'STREAMS', streamKey(stage), '>',
        );
      } catch (err) {
        console.error({ msg: 'xreadgroup failed', stage, error: err.message });
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      if (!res) continue; // BLOCK timeout, no new messages

      for (const [, entries] of res) {
        for (const [id, fields] of entries) {
          await processEntry(id, fields);
        }
      }
    }
  }

  loop().catch((err) => console.error({ msg: 'Consumer loop crashed', stage, error: err.message }));

  return () => { stopped = true; };
}

module.exports = {
  publishJob, publishToDlq, ensureGroup, getDlqDepth, claimStale, consumeStream,
  // pure key helpers exported for unit testing (no Redis required)
  streamKey, dlqKey, groupName,
};
