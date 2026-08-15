"""
Verifies `alembic upgrade head` actually creates the expected schema
against a genuinely fresh SQLite database — independent of the
create_all()-based schema conftest.py uses for the rest of the suite.

This is the real "does the migration work" check: the app's own
Base.metadata.create_all() would trivially match app.models regardless of
whether the migration file is broken, so it can't catch a bad migration by
itself.
"""

import tempfile
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

API_ROOT = Path(__file__).resolve().parent.parent

EXPECTED_TABLES = {
    "users",
    "devices",
    "recipients",
    "transactions",
    "risk_scores",
    "risk_factors",
    "voice_analysis",
    "alerts",
    "user_feedback",
    "fraud_cases",
    "model_predictions",
    "audit_logs",
}


def test_alembic_upgrade_head_creates_expected_schema():
    fd, db_path = tempfile.mkstemp(suffix=".db", prefix="s40_migration_test_")
    import os

    os.close(fd)
    os.remove(db_path)  # alembic/sqlite will create it fresh
    db_url = f"sqlite:///{db_path}"

    try:
        alembic_cfg = Config(str(API_ROOT / "alembic.ini"))
        alembic_cfg.set_main_option("script_location", str(API_ROOT / "alembic"))
        alembic_cfg.set_main_option("sqlalchemy.url", db_url)

        command.upgrade(alembic_cfg, "head")

        engine = create_engine(db_url)
        try:
            tables = set(inspect(engine).get_table_names())
        finally:
            engine.dispose()

        assert EXPECTED_TABLES.issubset(tables)
    finally:
        if os.path.exists(db_path):
            os.remove(db_path)
