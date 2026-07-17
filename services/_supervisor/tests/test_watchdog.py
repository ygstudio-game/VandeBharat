"""D2 — supervisor restart / backoff / crash-loop + heartbeat tests."""
from watchdog import Supervisor, SupervisedService, HState, Heartbeat


def test_restart_after_fail_threshold_then_recover():
    health = {"ok": True}
    restarts = {"n": 0}
    sup = Supervisor()
    svc = sup.add(SupervisedService(
        name="yolo",
        probe=lambda: health["ok"],
        restart=lambda: restarts.__setitem__("n", restarts["n"] + 1),
        fail_threshold=2, backoff_base_s=1, backoff_cap_s=10))

    now = 0.0
    sup.tick(svc, now)                 # healthy
    assert svc.state == HState.HEALTHY

    health["ok"] = False
    sup.tick(svc, now)                 # 1st failure (< threshold)
    assert restarts["n"] == 0
    sup.tick(svc, now)                 # 2nd failure -> restart
    assert restarts["n"] == 1
    assert svc.state == HState.RESTARTING

    # within backoff window -> no extra probing/restart
    sup.tick(svc, now + 0.5)
    assert restarts["n"] == 1

    # service recovers; after backoff it returns to HEALTHY
    health["ok"] = True
    sup.tick(svc, now + 2)
    assert svc.state == HState.HEALTHY
    assert svc.restart_streak == 0


def test_crashloop_goes_critical_and_stops_restarting():
    sup = Supervisor()
    svc = sup.add(SupervisedService(
        name="ocr",
        probe=lambda: False,           # never healthy
        restart=lambda: None,
        fail_threshold=1, backoff_base_s=1, backoff_cap_s=5,
        crashloop_max=3, crashloop_window_s=10_000))

    now = 0.0
    # drive several ticks, advancing past each backoff so a restart can occur
    for _ in range(20):
        sup.tick(svc, now)
        now += 6                       # > backoff_cap so never stuck in cooldown
        if svc.state == HState.CRITICAL:
            break

    assert svc.state == HState.CRITICAL
    assert svc.restarts == 3            # capped at crashloop_max
    # once CRITICAL, further ticks do nothing
    before = svc.restarts
    sup.tick(svc, now + 100)
    assert svc.restarts == before


def test_backoff_grows_then_caps():
    delays = []
    sup = Supervisor()
    svc = sup.add(SupervisedService(
        name="sync", probe=lambda: False, restart=lambda: None,
        fail_threshold=1, backoff_base_s=1, backoff_cap_s=4,
        crashloop_max=99, crashloop_window_s=10_000))
    now = 0.0
    for _ in range(5):
        prev_allowed = svc.next_allowed_s
        sup.tick(svc, now)
        if svc.next_allowed_s > prev_allowed:
            delays.append(round(svc.next_allowed_s - now, 2))
        now = svc.next_allowed_s        # jump to end of backoff
    # 1,2,4,4,4 — doubles then caps at 4
    assert delays[:3] == [1, 2, 4]
    assert all(d == 4 for d in delays[2:])


def test_restart_events_logged():
    sup = Supervisor()
    svc = sup.add(SupervisedService("yolo", lambda: False, lambda: None,
                                    fail_threshold=1, crashloop_max=99))
    sup.tick(svc, 0.0)
    kinds = [e["event"] for e in sup.events]
    assert "restart" in kinds
    assert sup.events[0]["service"] == "yolo"


def test_heartbeat_staleness():
    hb = Heartbeat()
    hb.beat(100.0)
    assert hb.stale(105.0, timeout_s=10) is False
    assert hb.stale(115.0, timeout_s=10) is True
