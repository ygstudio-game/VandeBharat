"""D1 — email alert dedup / template / retry / DLQ tests (no real SMTP)."""
import os
import pytest

from dedup import DedupWindow
from email_alert import EmailAlerter, render_email


def _event(coach="LWSCN12345", defect="crack", score=0.95):
    return {"coach_id": coach, "defect_class": defect, "score": score,
            "station": "Pune", "timestamp": "2026-06-28T10:05:23Z",
            "evidence_url": "http://host/evidence/abc.jpg"}


class FakeSender:
    def __init__(self, fail_times=0):
        self.fail_times = fail_times
        self.calls = 0
        self.outbox = []

    def send(self, recipients, subject, body):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise ConnectionError("smtp down")
        self.outbox.append({"recipients": recipients, "subject": subject, "body": body})


def _alerter(sender, **kw):
    clock = kw.pop("clock", lambda: 0.0)
    return EmailAlerter(sender, ["ops@rail"], DedupWindow(window_sec=60),
                        clock=clock, sleeper=lambda _s: None, **kw)


def test_template_has_required_fields():
    subject, body = render_email(_event())
    assert "LWSCN12345" in subject and "crack" in subject
    for token in ["Coach:", "Defect:", "Confidence:", "Station:", "Time:", "Evidence:"]:
        assert token in body
    assert "0.950" in body
    assert "http://host/evidence/abc.jpg" in body


def test_missing_required_field_raises():
    bad = _event()
    del bad["station"]
    with pytest.raises(KeyError):
        render_email(bad)


def test_one_email_per_defect_per_coach_within_window():
    s = FakeSender()
    t = {"now": 0.0}
    a = _alerter(s, clock=lambda: t["now"])
    for _ in range(3):              # 3 detections, same coach+defect, within 60s
        a.handle(_event())
        t["now"] += 5
    assert len(s.outbox) == 1
    assert a.sent == 1
    assert a.suppressed == 2


def test_window_expiry_allows_again():
    s = FakeSender()
    t = {"now": 0.0}
    a = _alerter(s, clock=lambda: t["now"])
    a.handle(_event())
    t["now"] = 61                   # past the 60s window
    a.handle(_event())
    assert len(s.outbox) == 2


def test_distinct_coach_or_defect_not_deduped():
    s = FakeSender()
    a = _alerter(s)
    a.handle(_event(coach="A", defect="crack"))
    a.handle(_event(coach="B", defect="crack"))
    a.handle(_event(coach="A", defect="rust"))
    assert len(s.outbox) == 3


def test_smtp_failure_retries_then_succeeds():
    s = FakeSender(fail_times=2)     # fail twice, succeed on 3rd
    a = _alerter(s, max_attempts=3)
    ok = a.handle(_event())
    assert ok is True
    assert s.calls == 3
    assert len(s.outbox) == 1


def test_smtp_exhausted_goes_to_dlq():
    s = FakeSender(fail_times=99)
    dlq = []
    a = _alerter(s, max_attempts=3, dlq=dlq)
    ok = a.handle(_event())
    assert ok is False
    assert len(dlq) == 1
    assert dlq[0]["event"]["coach_id"] == "LWSCN12345"


def test_alerting_never_imports_ai_modules():
    # decoupling guarantee: alert path must not IMPORT YOLO/OCR (scan import lines only)
    here = os.path.dirname(os.path.dirname(__file__))
    for fname in ("email_alert.py", "dedup.py"):
        for line in open(os.path.join(here, fname)):
            stripped = line.strip().lower()
            if stripped.startswith(("import ", "from ")):
                assert "yolo" not in stripped, f"{fname}: {line!r}"
                assert "ocr" not in stripped, f"{fname}: {line!r}"
