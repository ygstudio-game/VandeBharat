"""
Watchdog + Supervised Restart (D2).

A supervisor health-checks each service and restarts a dead/hung one with
exponential backoff, with a crash-loop guard so a service that won't boot is not
hammered forever (it goes CRITICAL and pages instead). A Heartbeat detects a
service that is alive-but-stuck (no progress for T seconds).

Probe + restart are injected so the state machine is unit-tested without real
processes/HTTP. In production: probe = GET /health, restart = respawn process.
In-flight pipeline jobs are not lost on restart — the Redis Streams queue resumes
pending messages via XAUTOCLAIM (existing backend/src/queue).
"""
import logging
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger("supervisor")


class HState(str, Enum):
    HEALTHY = "healthy"
    FAILING = "failing"
    RESTARTING = "restarting"
    CRITICAL = "critical"     # crash-loop tripped — stop restarting, page a human


@dataclass
class SupervisedService:
    name: str
    probe: callable           # () -> bool   (healthy?)
    restart: callable         # () -> None   (respawn)
    fail_threshold: int = 2          # consecutive failed probes before a restart
    backoff_base_s: float = 0.5
    backoff_cap_s: float = 30.0
    crashloop_max: int = 5           # restarts allowed within the window
    crashloop_window_s: float = 60.0
    # state
    state: HState = HState.HEALTHY
    consecutive_failures: int = 0
    restart_streak: int = 0
    restarts: int = 0
    next_allowed_s: float = 0.0
    restart_times: list = field(default_factory=list)


class Supervisor:
    def __init__(self):
        self.services: list[SupervisedService] = []
        self.events: list[dict] = []

    def add(self, svc: SupervisedService) -> SupervisedService:
        self.services.append(svc)
        return svc

    def _emit(self, kind: str, svc: SupervisedService, **extra):
        ev = {"event": kind, "service": svc.name, **extra}
        self.events.append(ev)
        logger.info('{"event":"%s","service":"%s"}', kind, svc.name)

    def tick(self, svc: SupervisedService, now: float) -> None:
        if svc.state == HState.CRITICAL:
            return
        if now < svc.next_allowed_s:
            return                       # cooling down after a restart

        if svc.probe():
            if svc.state != HState.HEALTHY:
                self._emit("recovered", svc)
            svc.consecutive_failures = 0
            svc.restart_streak = 0
            svc.state = HState.HEALTHY
            return

        svc.consecutive_failures += 1
        svc.state = HState.FAILING
        if svc.consecutive_failures < svc.fail_threshold:
            return

        # crash-loop guard
        svc.restart_times = [t for t in svc.restart_times if now - t <= svc.crashloop_window_s]
        if len(svc.restart_times) >= svc.crashloop_max:
            svc.state = HState.CRITICAL
            self._emit("crashloop_critical", svc, restarts_in_window=len(svc.restart_times))
            return

        svc.restart()
        svc.restarts += 1
        svc.restart_streak += 1
        svc.restart_times.append(now)
        backoff = min(svc.backoff_cap_s, svc.backoff_base_s * (2 ** (svc.restart_streak - 1)))
        svc.next_allowed_s = now + backoff
        svc.consecutive_failures = 0
        svc.state = HState.RESTARTING
        self._emit("restart", svc, attempt=svc.restarts, backoff_s=backoff)

    def tick_all(self, now: float) -> None:
        for svc in self.services:
            self.tick(svc, now)


def http_probe(url: str, timeout_s: float = 3.0):
    """Production probe: GET /health -> healthy if 200 and status != 'down'."""
    def probe() -> bool:
        import requests  # lazy
        try:
            r = requests.get(url, timeout=timeout_s)
            return r.status_code == 200 and r.json().get("status") != "down"
        except Exception:
            return False
    return probe


@dataclass
class Heartbeat:
    """In-loop liveness: a worker calls beat() each iteration; stale() flags a hang."""
    last_beat_s: float = 0.0

    def beat(self, now: float) -> None:
        self.last_beat_s = now

    def stale(self, now: float, timeout_s: float) -> bool:
        return (now - self.last_beat_s) > timeout_s
