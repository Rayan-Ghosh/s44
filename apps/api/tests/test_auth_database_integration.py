"""
Tests for database authentication, password hashing, JWT tokens, session lifecycle, and lockout defense.
Spec: DATABASE_INTEGRATION_REQUIREMENTS.md §4, §5, §7.
"""

from app.core.security import verify_password, decode_access_token
from app.models.user_credentials import UserCredentials
from app.models.user_session import UserSession


def test_signup_creates_credentials_and_issues_valid_jwt(client, db_session):
    payload = {
        "fullName": "Aarav Gupta",
        "mobileNumber": "+91-98765-43210",
        "email": "aarav.gupta@example.com",
        "password": "SecurePassword123!",
    }
    response = client.post("/api/v1/auth/signup", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert "token" in data
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["name"] == "Aarav Gupta"

    # Verify password was stored hashed, never in plaintext
    user_id = data["user"]["id"]
    creds = db_session.query(UserCredentials).filter(UserCredentials.user_id == user_id).first()
    assert creds is not None
    assert creds.password_hash != "SecurePassword123!"
    assert verify_password("SecurePassword123!", creds.password_hash) is True

    # Verify JWT claims
    claims = decode_access_token(data["access_token"])
    assert claims["sub"] == str(user_id)
    assert claims["name"] == "Aarav Gupta"


def test_login_with_valid_password(client):
    # Signup first
    signup_payload = {
        "fullName": "Meera Patel",
        "mobileNumber": "+91-98111-22233",
        "password": "MySecretPassword99",
    }
    client.post("/api/v1/auth/signup", json=signup_payload)

    # Login
    login_response = client.post(
        "/api/v1/auth/login",
        json={"identifier": "+91-98111-22233", "password": "MySecretPassword99"},
    )
    assert login_response.status_code == 200
    data = login_response.json()
    assert data["success"] is True
    assert data["access_token"] is not None
    assert data["refresh_token"] is not None
    assert data["user"]["name"] == "Meera Patel"


def test_login_with_invalid_password_tracks_failed_attempts(client, db_session):
    client.post(
        "/api/v1/auth/signup",
        json={
            "fullName": "Devraj Sen",
            "mobileNumber": "+91-98222-33344",
            "password": "CorrectPassword123",
        },
    )

    bad_login = client.post(
        "/api/v1/auth/login",
        json={"identifier": "+91-98222-33344", "password": "WrongPassword!"},
    )
    assert bad_login.status_code == 401
    assert "Invalid credentials" in bad_login.json()["detail"]


def test_account_lockout_after_consecutive_failed_attempts(client):
    phone = "+91-98333-44455"
    client.post(
        "/api/v1/auth/signup",
        json={
            "fullName": "Lockout User",
            "mobileNumber": phone,
            "password": "TargetPassword123",
        },
    )

    # Attempt 5 failed logins to trigger lockout
    for i in range(5):
        resp = client.post(
            "/api/v1/auth/login",
            json={"identifier": phone, "password": "WrongPassword"},
        )
        if i < 4:
            assert resp.status_code == 401
        else:
            # 5th attempt triggers lockout
            assert resp.status_code in (401, 403)

    # Subsequent attempt should be blocked with 403 Forbidden
    locked_resp = client.post(
        "/api/v1/auth/login",
        json={"identifier": phone, "password": "TargetPassword123"},
    )
    assert locked_resp.status_code == 403
    assert "locked" in locked_resp.json()["detail"].lower()


def test_get_me_requires_bearer_token(client):
    # Unauthenticated should fail with 401
    unauth = client.get("/api/v1/auth/me")
    assert unauth.status_code == 401

    # Authenticated
    signup = client.post(
        "/api/v1/auth/signup",
        json={
            "fullName": "Kavita Rao",
            "mobileNumber": "+91-98444-55566",
            "email": "kavita@example.com",
            "password": "Password123",
        },
    ).json()

    token = signup["access_token"]
    auth_resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert auth_resp.status_code == 200
    assert auth_resp.json()["name"] == "Kavita Rao"
    assert auth_resp.json()["email"] == "kavita@example.com"


def test_refresh_token_rotation_and_revocation(client):
    signup = client.post(
        "/api/v1/auth/signup",
        json={
            "fullName": "Vikram Das",
            "mobileNumber": "+91-98555-66677",
            "password": "Password123",
        },
    ).json()

    initial_refresh = signup["refresh_token"]

    # Use refresh token
    refresh_resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": initial_refresh},
    )
    assert refresh_resp.status_code == 200
    refreshed_data = refresh_resp.json()
    new_refresh = refreshed_data["refresh_token"]
    assert new_refresh != initial_refresh

    # Using the old refresh token again should be rejected (Refresh Token Rotation)
    reused_old = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": initial_refresh},
    )
    assert reused_old.status_code == 401


def test_logout_revokes_session(client):
    login_resp = client.post(
        "/api/v1/auth/signup",
        json={
            "fullName": "Logout Tester",
            "mobileNumber": "+91-98666-77788",
            "password": "Password123",
        },
    ).json()

    refresh_token = login_resp["refresh_token"]
    access_token = login_resp["access_token"]

    # Logout
    logout_resp = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": refresh_token},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert logout_resp.status_code == 200
    assert logout_resp.json()["success"] is True

    # Refresh after logout should fail
    post_logout_refresh = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert post_logout_refresh.status_code == 401


def test_change_password_workflow(client):
    signup = client.post(
        "/api/v1/auth/signup",
        json={
            "fullName": "Password Changer",
            "mobileNumber": "+91-98777-88899",
            "password": "OldPassword123",
        },
    ).json()

    token = signup["access_token"]

    # Attempt with wrong current password
    wrong_change = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "WrongPassword", "new_password": "NewSecretPassword123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert wrong_change.status_code == 400

    # Successful change
    success_change = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "OldPassword123", "new_password": "NewSecretPassword123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert success_change.status_code == 200

    # Verify old password no longer works for login
    old_login = client.post(
        "/api/v1/auth/login",
        json={"identifier": "+91-98777-88899", "password": "OldPassword123"},
    )
    assert old_login.status_code == 401

    # Verify new password works
    new_login = client.post(
        "/api/v1/auth/login",
        json={"identifier": "+91-98777-88899", "password": "NewSecretPassword123"},
    )
    assert new_login.status_code == 200
