"""
Comprehensive automated tests for Secure Password Reset, Account Recovery,
Anti-Enumeration Timing Safety, OTP Purpose Separation, Single-Use Reset Tokens,
Session Revocation, and Trusted Device Preservation.
"""

from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_identifier, hash_password
from app.services.otp_service import hash_otp
from app.main import app
from app.models.otp_verification import OtpVerification
from app.models.password_reset_authorization import PasswordResetAuthorization
from app.models.user import User
from app.models.user_contact_info import UserContactInfo
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
def registered_user(db_session: Session):
    phone = "+919876543210"
    user = User(
        name="Reset Test User",
        phone_hash=hash_identifier(phone),
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    contact = UserContactInfo(
        user_id=user.id,
        phone_encrypted=phone,
        email_encrypted="reset_user@avaran.ai",
        password_hash=hash_password("OldStrongPassword@123"),
    )
    db_session.add(contact)
    db_session.commit()
    return user


def test_request_password_reset_anti_enumeration(client: TestClient, registered_user: User):
    # 1. Registered account
    resp_reg = client.post(
        "/api/v1/auth/request-password-reset",
        json={"identifier": "+919876543210"},
    )
    assert resp_reg.status_code == 200
    data_reg = resp_reg.json()
    assert data_reg["success"] is True
    assert "If an account exists for this information" in data_reg["message"]

    # 2. Unregistered account
    resp_unreg = client.post(
        "/api/v1/auth/request-password-reset",
        json={"identifier": "+919999999999"},
    )
    assert resp_unreg.status_code == 200
    data_unreg = resp_unreg.json()
    assert data_unreg["success"] is True
    assert data_unreg["message"] == data_reg["message"]


def test_otp_purpose_separation(client: TestClient, registered_user: User, db_session: Session):
    # Create an OTP with purpose="ACCOUNT_VERIFICATION"
    plain_otp = "123456"
    now = datetime.now(timezone.utc)
    signup_otp = OtpVerification(
        user_id=registered_user.id,
        otp_hash=hash_otp(plain_otp),
        purpose="ACCOUNT_VERIFICATION",
        contact_target="+919876543210",
        attempts=0,
        max_attempts=5,
        expires_at=now + timedelta(minutes=5),
        resend_available_at=now + timedelta(seconds=30),
        is_used=False,
    )
    db_session.add(signup_otp)
    db_session.commit()

    # Attempting to use ACCOUNT_VERIFICATION OTP on password reset verify must fail
    resp = client.post(
        "/api/v1/auth/verify-password-reset-otp",
        json={"identifier": "+919876543210", "otp": plain_otp},
    )
    assert resp.status_code == 400
    assert "No active password recovery code found" in resp.json()["detail"]


def test_full_password_reset_flow_and_session_invalidation(
    client: TestClient, registered_user: User, db_session: Session
):
    # 1. Login and establish an initial active session
    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": "+919876543210",
            "password": "OldStrongPassword@123",
            "deviceId": "device-primary-1",
        },
    )
    assert login_resp.status_code == 200
    old_session_token = login_resp.json()["token"]

    # Validate that the initial session is currently valid
    val_resp = client.get(
        "/api/v1/auth/validate-session",
        headers={"Authorization": f"Bearer {old_session_token}", "X-Device-Id": "device-primary-1"},
    )
    assert val_resp.status_code == 200

    # 2. Request password reset
    req_resp = client.post(
        "/api/v1/auth/request-password-reset",
        json={"identifier": "+919876543210"},
    )
    assert req_resp.status_code == 200

    # Retrieve the generated OTP from DB
    otp_record = (
        db_session.query(OtpVerification)
        .filter_by(user_id=registered_user.id, purpose="PASSWORD_RESET", is_used=False)
        .first()
    )
    assert otp_record is not None

    # In dev mode, devTestCode is returned
    dev_code = req_resp.json().get("devTestCode")

    # 3. Verify Password Reset OTP
    verify_resp = client.post(
        "/api/v1/auth/verify-password-reset-otp",
        json={"identifier": "+919876543210", "otp": dev_code},
    )
    assert verify_resp.status_code == 200
    reset_token = verify_resp.json()["resetToken"]
    assert reset_token.startswith("pwd_reset_auth_")

    # 4. Reject weak password (fails complexity requirements)
    weak_resp = client.post(
        "/api/v1/auth/reset-password",
        json={"resetToken": reset_token, "newPassword": "weakpassword123"},
    )
    assert weak_resp.status_code == 400

    # 5. Successfully reset with strong password
    new_password = "NewSuperSecure@2026"
    reset_resp = client.post(
        "/api/v1/auth/reset-password",
        json={"resetToken": reset_token, "newPassword": new_password},
    )
    assert reset_resp.status_code == 200
    assert reset_resp.json()["success"] is True

    # 6. Replay attack: Token cannot be used again
    replay_resp = client.post(
        "/api/v1/auth/reset-password",
        json={"resetToken": reset_token, "newPassword": "AnotherPassword@2026"},
    )
    assert replay_resp.status_code == 400
    assert "already been used" in replay_resp.json()["detail"]

    # 7. Old session token must now be REVOKED (HTTP 401)
    stale_val_resp = client.get(
        "/api/v1/auth/validate-session",
        headers={"Authorization": f"Bearer {old_session_token}", "X-Device-Id": "device-primary-1"},
    )
    assert stale_val_resp.status_code == 401

    # 8. Old password no longer works
    old_login = client.post(
        "/api/v1/auth/login",
        json={"identifier": "+919876543210", "password": "OldStrongPassword@123"},
    )
    assert old_login.status_code == 401

    # 9. New password works from the trusted device
    new_login = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": "+919876543210",
            "password": new_password,
            "deviceId": "device-primary-1",
        },
    )
    assert new_login.status_code == 200

    # 10. Single trusted device is preserved: login from a DIFFERENT device requires transfer
    diff_device_login = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": "+919876543210",
            "password": new_password,
            "deviceId": "device-intruder-99",
        },
    )
    assert diff_device_login.status_code == 409
    assert diff_device_login.json()["detail"]["requiresDeviceTransfer"] is True
