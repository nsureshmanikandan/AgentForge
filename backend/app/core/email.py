import smtplib
import logging
from email.mime.text import MIMEText
from app.config import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, html_body: str) -> bool:
    """Send an HTML email via SMTP. Returns False (never raises) on any failure."""
    if not settings.smtp_host:
        logger.warning("SMTP not configured -- email not sent: %s", subject)
        return False
    msg = MIMEText(html_body, "html")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_user or "noreply@agentforge.local"
    msg["To"] = to
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port or 587) as server:
            server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(msg["From"], [to], msg.as_string())
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False
