import time
from typing import Any, Dict, Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("app.db.session")

database_uri = settings.SQLALCHEMY_DATABASE_URI

engine_kwargs: Dict[str, Any] = {}

if database_uri.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_size"] = settings.DATABASE_POOL_SIZE
    engine_kwargs["max_overflow"] = settings.DATABASE_MAX_OVERFLOW
    engine_kwargs["pool_timeout"] = settings.DATABASE_POOL_TIMEOUT

engine = create_engine(database_uri, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Dependency that yields an active database session and ensures proper cleanup."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connectivity(db_session: Session) -> Dict[str, Any]:
    """Execute a lightweight probe query to verify database connectivity and measure latency."""
    start_time = time.perf_counter()
    try:
        db_session.execute(text("SELECT 1"))
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return {
            "is_connected": True,
            "latency_ms": latency_ms,
            "error_message": None,
        }
    except Exception as exc:
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.warning(f"Database health probe failed: {exc}")
        return {
            "is_connected": False,
            "latency_ms": latency_ms,
            "error_message": str(exc),
        }
