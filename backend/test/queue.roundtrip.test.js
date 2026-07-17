// Integration test — publish -> consume round-trip against a real Redis.
// Skipped automatically when REDIS_URL is unset (e.g. plain unit CI).
// Enable in compose: REDIS_URL=redis://127.0.0.1:6379 node --test test/queue.roundtrip.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const HAS_REDIS = !!process.env.REDIS_URL;

test('publish -> consume round-trip', { skip: !HAS_REDIS ? 'REDIS_URL not set' : false }, async () => {
  const { publishJob, ensureGroup, consumeStream } = require('../src/queue/queue');
  const stage = `b0test_${Date.now()}`;
  await ensureGroup(stage);

  const payload = { hello: 'world', n: 42 };
  const got = new Promise((resolve) => {
    consumeStream(stage, 'tester', async (job) => { resolve(job); }, { blockMs: 1000 });
  });

  await publishJob(stage, payload);
  const received = await Promise.race([
    got,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
  ]);
  assert.deepStrictEqual(received, payload);
});
