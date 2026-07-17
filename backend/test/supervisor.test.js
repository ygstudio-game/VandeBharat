// D2 — Node Supervisor state machine tests (mirror watchdog.py unit tests).
const { test } = require('node:test');
const assert = require('node:assert');
const { Supervisor, createService, HState } = require('../src/supervisor');

test('restart after fail threshold, then recover', async () => {
  let healthy = true;
  let restarts = 0;
  const sup = new Supervisor();
  const svc = sup.add(createService({
    name: 'yolo',
    probe: async () => healthy,
    restart: async () => { restarts += 1; },
    failThreshold: 2, backoffBaseMs: 1000, backoffCapMs: 10_000,
  }));

  let now = 0;
  await sup.tick(svc, now);                 // healthy
  assert.strictEqual(svc.state, HState.HEALTHY);

  healthy = false;
  await sup.tick(svc, now);                  // 1st failure (< threshold)
  assert.strictEqual(restarts, 0);
  await sup.tick(svc, now);                  // 2nd -> restart
  assert.strictEqual(restarts, 1);
  assert.strictEqual(svc.state, HState.RESTARTING);

  await sup.tick(svc, now + 500);            // within backoff -> nothing
  assert.strictEqual(restarts, 1);

  healthy = true;
  await sup.tick(svc, now + 2000);           // past backoff -> healthy
  assert.strictEqual(svc.state, HState.HEALTHY);
  assert.strictEqual(svc.restartStreak, 0);
});

test('crash-loop goes CRITICAL and stops restarting', async () => {
  let restarts = 0;
  const sup = new Supervisor();
  const svc = sup.add(createService({
    name: 'ocr',
    probe: async () => false,                // never healthy
    restart: async () => { restarts += 1; },
    failThreshold: 1, backoffBaseMs: 1000, backoffCapMs: 5000,
    crashloopMax: 3, crashloopWindowMs: 10_000_000,
  }));

  let now = 0;
  for (let i = 0; i < 20 && svc.state !== HState.CRITICAL; i++) {
    await sup.tick(svc, now);
    now += 6000;                             // jump past each backoff
  }
  assert.strictEqual(svc.state, HState.CRITICAL);
  assert.strictEqual(svc.restarts, 3);       // capped at crashloopMax
  const before = svc.restarts;
  await sup.tick(svc, now + 100_000);
  assert.strictEqual(svc.restarts, before);  // CRITICAL -> no further restarts
});

test('backoff grows then caps', async () => {
  const delays = [];
  const sup = new Supervisor();
  const svc = sup.add(createService({
    name: 'sync',
    probe: async () => false,
    restart: async () => {},
    failThreshold: 1, backoffBaseMs: 1000, backoffCapMs: 4000,
    crashloopMax: 99, crashloopWindowMs: 10_000_000,
  }));
  let now = 0;
  for (let i = 0; i < 5; i++) {
    const prev = svc.nextAllowedMs;
    await sup.tick(svc, now);
    if (svc.nextAllowedMs > prev) delays.push(svc.nextAllowedMs - now);
    now = svc.nextAllowedMs;
  }
  assert.deepStrictEqual(delays.slice(0, 3), [1000, 2000, 4000]); // doubles then caps
  assert.ok(delays.slice(2).every((d) => d === 4000));
});

test('grace period overrides short backoff after restart', async () => {
  let restarts = 0;
  const sup = new Supervisor();
  const svc = sup.add(createService({
    name: 'yolo',
    probe: async () => false,
    restart: async () => { restarts += 1; },
    failThreshold: 1, backoffBaseMs: 500, graceMs: 120_000, // 120s warmup
    crashloopMax: 99, crashloopWindowMs: 10_000_000,
  }));
  await sup.tick(svc, 0);
  assert.strictEqual(restarts, 1);
  assert.strictEqual(svc.nextAllowedMs, 120_000);  // grace, not the 500ms backoff
  await sup.tick(svc, 1000);                        // still warming up -> no 2nd restart
  assert.strictEqual(restarts, 1);
});

test('restart events are recorded', async () => {
  const sup = new Supervisor();
  const svc = sup.add(createService({
    name: 'yolo', probe: async () => false, restart: async () => {},
    failThreshold: 1, crashloopMax: 99,
  }));
  await sup.tick(svc, 0);
  const kinds = sup.events.map((e) => e.event);
  assert.ok(kinds.includes('restart'));
  assert.strictEqual(sup.events[0].service, 'yolo');
});

test('createService validates inputs', () => {
  assert.throws(() => createService({ probe: async () => true, restart: async () => {} }));
  assert.throws(() => createService({ name: 'x', restart: async () => {} }));
});
