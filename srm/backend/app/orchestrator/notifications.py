from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from app.core.logging import get_logger

logger = get_logger("app.orchestrator.notifications")


class MockSlackAdapter:
    """Mock Slack notification adapter for development and testing."""

    _messages: List[Dict[str, Any]] = []

    @classmethod
    def send_message(
        cls,
        channel: str,
        title: str,
        fields: Dict[str, Any],
        severity: str = "info",
    ) -> Dict[str, Any]:
        record = {
            "platform": "slack",
            "channel": channel,
            "title": title,
            "fields": fields,
            "severity": severity,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "delivered",
        }
        cls._messages.append(record)
        logger.info(f"[MockSlack] #{channel} [{severity.upper()}]: {title} | {fields}")
        return record

    @classmethod
    def get_messages(cls) -> List[Dict[str, Any]]:
        return list(cls._messages)

    @classmethod
    def reset(cls) -> None:
        cls._messages.clear()


class MockEmailAdapter:
    """Mock Email notification adapter for development and testing."""

    _emails: List[Dict[str, Any]] = []

    @classmethod
    def send_email(
        cls,
        recipient: str,
        subject: str,
        body: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        record = {
            "platform": "email",
            "recipient": recipient,
            "subject": subject,
            "body": body,
            "metadata": metadata or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "delivered",
        }
        cls._emails.append(record)
        logger.info(f"[MockEmail] To: {recipient} | Subject: {subject}")
        return record

    @classmethod
    def get_emails(cls) -> List[Dict[str, Any]]:
        return list(cls._emails)

    @classmethod
    def reset(cls) -> None:
        cls._emails.clear()
