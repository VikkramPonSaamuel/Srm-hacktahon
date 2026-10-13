"""Standalone script to seed demonstration reliability data for local dashboard exploration.

Strictly prohibited in production environments.
"""

import sys
from app.core.config import settings
from app.core.logging import get_logger, setup_logging
from app.db.base import Base
from app.db.session import SessionLocal, engine
import app.models.execution  # noqa: F401
import app.models.health  # noqa: F401
import app.models.incident  # noqa: F401
import app.models.journey  # noqa: F401
import app.models.pattern  # noqa: F401
import app.models.playbook  # noqa: F401
from app.services.dashboard_service import DashboardService

setup_logging(log_level="INFO", log_format="console")
logger = get_logger("app.scripts.seed_dashboard")


def main() -> None:
    if settings.ENVIRONMENT.lower() == "production":
        logger.error("Demo data seeding is strictly prohibited in production environment!")
        sys.exit(1)

    logger.info("Ensuring database tables exist...")
    Base.metadata.create_all(bind=engine)

    logger.info("Initializing database session for dashboard seeding...")
    db = SessionLocal()
    try:
        service = DashboardService(db)
        res = service.seed_demo_dashboard_data()
        logger.info(f"Dashboard seeding completed successfully: {res.message}")
        logger.info(
            f"Created {res.journeys_created} journeys, {res.executions_created} executions, "
            f"{res.incidents_created} incidents, {res.patterns_created} patterns, "
            f"{res.playbooks_created} playbooks, {res.health_snapshots_created} service health snapshots."
        )
    except Exception as e:
        logger.error(f"Failed to seed demo dashboard data: {e}", exc_info=True)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
