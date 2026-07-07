"""
Email Alert Service (D1).

Confirmed defects -> email to configured recipients, with:
  * dedup window (one email per defect per coach)
  * required fields (coach, defect class, score, station, time, evidence link)
  * SMTP retry with exponential backoff, then dead-letter

Decoupled from the AI pipeline: this module NEVER imports YOLO/OCR. It consumes
already-confirmed defect events from an injected source (DB poll / stream) and a
sink-style SMTP sender. Senders are injectable so dedup/template/retry logic is
unit-tested without a real mail server (the live tier uses MailHog).
"""
import logging

from dedup import DedupWindow

logger = logging.getLogger("alerting")


def render_email(event: dict) -> tuple[str, str]:
    """Return (subject, body). Raises KeyError if a required field is missing."""
    coach = event["coach_id"]
    defect = event["defect_class"]
    score = event["score"]
    station = event["station"]
    ts = event["timestamp"]
    link = event.get("evidence_url", "(no evidence link)")
    subject = f"[VandeInspect] {defect} on coach {coach}"
    body = (
        f"A defect was confirmed by VandeInspect AI.\n\n"
        f"Coach:      {coach}\n"
        f"Defect:     {defect}\n"
        f"Confidence: {score:.3f}\n"
        f"Station:    {station}\n"
        f"Time:       {ts}\n"
        f"Evidence:   {link}\n"
    )
    return subject, body


class SmtpSender:
    """Production SMTP sender (TLS). Lazy import of smtplib."""

    def __init__(self, host: str, port: int, user: str, password: str, sender: str):
        self.host, self.port, self.user, self.password, self.sender = host, port, user, password, sender

    def send(self, recipients: list[str], subject: str, body: str) -> None:
        import smtplib
        from email.mime.text import MIMEText
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = self.sender
        msg["To"] = ", ".join(recipients)
        with smtplib.SMTP(self.host, self.port, timeout=10) as s:
            s.starttls()
            if self.user:
                s.login(self.user, self.password)
            s.sendmail(self.sender, recipients, msg.as_string())


class EmailAlerter:
    def __init__(self, sender, recipients: list[str], dedup: DedupWindow, *,
                 clock, dlq=None, max_attempts: int = 3, backoff_base_s: float = 0.5, sleeper=None):
        self.sender = sender                 # object with .send(recipients, subject, body)
        self.recipients = recipients
        self.dedup = dedup
        self.clock = clock                   # () -> seconds
        self.dlq = dlq if dlq is not None else []   # list-like sink for failed events
        self.max_attempts = max_attempts
        self.backoff_base_s = backoff_base_s
        import time as _t
        self._sleep = sleeper or _t.sleep
        self.sent = 0
        self.suppressed = 0

    def handle(self, event: dict) -> bool:
        """Process one confirmed defect. Returns True if an email was sent."""
        now = self.clock()
        if not self.dedup.should_send(event["coach_id"], event["defect_class"], now):
            self.suppressed += 1
            return False
        subject, body = render_email(event)
        attempt = 0
        while True:
            try:
                self.sender.send(self.recipients, subject, body)
                self.sent += 1
                logger.info('{"event":"alert_email_sent","coach":"%s","defect":"%s"}',
                            event["coach_id"], event["defect_class"])
                return True
            except Exception as e:  # noqa: BLE001 - any SMTP failure is retried then dead-lettered
                attempt += 1
                if attempt >= self.max_attempts:
                    self.dlq.append({"event": event, "error": str(e)})
                    logger.error('{"event":"alert_email_dlq","coach":"%s","error":"%s"}',
                                 event["coach_id"], e)
                    return False
                self._sleep(self.backoff_base_s * (2 ** (attempt - 1)))
