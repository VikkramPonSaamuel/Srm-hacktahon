import os
import tempfile
from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_alembic_migrations_from_clean_database() -> None:
    """Verifies that all Alembic migrations execute cleanly from scratch

    against a completely clean database up to head, and tests step downgrade/upgrade.
    """
    backend_dir = Path(__file__).resolve().parent.parent
    alembic_ini_path = backend_dir / "alembic.ini"
    alembic_dir = backend_dir / "alembic"

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_db:
        tmp_db_path = tmp_db.name

    old_db_url = os.environ.get("DATABASE_URL")
    try:
        clean_db_url = f"sqlite:///{tmp_db_path.replace(os.sep, '/')}"
        os.environ["DATABASE_URL"] = clean_db_url

        cfg = Config(str(alembic_ini_path))
        cfg.set_main_option("script_location", str(alembic_dir))
        cfg.set_main_option("sqlalchemy.url", clean_db_url)

        # 1. Upgrade from clean database to head
        command.upgrade(cfg, "head")

        # 2. Inspect created schema
        engine = create_engine(clean_db_url)
        inspector = inspect(engine)
        table_names = inspector.get_table_names()

        # Expected core tables across all modules
        expected_tables = {
            "incidents",
            "incident_events",
            "business_journeys",
            "journey_steps",
            "journey_executions",
            "step_executions",
            "service_health_snapshots",
            "failure_patterns",
            "pattern_matches",
            "recovery_playbooks",
            "recovery_actions",
            "recovery_executions",
            "incident_investigations",
            "brand_profiles",
            "official_domains",
            "brand_assets",
            "detected_impersonations",
            "cyber_complaints",
            "security_events",
            "detected_website_threats",
        }

        for table in expected_tables:
            assert table in table_names, f"Table '{table}' should be created by Alembic migrations."

        # Check key unique constraints / indexes
        incident_indexes = [idx["name"] for idx in inspector.get_indexes("incidents")]
        assert any("incident_id" in idx for idx in incident_indexes)

        # 3. Test migration step: downgrade 1 revision and upgrade back to head
        command.downgrade(cfg, "-1")
        # After downgrading 1 revision (website threat detection tables), table should not be present
        inspector_downgraded = inspect(engine)
        assert "detected_website_threats" not in inspector_downgraded.get_table_names()

        # Re-upgrade to head
        command.upgrade(cfg, "head")
        inspector_reupgraded = inspect(engine)
        assert "detected_website_threats" in inspector_reupgraded.get_table_names()

    finally:
        if 'engine' in locals():
            engine.dispose()
        if old_db_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = old_db_url
        if os.path.exists(tmp_db_path):
            try:
                os.remove(tmp_db_path)
            except OSError:
                pass
