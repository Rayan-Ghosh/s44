"""
Tests for Strong Password Policy Requirements, Argon2id Password Storage & Verification.

Requirements validated:
1. Password strength rules (length >= 10, uppercase, lowercase, number, special char).
2. Modern Argon2id hashing with random per-record salt.
3. Password verification without plain text storage.
4. Correct 400 Bad Request responses on weak password registration.
5. Database stores only the Argon2id hash (never plaintext password).
6. Login verification succeeds with correct password.
7. Login verification securely fails (401) with incorrect password.
8. Existing accounts without password hashes continue to authenticate.
9. No password or hash is ever leaked in auth or profile API responses.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.security import hash_password, validate_password_strength, verify_password
from app.main import app
from app.models.user_contact_info import UserContactInfo

client = TestClient(app)


def test_password_strength_unit_rules():
    """Unit test individual password requirement checks."""
    # Too short (< 10 chars)
    is_valid, msg = validate_password_strength("Ab1!short")
    assert is_valid is False
    assert "at least 10 characters" in msg

    # Missing uppercase
    is_valid, msg = validate_password_strength("nouppercase123!@#")
    assert is_valid is False
    assert "uppercase" in msg

    # Missing lowercase
    is_valid, msg = validate_password_strength("NOLOWERCASE123!@#")
    assert is_valid is False
    assert "lowercase" in msg

    # Missing number
    is_valid, msg = validate_password_strength("NoNumbersHere!@#$")
    assert is_valid is False
    assert "number" in msg

    # Missing special character
    is_valid, msg = validate_password_strength("NoSpecialChars123")
    assert is_valid is False
    assert "special character" in msg

    # Valid strong password
    is_valid, msg = validate_password_strength("AvaranSecure2026!#")
    assert is_valid is True
    assert msg == ""


def test_argon2id_hashing_and_verification():
    """Test modern Argon2id hashing and verification."""
    pwd = "AvaranSecurePass123!"
    hashed = hash_password(pwd)
    assert hashed != pwd
    assert hashed.startswith("$argon2id$v=19$m=65536,t=2,p=4$")
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword123!", hashed) is False
    assert verify_password("", hashed) is False

    with pytest.raises(ValueError):
        hash_password("")


def test_signup_rejects_weak_passwords():
    """Ensure backend API rejects signup when password does not meet policy."""
    weak_passwords = [
        ("Short1!", "at least 10 characters"),
        ("lowercase123!@#$", "uppercase"),
        ("UPPERCASE123!@#$", "lowercase"),
        ("NoNumbersHere!@#$", "number"),
        ("NoSpecial123456", "special character"),
    ]

    for idx, (bad_pwd, expected_err) in enumerate(weak_passwords):
        res = client.post(
            "/api/v1/auth/signup",
            json={
                "fullName": f"Weak Password User {idx}",
                "mobileNumber": f"+91-98711-{idx:05d}",
                "email": f"weak{idx}@example.com",
                "password": bad_pwd,
            },
        )
        assert res.status_code == 400
        assert expected_err in res.json()["detail"].lower()


def test_signup_stores_argon2_hash_and_authenticates_correctly():
    """Ensure signup stores Argon2id hash in DB and login authenticates correctly."""
    mobile = "+91-98788-11111"
    password = "SuperStrongPass2026!"

    # 1. Signup
    signup_res = client.post(
        "/api/v1/auth/signup",
        json={
            "fullName": "Secure Store User",
            "mobileNumber": mobile,
            "email": "secure.store@example.com",
            "password": password,
        },
    )
    assert signup_res.status_code in (200, 201)
    signup_data = signup_res.json()
    assert signup_data["success"] is True
    user_id = signup_data["user"]["id"]

    # Verify no password or hash is exposed in signup response
    assert "password" not in signup_data
    assert "password_hash" not in signup_data
    assert "password" not in signup_data["user"]
    assert "password_hash" not in signup_data["user"]

    # 2. Check Database: Ensure stored value is an Argon2id hash, not plaintext password
    db: Session = SessionLocal()
    try:
        contact = db.query(UserContactInfo).filter(UserContactInfo.user_id == user_id).first()
        assert contact is not None
        assert contact.password_hash is not None
        assert contact.password_hash != password
        assert contact.password_hash.startswith("$argon2id$")
        assert password not in contact.password_hash
    finally:
        db.close()

    # 3. Verify OTP
    from app.services.otp_service import otp_delivery_provider
    dispatched_otp = otp_delivery_provider.get_last_otp_for_target(mobile)
    assert dispatched_otp is not None
    verify_res = client.post(
        "/api/v1/auth/verify-otp",
        json={"userId": user_id, "otp": dispatched_otp},
    )
    assert verify_res.status_code == 200

    # 4. Login with Correct Password -> 200 OK
    login_ok = client.post(
        "/api/v1/auth/login",
        json={"identifier": mobile, "password": password},
    )
    assert login_ok.status_code == 200
    login_data = login_ok.json()
    assert login_data["success"] is True
    assert "password" not in login_data
    assert "password_hash" not in login_data
    assert "password" not in login_data["user"]
    assert "password_hash" not in login_data["user"]

    # 4. Login with Incorrect Password -> 401 Unauthorized
    login_fail = client.post(
        "/api/v1/auth/login",
        json={"identifier": mobile, "password": "WrongPassword999!"},
    )
    assert login_fail.status_code == 401
    assert "Invalid email/mobile number or password" in login_fail.json()["detail"]

    # 5. User Profile GET Endpoint: Verify no password hash is exposed
    profile_res = client.get(f"/api/v1/users/{user_id}")
    assert profile_res.status_code == 200
    profile_data = profile_res.json()
    assert "password" not in profile_data
    assert "password_hash" not in profile_data


def test_existing_accounts_without_stored_hash_continue_to_work():
    """Verify legacy accounts created without a password hash can still log in."""
    mobile = "+91-98777-22222"
    db: Session = SessionLocal()
    try:
        from app.schemas.user import UserCreate
        from app.services import user_service
        user = user_service.create_user(
            db, UserCreate(name="Legacy User", phone_number=mobile), is_verified=True
        )
    finally:
        db.close()

    # Login should succeed and upgrade hash seamlessly
    login_res = client.post(
        "/api/v1/auth/login",
        json={"identifier": mobile, "password": "NewUpgradePass2026!"},
    )
    assert login_res.status_code == 200
    assert login_res.json()["success"] is True
