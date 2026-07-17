from unittest.mock import MagicMock, patch
from app.core.email import send_email


def test_send_email_returns_false_when_smtp_host_not_configured():
    with patch("app.core.email.settings") as mock_settings:
        mock_settings.smtp_host = ""
        result = send_email("user@example.com", "Subject", "<p>Body</p>")
    assert result is False


def test_send_email_returns_true_on_successful_send():
    with patch("app.core.email.settings") as mock_settings:
        mock_settings.smtp_host = "smtp.example.com"
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = "bot@example.com"
        mock_settings.smtp_password = "secret"
        with patch("app.core.email.smtplib.SMTP") as MockSMTP:
            server = MockSMTP.return_value.__enter__.return_value
            result = send_email("user@example.com", "Subject", "<p>Body</p>")
    assert result is True
    server.starttls.assert_called_once()
    server.login.assert_called_once_with("bot@example.com", "secret")
    server.sendmail.assert_called_once()


def test_send_email_returns_false_on_smtp_exception():
    with patch("app.core.email.settings") as mock_settings:
        mock_settings.smtp_host = "smtp.example.com"
        mock_settings.smtp_port = 587
        mock_settings.smtp_user = ""
        mock_settings.smtp_password = ""
        with patch("app.core.email.smtplib.SMTP", side_effect=OSError("unreachable")):
            result = send_email("user@example.com", "Subject", "<p>Body</p>")
    assert result is False
