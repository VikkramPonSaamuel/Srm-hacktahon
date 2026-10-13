import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Dict, Optional

# Context variable to hold request_id across async contexts
request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)


class JSONFormatter(logging.Formatter):
    """Structured JSON formatter for production log ingestion."""

    def format(self, record: logging.LogRecord) -> str:
        log_record: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
        }

        # Inject request_id if available in context or record
        req_id = getattr(record, "request_id", None) or request_id_ctx.get()
        if req_id:
            log_record["request_id"] = req_id

        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)

        # Include custom extra fields if provided
        if hasattr(record, "extra_fields") and isinstance(record.extra_fields, dict):
            log_record.update(record.extra_fields)

        return json.dumps(log_record)


class ConsoleFormatter(logging.Formatter):
    """Readable console formatter for local development."""

    def format(self, record: logging.LogRecord) -> str:
        req_id = getattr(record, "request_id", None) or request_id_ctx.get()
        req_suffix = f" [{req_id}]" if req_id else ""
        time_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        msg = record.getMessage()
        base = f"{time_str} | {record.levelname:<8} | {record.name}{req_suffix} - {msg}"
        if record.exc_info:
            base += "\n" + self.formatException(record.exc_info)
        return base


def setup_logging(log_level: str = "INFO", log_format: str = "console") -> None:
    """Configure root logger with structured formatter and level."""
    level = getattr(logging, log_level.upper(), logging.INFO)

    formatter: logging.Formatter
    if log_format.lower() == "json":
        formatter = JSONFormatter()
    else:
        formatter = ConsoleFormatter()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Avoid adding duplicate handlers if setup_logging is called multiple times
    root_logger.handlers = [handler]

    # Adjust external libraries verbosity
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(level)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Retrieve logger instance with module name."""
    return logging.getLogger(name)
