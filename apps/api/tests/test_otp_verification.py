"""
Comprehensive Test Suite for Account Verification System using OTP.

Requirements validated:
1. Valid signup generates OTP record with pending status (is_verified = False).
2. Correct OTP verifies user, sets is_verified = True, and issues full session token.
3. Incorrect OTP is rejected with 400 and increments attempt counter.
4. Max 5 failed attempts locks out the OTP.
5. Expired OTP (> 5 minutes) is rejected.
6. Resend OTP within cooldown period is rejected with 429 Too Many Requests.
7. Resend OTP after cooldown creates new valid OTP and invalidates previous one.
8. Unverified users are rejected on login (403 Forbidden).
9. Verified users can log in normally (200 OK).
10. Masked contact format protects PII.
"""

from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.main import app
from app.models.otp_verification import OtpVerification
from app.models.user import User
from app.services.otp_service import generate_secure_otp, hash_otp, mask_contact, otp_delivery_provider, verify_otp

client = TestClient(app)


def test_otp_service_helpers():
    """Unit test OTP generation, hashing, verification, and masking."""
    otp = generate_secure_otp(6)
    assert len(otp) == 6
    assert otp.isdigit()

    otp_hash = hash_otp(otp)
    assert otp_hash != otp
    assert verify_otp(otp, otp_hash) is True
    assert verify_otp("000000", otp_hash) is False
    assert verify_otp("", otp_hash) is False

    # Masking tests
    assert mask_contact("+91 98765 43210") == "+91 ******3210"
    assert mask_contact("rahul.sharma@example.com") == "r***a@example.com"
    assert mask_contact("ab@example.com") == "a***@example.com"


def test_signup_otp_and_verification_flow():
    """End-to-end test of signup -> OTP sent -> verify -> authenticated."""
    mobile = "+91-98711-55555"
    password = "StrongPassword2026!"

    # 1. Signup initiation
    signup_res = client.post(
        "/api/v1/auth/signup",
        json={
            "fullName": "OTP Test User",
            "mobileNumber": mobile,
            "email": "otp.user@example.com",
            "password": password,
        },
    )
    assert signup_res.status_code == 201
    signup_data = signup_res.json()
    assert signup_data["success"] is True
    assert signup_data["pendingVerification"] is True
    user_id = signup_data["userId"]
    assert "maskedContact" in signup_data

    # Verify user is initially unverified in DB
    db: Session = SessionLocal()
    try:
        user = db.get(User, user_id)
        assert user is not None
        assert user.is_verified is False
    finally:
        db.close()

    # 2. Login before verification should be blocked (403 Forbidden)
    login_unverified = client.post(
        "/api/v1/auth/login",
        json={"identifier": mobile, "password": password},
    )
    assert login_unverified.status_code == 403
    assert "verification required" in login_unverified.json()["detail"].lower()

    # 3. Retrieve dispatched OTP from mock delivery provider
    dispatched_otp = otp_delivery_provider.get_last_otp_for_target(mobile)
    assert dispatched_otp is not None
    assert len(dispatched_otp) == 6

    # 4. Verify OTP with correct code
    verify_res = client.post(
        "/api/v1/auth/verify-otp",
        json={"userId": user_id, "otp": dispatched_otp},
    )
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert verify_data["success"] is True
    assert "token" in verify_data
    assert verify_data["user"]["id"] == user_id

    # Verify user is now verified in DB
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        assert user.is_verified is True
    finally:
        db.close()

    # 5. Subsequent login should succeed (200 OK)
    login_verified = client.post(
        "/api/v1/auth/login",
        json={"identifier": mobile, "password": password},
    )
    assert login_verified.status_code == 200
    assert login_verified.json()["success"] is True


def test_invalid_otp_and_max_attempts():
    """Test rejection of incorrect OTPs and attempt limit lockout."""
    mobile = "+91-98711-66666"
    password = "StrongPassword2026!"

    signup_res = client.post(
        "/api/v1/auth/signup",
        json={
            "fullName": "Attempt Limit User",
            "mobileNumber": mobile,
            "email": "attempts@example.com",
            "password": password,
        },
    )
    assert signup_res.status_code == 201
    user_id = signup_res.json()["userId"]

    # 4 incorrect attempts
    for _ in range(4):
        res = client.post(
            "/api/v1/auth/verify-otp",
            json={"userId": user_id, "otp": "000000"},
        )
        assert res.status_code == 400
        assert "invalid verification code" in res.json()["detail"].lower()

    # 5th incorrect attempt -> locks out
    res5 = client.post(
        "/api/v1/auth/verify-otp",
        json={"userId": user_id, "otp": "000000"},
    )
    assert res5.status_code == 400
    assert "maximum verification attempts exceeded" in res5.json()["detail"].lower()

    # Even if correct OTP is provided now, it must be rejected because max attempts exceeded
    correct_otp = otp_delivery_provider.get_last_otp_for_target(mobile)
    res_after = client.post(
        "/api/v1/auth/verify-otp",
        json={"userId": user_id, "otp": correct_otp},
    )
    assert res_after.status_code == 400
    assert "maximum verification attempts exceeded" in res_after.json()["detail"].lower()


def test_expired_otp_rejection():
    """Test that expired OTPs (> 5 minutes) are rejected."""
    mobile = "+91-98711-77777"
    password = "StrongPassword2026!"

    signup_res = client.post(
        "/api/v1/auth/signup",
        json={
            "fullName": "Expired OTP User",
            "mobileNumber": mobile,
            "email": "expired@example.com",
            "password": password,
        },
    )
    assert signup_res.status_code == 201
    user_id = signup_res.json()["userId"]
    correct_otp = otp_delivery_provider.get_last_otp_for_target(mobile)

    # Manually expire the OTP in the database
    db: Session = SessionLocal()
    try:
        record = db.query(OtpVerification).filter(OtpVerification.user_id == user_id).first()
        record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    finally:
        db.close()

    res = client.post(
        "/api/v1/auth/verify-otp",
        json={"userId": user_id, "otp": correct_otp},
    )
    assert res.status_code == 400
    assert "expired" in res.json()["detail"].lower()


def test_resend_otp_rate_limiting_and_invalidation():
    """Test OTP resend cooldown rate-limiting and invalidation of previous OTP."""
    mobile = "+91-98711-88888"
    password = "StrongPassword2026!"

    signup_res = client.post(
        "/api/v1/auth/signup",
        json={
            "fullName": "Resend OTP User",
            "mobileNumber": mobile,
            "email": "resend@example.com",
            "password": password,
        },
    )
    assert signup_res.status_code == 201
    user_id = signup_res.json()["userId"]
    first_otp = otp_delivery_provider.get_last_otp_for_target(mobile)

    # Immediate resend should be rate-limited (429 Too Many Requests)
    resend_fast = client.post(
        "/api/v1/auth/resend-otp",
        json={"userId": user_id},
    )
    assert resend_fast.status_code == 429
    assert "please wait" in resend_fast.json()["detail"].lower()

    # Fast-forward resend_available_at in DB
    db: Session = SessionLocal()
    try:
        record = db.query(OtpVerification).filter(OtpVerification.user_id == user_id).first()
        record.resend_available_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    finally:
        db.close()

    # Resend after cooldown
    resend_ok = client.post(
        "/api/v1/auth/resend-otp",
        json={"userId": user_id},
    )
    assert resend_ok.status_code == 200
    assert resend_ok.json()["success"] is True
    second_otp = otp_delivery_provider.get_last_otp_for_target(mobile)
    assert second_otp is not None

    # First OTP must be invalid now
    try_first = client.post(
        "/api/v1/auth/verify-otp",
        json={"userId": user_id, "otp": first_otp},
    )
    # If first_otp != second_otp, it should fail
    if first_otp != second_otp:
        assert try_first.status_code == 400

    # Second OTP should verify successfully
    verify_res = client.post(
        "/api/v1/auth/verify-otp",
        json={"userId": user_id, "otp": second_otp},
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["success"] is True
