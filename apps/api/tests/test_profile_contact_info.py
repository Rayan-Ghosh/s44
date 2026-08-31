"""
Covers the profile/contact-info round-trip added in
docs/PROFILE_CONTACT_INFO_DECISION.md: PATCH persists real (encrypted)
email/phone that survives a fresh GET, and device_name/device_type reported
at transaction-creation time actually stick on the device row.
"""

from fastapi.testclient import TestClient

from app.core.contact_encryption import decrypt_field, encrypt_field
from app.main import app

client = TestClient(app)


def _signup(mobile: str) -> int:
    res = client.post(
        "/api/v1/auth/signup",
        json={"fullName": "Contact Info Test User", "mobileNumber": mobile, "email": ""},
    )
    assert res.status_code in (200, 201)
    return res.json()["user"]["id"]


def test_encrypt_decrypt_round_trip():
    original = "someone@example.com"
    token = encrypt_field(original)
    assert token != original  # actually encrypted, not just echoed
    assert decrypt_field(token) == original


def test_patch_persists_contact_info_and_get_reflects_it():
    user_id = _signup("+91-90001-00001")

    patch_res = client.patch(
        f"/api/v1/users/{user_id}",
        json={"name": "Updated Name", "email": "updated@example.com", "phone": "+91-90001-11111"},
    )
    assert patch_res.status_code == 200
    body = patch_res.json()
    assert body["success"] is True
    assert body["user"]["email"] == "updated@example.com"
    assert body["user"]["phone"] == "+91-90001-11111"

    # A completely fresh GET (not the PATCH response echo) must see the same
    # real, persisted, decrypted values.
    get_res = client.get(f"/api/v1/users/{user_id}")
    assert get_res.status_code == 200
    fetched = get_res.json()
    assert fetched["name"] == "Updated Name"
    assert fetched["email"] == "updated@example.com"
    assert fetched["phone"] == "+91-90001-11111"


def test_get_user_with_no_email_saved_returns_empty_not_fabricated():
    # Signup persists the phone it collected (see auth.py signup), but no
    # email was given here — that should come back empty, not a guessed
    # "name@example.com".
    user_id = _signup("+91-90002-00002")
    res = client.get(f"/api/v1/users/{user_id}")
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == ""
    assert body["phone"] == "+91-90002-00002"


def test_patch_unknown_user_returns_404_not_fabricated_profile():
    res = client.patch("/api/v1/users/999999", json={"name": "Nobody"})
    assert res.status_code == 404


def test_transaction_device_name_persists_on_device_row():
    user_id = _signup("+91-90003-00003")

    txn_res = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "merchant@upi",
            "recipient_display_name": "Test Merchant",
            "device_identifier": "device-fingerprint-abc",
            "device_name": "Pixel 9 Pro",
            "device_type": "Android 16",
            "amount": 500,
            "payment_method": "UPI",
        },
    )
    assert txn_res.status_code == 201

    devices_res = client.get(f"/api/v1/users/{user_id}/devices")
    assert devices_res.status_code == 200
    devices = devices_res.json()
    assert len(devices) == 1
    assert devices[0]["device_name"] == "Pixel 9 Pro"
    assert devices[0]["device_type"] == "Android 16"


def test_device_without_reported_name_falls_back_to_generic_label_not_fabricated_model():
    user_id = _signup("+91-90004-00004")

    client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "merchant2@upi",
            "device_identifier": "device-fingerprint-xyz",
            "amount": 250,
        },
    )

    devices = client.get(f"/api/v1/users/{user_id}/devices").json()
    assert len(devices) == 1
    assert devices[0]["device_type"] == "Unknown"
    assert devices[0]["device_name"].startswith("Device ")
    assert "Google Pixel" not in devices[0]["device_name"]


def test_login_returns_previously_saved_contact_info():
    user_id = _signup("+91-90005-00005")
    client.patch(f"/api/v1/users/{user_id}", json={"email": "loginback@example.com"})

    login_res = client.post("/api/v1/auth/login", json={"identifier": "+91-90005-00005"})
    assert login_res.status_code == 200
    assert login_res.json()["user"]["email"] == "loginback@example.com"
