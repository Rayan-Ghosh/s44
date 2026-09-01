"""
Unit & Integration tests for Secure Session Management, Token Hashing,
Single-Device Binding, Inactivity Expiration, and Device Transfer.
"""

from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_identifier, hash_password
from app.main import app
from app.models.trusted_device_binding import TrustedDeviceBinding
from app.models.user import User
from app.models.user_contact_info import UserContactInfo
from app.models.user_session import UserSession
from app.services.session_service import SessionService


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
        name="Device Test User",
        phone_hash=hash_identifier(phone),
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    contact = UserContactInfo(
        user_id=user.id,
        phone_encrypted=phone,
        email_encrypted="devicetest@avaran.ai",
        password_hash=hash_password("AvaranSecure@2026"),
    )
    db_session.add(contact)
    db_session.commit()
    return user


def test_first_device_login_registers_and_creates_hashed_session(client: TestClient, test_user: User, db_session: Session):
    # 1. Login from Device A
    resp = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": "+919876543210",
            "password": "AvaranSecure@2026",
            "deviceId": "device-uuid-aaaa",
            "deviceName": "Pixel 8 Pro",
            "deviceType": "Android 15",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    token = data["token"]
    assert token.startswith("usr_sess_")

    # Verify device binding in database
    binding = db_session.query(TrustedDeviceBinding).filter_by(user_id=test_user.id, is_active=True).first()
    assert binding is not None
    assert binding.device_hash == hash_identifier("device-uuid-aaaa")

    # Verify session in database (raw token is NOT stored; only hash)
    token_hash = hash_identifier(token)
    session = db_session.query(UserSession).filter_by(token_hash=token_hash).first()
    assert session is not None
    assert session.user_id == test_user.id
    assert session.is_revoked is False
    assert session.device_hash == hash_identifier("device-uuid-aaaa")

    # 2. Validate session endpoint
    val_resp = client.get(
        "/api/v1/auth/validate-session",
        headers={"Authorization": f"Bearer {token}", "X-Device-Id": "device-uuid-aaaa"},
    )
    assert val_resp.status_code == 200
    assert val_resp.json()["valid"] is True


def test_second_device_login_is_blocked_with_conflict(client: TestClient, test_user: User):
    # 1. Device A is already bound
    client.post(
        "/api/v1/auth/login",
        json={
            "identifier": "+919876543210",
            "password": "AvaranSecure@2026",
            "deviceId": "device-uuid-aaaa",
        },
    )

    # 2. Attempt login from Device B
    resp_b = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": "+919876543210",
            "password": "AvaranSecure@2026",
            "deviceId": "device-uuid-bbbb",
        },
    )
    assert resp_b.status_code == 409
    detail = resp_b.json()["detail"]
    assert detail["requiresDeviceTransfer"] is True
    assert "secured to another device" in detail["message"]


def test_device_transfer_flow_revokes_old_sessions_and_binds_new_device(
    client: TestClient, test_user: User, db_session: Session
):
    # 1. Device A logs in
    resp_a = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": "+919876543210",
            "password": "AvaranSecure@2026",
            "deviceId": "device-uuid-aaaa",
        },
    )
    token_a = resp_a.json()["token"]

    # 2. Device B requests transfer
    req_resp = client.post(
        "/api/v1/auth/request-device-transfer",
        json={
            "userId": test_user.id,
            "password": "AvaranSecure@2026",
            "deviceId": "device-uuid-bbbb",
            "deviceName": "iPhone 16 Pro",
            "deviceType": "iOS 18",
        },
    )
    assert req_resp.status_code == 200
    req_data = req_resp.json()
    transfer_code = req_data["devTestCode"]
    assert transfer_code is not None

    # 3. Device B verifies transfer code
    verify_resp = client.post(
        "/api/v1/auth/verify-device-transfer",
        json={
            "userId": test_user.id,
            "otp": transfer_code,
            "deviceId": "device-uuid-bbbb",
            "deviceName": "iPhone 16 Pro",
            "deviceType": "iOS 18",
        },
    )
    assert verify_resp.status_code == 200
    token_b = verify_resp.json()["token"]
    assert token_b.startswith("usr_sess_")

    # 4. Verify old session (Device A) is revoked and cannot access validate-session
    val_a = client.get(
        "/api/v1/auth/validate-session",
        headers={"Authorization": f"Bearer {token_a}", "X-Device-Id": "device-uuid-aaaa"},
    )
    assert val_a.status_code == 401

    # 5. Verify new session (Device B) is active
    val_b = client.get(
        "/api/v1/auth/validate-session",
        headers={"Authorization": f"Bearer {token_b}", "X-Device-Id": "device-uuid-bbbb"},
    )
    assert val_b.status_code == 200

    # 6. Verify single trusted device binding now points to Device B
    binding = db_session.query(TrustedDeviceBinding).filter_by(user_id=test_user.id).first()
    assert binding.device_hash == hash_identifier("device-uuid-bbbb")


def test_logout_revokes_server_side_session(client: TestClient, test_user: User, db_session: Session):
    # 1. Login
    resp = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": "+919876543210",
            "password": "AvaranSecure@2026",
            "deviceId": "device-uuid-aaaa",
        },
    )
    token = resp.json()["token"]

    # 2. Call Logout
    logout_resp = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert logout_resp.status_code == 200

    # 3. Database session is revoked
    session = db_session.query(UserSession).filter_by(token_hash=hash_identifier(token)).first()
    assert session.is_revoked is True
    assert session.revoked_at is not None

    # 4. Subsequent validate-session fails
    val_resp = client.get(
        "/api/v1/auth/validate-session",
        headers={"Authorization": f"Bearer {token}", "X-Device-Id": "device-uuid-aaaa"},
    )
    assert val_resp.status_code == 401


def test_inactivity_and_absolute_session_expiration(db_session: Session, test_user: User):
    # 1. Create session with expired absolute date
    raw_token, session = SessionService.create_session(
        db=db_session,
        user_id=test_user.id,
        device_id="device-uuid-aaaa",
    )
    session.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    is_valid, _, err = SessionService.validate_session_token(
        db=db_session, raw_token=raw_token, device_id="device-uuid-aaaa"
    )
    assert is_valid is False
    assert "expired" in err.lower()

    # 2. Create session with inactive last_activity_at
    raw_token2, session2 = SessionService.create_session(
        db=db_session,
        user_id=test_user.id,
        device_id="device-uuid-aaaa",
    )
    session2.last_activity_at = datetime.now(timezone.utc) - timedelta(hours=settings.session_inactivity_expiry_hours + 1)
    db_session.commit()

    is_valid2, _, err2 = SessionService.validate_session_token(
        db=db_session, raw_token=raw_token2, device_id="device-uuid-aaaa"
    )
    assert is_valid2 is False
    assert "inactivity" in err2.lower()


def test_device_header_mismatch_rejected(client: TestClient, test_user: User):
    resp = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": "+919876543210",
            "password": "AvaranSecure@2026",
            "deviceId": "device-uuid-legit",
        },
    )
    token = resp.json()["token"]

    # Spoofed header attempting to use valid token from different device
    val_resp = client.get(
        "/api/v1/auth/validate-session",
        headers={"Authorization": f"Bearer {token}", "X-Device-Id": "device-uuid-attacker"},
    )
    assert val_resp.status_code == 401
    assert "not authorized" in val_resp.json()["detail"].lower()


def test_production_transfer_safety_blocks_mock_without_live_provider(client: TestClient, test_user: User, monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    resp = client.post(
        "/api/v1/auth/request-device-transfer",
        json={
            "userId": test_user.id,
            "deviceId": "device-uuid-new",
        },
    )
    assert resp.status_code == 503
    assert "live sms" in resp.json()["detail"].lower()

