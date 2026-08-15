"""
Shared test fixtures.

Uses a dedicated temp SQLite file (never Avaran.db) so the test suite can
never corrupt a developer's local dev database. The DATABASE_URL env var
is set here, at module import time, before any `app.*` module is imported
by any test file — pytest collects conftest.py before test_*.py files in
the same directory, so this ordering is guaranteed.

Schema is created directly via Base.metadata.create_all()/drop_all() per
test function, not via Alembic — that keeps the test suite fast and fully
isolated from migration file state. Alembic itself is verified separately
(see test_migrations.py), which is the more meaningful check for "does the
migration work," since the app never runs migrations against a database it
also created via create_all().
"""

import os
import sys
import tempfile
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_ROOT))

_fd, _TEST_DB_PATH = tempfile.mkstemp(suffix=".db", prefix="s40_test_")
os.close(_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401  (registers all model metadata)
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    return TestClient(fastapi_app)


def pytest_sessionfinish(session, exitstatus):
    engine.dispose()
    try:
        os.remove(_TEST_DB_PATH)
    except OSError:
        pass
