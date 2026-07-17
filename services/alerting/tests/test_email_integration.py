"""
D1 integration tier — sends a real email through MailHog and asserts it was
captured. Needs MailHog (compose). Run:

    docker compose -f docker-compose.test.yml up -d mailhog
    pytest -m integration services/alerting/tests/test_email_integration.py
"""
import os
import pytest

pytestmark = pytest.mark.integration

SMTP_HOST = os.environ.get("ALERT_SMTP_HOST", "127.0.0.1")
SMTP_PORT = int(os.environ.get("ALERT_SMTP_PORT", "1025"))
MAILHOG_API = os.environ.get("MAILHOG_API", "http://127.0.0.1:8025")


def _starttls_ok():
    import smtplib
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=3):
            return True
    except Exception:
        return False


def test_email_delivered_to_mailhog():
    requests = pytest.importorskip("requests")
    if not _starttls_ok():
        pytest.skip("MailHog SMTP not reachable")

    import sys
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from email_alert import EmailAlerter, SmtpSender
    from dedup import DedupWindow

    # MailHog does not require STARTTLS; SmtpSender calls starttls() which MailHog accepts.
    sender = SmtpSender(SMTP_HOST, SMTP_PORT, "", "", "alerts@vandeinspect.local")
    a = EmailAlerter(sender, ["ops@railway.local"], DedupWindow(60), clock=lambda: 0.0)
    a.handle({"coach_id": "LWSCN99999", "defect_class": "crack", "score": 0.97,
              "station": "Pune", "timestamp": "2026-06-28T10:00:00Z",
              "evidence_url": "http://host/e.jpg"})

    msgs = requests.get(f"{MAILHOG_API}/api/v2/messages", timeout=5).json()
    subjects = [m["Content"]["Headers"]["Subject"][0] for m in msgs.get("items", [])]
    assert any("LWSCN99999" in s for s in subjects)
