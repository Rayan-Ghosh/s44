"""
Unit & Integration tests for Login Rate Limiting, Brute-Force Protection,
Anti-Enumeration Timing Safety, Progressive Lockout, and Endpoint Throttling.
"""

from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_identifier, hash_password
from app.main import app
from app.models.auth_rate_limit import AuthRateLimit
from app.models.user import User
from app.models.user_contact_info import UserContactInfo
from app.services.rate_limit_service import RateLimitService


@pytest.fixture
def client(db_session: Session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db_session: Session):
    phone = "+919876543210"
    user = User(
        name="Rate Limit Test User",
        phone_hash=hash_identifier(phone),
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    contact = UserContactInfo(
        user_id=user.id,
        phone_encrypted=phone,
        email_encrypted="ratelimit@avaran.ai",
        password_hash=hash_password("AvaranSecure@2026"),
    )
    db_session.add(contact)
    db_session.commit()
    return user


def test_invalid_login_returns_anti_enumeration_error(client: TestClient, test_user: User):
    # 1. Existing user with wrong password
    resp1 = client.post(
        "/api/v1/auth/login",
        json={"identifier": "+919876543210", "password": "WrongPassword@123"},
    )
    assert resp1.status_code == 401
    assert resp1.json()["detail"] == "Invalid email/mobile number or password."

    # 2. Nonexistent user with random password
    resp2 = client.post(
        "/api/v1/auth/login",
        json={"identifier": "+919999999999", "password": "WrongPassword@123"},
    )
    assert resp2.status_code == 401
    assert resp2.json()["detail"] == "Invalid email/mobile number or password."


def test_repeated_failed_logins_trigger_rate_limiting(client: TestClient, test_user: User, db_session: Session):
    # Perform 5 failed attempts
    for i in range(5):
        resp = client.post(
            "/api/v1/auth/login",
            json={"identifier": "+919876543210", "password": "BadPassword123!"},
        )
        assert resp.status_code == 401

    # 6th attempt should be blocked with 429 Too Many Requests
    blocked_resp = client.post(
        "/api/v1/auth/login",
        json={"identifier": "+919876543210", "password": "AvaranSecure@2026"},
    )
    assert blocked_resp.status_code == 429
    assert "Too many failed login attempts" in blocked_resp.json()["detail"]
    assert "Retry-After" in blocked_resp.headers


def test_successful_login_resets_account_failure_counter(client: TestClient, test_user: User, db_session: Session):
    # 3 failed attempts
    for _ in range(3):
        client.post(
            "/api/v1/auth/login",
            json={"identifier": "+919876543210", "password": "BadPassword123!"},
        )

    acct_hash = hash_identifier("+919876543210")
    record = db_session.query(AuthRateLimit).filter_by(key_hash=acct_hash, key_type="ACCOUNT").first()
    assert record is not None
    assert record.failed_attempts == 3

    # Successful login
    succ_resp = client.post(
        "/api/v1/auth/login",
        json={"identifier": "+919876543210", "password": "AvaranSecure@2026"},
    )
    assert succ_resp.status_code == 200

    # Account counter reset back to 0
    db_session.refresh(record)
    assert record.failed_attempts == 0
    assert record.locked_until is None


def test_lockout_expiry_restores_login_ability(client: TestClient, test_user: User, db_session: Session):
    # Lock the account
    for _ in range(5):
        client.post(
            "/api/v1/auth/login",
            json={"identifier": "+919876543210", "password": "BadPassword123!"},
        )

    acct_hash = hash_identifier("+919876543210")
    record = db_session.query(AuthRateLimit).filter_by(key_hash=acct_hash, key_type="ACCOUNT").first()
    assert record.locked_until is not None

    # Simulate lockout expiration by moving locked_until to the past
    record.locked_until = datetime.now(timezone.utc) - timedelta(seconds=10)
    db_session.commit()

    # Now login with correct password succeeds
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"identifier": "+919876543210", "password": "AvaranSecure@2026"},
    )
    assert login_resp.status_code == 200


def test_progressive_lockout_multiplier(db_session: Session):
    # 1st lockout
    for _ in range(5):
        is_locked, duration = RateLimitService.record_login_failure(db_session, "+919111111111", "10.0.0.1")
    assert is_locked is True
    assert duration == settings.auth_base_lockout_seconds

    # Simulate 2nd lockout after expiration
    acct_hash = hash_identifier("+919111111111")
    record = db_session.query(AuthRateLimit).filter_by(key_hash=acct_hash, key_type="ACCOUNT").first()
    record.locked_until = None
    record.first_seen_at = datetime.now(timezone.utc)
    db_session.commit()

    for _ in range(5):
        is_locked2, duration2 = RateLimitService.record_login_failure(db_session, "+919111111111", "10.0.0.1")
    assert is_locked2 is True
    assert duration2 == settings.auth_base_lockout_seconds * settings.auth_progressive_lockout_multiplier


def test_endpoint_request_rate_limiting(client: TestClient, db_session: Session):
    # Test signup rate limiting (max 10 / hour)
    for i in range(10):
        allowed, _, _ = RateLimitService.check_and_record_endpoint_rate_limit(
            db_session, "signup", "192.168.1.50", max_requests=10, window_seconds=3600
        )
        assert allowed is True

    # 11th request exceeds limit
    allowed_11, retry_sec, msg = RateLimitService.check_and_record_endpoint_rate_limit(
        db_session, "signup", "192.168.1.50", max_requests=10, window_seconds=3600
    )
    assert allowed_11 is False
    assert retry_sec > 0
    assert "Rate limit exceeded" in msg
