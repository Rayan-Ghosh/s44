"""
Bootstrap scaffold tests.

Proves, per the MINIMAL DEVELOPMENT SCAFFOLD phase requirements:
1. the backend application starts (TestClient constructs the app),
2. the health endpoint responds successfully,
3. the app can connect to an isolated test database,
4. a basic database operation (write + read) succeeds.

Uses its own temporary SQLite file rather than the real Avaran.db, so
running tests never mutates a developer's local dev database.
"""

import os
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_ROOT))

TEST_DB_PATH = API_ROOT / "test_avaran.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.dev_check import DevCheck  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_test_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    # Release SQLite's open file handle before deleting it (required on
    # Windows, where a pooled connection otherwise keeps the file locked).
    engine.dispose()
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()


@pytest.fixture
def client():
    return TestClient(app)


def test_health_endpoint_responds(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["app"] == "S40 API"


def test_health_db_endpoint_connects(client):
    response = client.get("/health/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "connected"}


def test_database_write_and_read_round_trip():
    with SessionLocal() as db:
        db.add(DevCheck(message="test round trip"))
        db.commit()

        result = db.query(DevCheck).filter_by(message="test round trip").first()
        assert result is not None
        assert result.message == "test round trip"
        assert result.created_at is not None
