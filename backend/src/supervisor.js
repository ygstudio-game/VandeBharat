'use strict';
/**
 * Supervisor (D2) — Node port of services/_supervisor/watchdog.py.
 *
 * Health-checks each service and restarts a dead/hung one with exponential
 * backoff, with a crash-loop guard so a service that won't boot is paged instead
 * of hammered forever. `graceMs` gives slow-warmup services (e.g. YOLO ~120 s)
 * time to come up after a restart before the next probe.
 *
 * probe/restart/clock are injected so the state machine is unit-tested without
 * real processes or HTTP.
 */

const HState = Object.freeze({
  HEALTHY: 'healthy',
  FAILING: 'failing',
  RESTARTING: 'restarting',
  CRITICAL: 'critical', // crash-loop tripped — stop restarting, page a human
});

function createService(opts) {
  if (!opts.name) throw new Error('supervised service needs a name');
  if (typeof opts.probe !== 'function') throw new Error('probe must be a function');
  if (typeof opts.restart !== 'function') throw new Error('restart must be a function');
  return {
    name: opts.name,
    probe: opts.probe, // async () => boolean
    restart: opts.restart, // async () => void
    failThreshold: opts.failThreshold ?? 2,
    backoffBaseMs: opts.backoffBaseMs ?? 500,
    backoffCapMs: opts.backoffCapMs ?? 30_000,
    crashloopMax: opts.crashloopMax ?? 5,
    crashloopWindowMs: opts.crashloopWindowMs ?? 60_000,
    graceMs: opts.graceMs ?? 0, // extra cooldown after a restart (warmup time)
    // state
    state: HState.HEALTHY,
    consecutiveFailures: 0,
    restartStreak: 0,
    restarts: 0,
    nextAllowedMs: 0,
    restartTimes: [],
  };
}

class Supervisor {
  constructor({ clock } = {}) {
    this.services = [];
    this.events = [];
    this.clock = clock ?? (() => Date.now());
  }

  add(svc) {
    this.services.push(svc);
    return svc;
  }

  _emit(kind, svc, extra = {}) {
    this.events.push({ event: kind, service: svc.name, ...extra });
  }

  async tick(svc, now = this.clock()) {
    if (svc.state === HState.CRITICAL) return;
    if (now < svc.nextAllowedMs) return; // cooling down after a restart

    if (await svc.probe()) {
      if (svc.state !== HState.HEALTHY) this._emit('recovered', svc);
      svc.consecutiveFailures = 0;
      svc.restartStreak = 0;
      svc.state = HState.HEALTHY;
      return;
    }

    svc.consecutiveFailures += 1;
    svc.state = HState.FAILING;
    if (svc.consecutiveFailures < svc.failThreshold) return;

    // crash-loop guard
    svc.restartTimes = svc.restartTimes.filter((t) => now - t <= svc.crashloopWindowMs);
    if (svc.restartTimes.length >= svc.crashloopMax) {
      svc.state = HState.CRITICAL;
      this._emit('crashloop_critical', svc, { restartsInWindow: svc.restartTimes.length });
      return;
    }

    await svc.restart();
    svc.restarts += 1;
    svc.restartStreak += 1;
    svc.restartTimes.push(now);
    const backoff = Math.min(svc.backoffCapMs, svc.backoffBaseMs * 2 ** (svc.restartStreak - 1));
    svc.nextAllowedMs = now + Math.max(backoff, svc.graceMs);
    svc.consecutiveFailures = 0;
    svc.state = HState.RESTARTING;
    this._emit('restart', svc, { attempt: svc.restarts, backoffMs: backoff });
  }

  async tickAll(now = this.clock()) {
    for (const svc of this.services) await this.tick(svc, now);
  }
}

module.exports = { Supervisor, createService, HState };
