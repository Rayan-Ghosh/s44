import pytest


@pytest.fixture
def user_id(client):
    response = client.post(
        "/api/v1/users", json={"name": "Priya Nair", "phone_number": "+91-90000-66666"}
    )
    return response.json()["id"]


def test_create_transaction_returns_201(client, user_id):
    response = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "priya.recipient@upi",
            "device_identifier": "device-fingerprint-1",
            "amount": "500.00",
            "location": "Bhubaneswar",
            "payment_method": "UPI",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "PENDING"
    assert body["amount"] == "500.00"
    assert body["user_id"] == user_id


def test_get_transaction_returns_created_transaction(client, user_id):
    created = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "priya.recipient2@upi",
            "device_identifier": "device-fingerprint-2",
            "amount": "1200.50",
        },
    ).json()

    response = client.get(f"/api/v1/transactions/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_get_nonexistent_transaction_returns_404(client):
    response = client.get("/api/v1/transactions/999999")
    assert response.status_code == 404


def test_create_transaction_for_nonexistent_user_returns_404(client):
    response = client.post(
        "/api/v1/transactions",
        json={
            "user_id": 999999,
            "recipient_identifier": "someone@upi",
            "device_identifier": "device-x",
            "amount": "100.00",
        },
    )
    assert response.status_code == 404


def test_repeated_device_and_recipient_resolve_to_same_rows(client, user_id):
    payload = {
        "user_id": user_id,
        "recipient_identifier": "same.recipient@upi",
        "device_identifier": "same-device",
        "amount": "300.00",
    }
    first = client.post("/api/v1/transactions", json=payload).json()

    payload["amount"] = "150.00"
    second = client.post("/api/v1/transactions", json=payload).json()

    assert first["device_id"] == second["device_id"]
    assert first["recipient_id"] == second["recipient_id"]
    assert first["id"] != second["id"]


def test_negative_amount_returns_422(client, user_id):
    response = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "someone@upi",
            "device_identifier": "device-y",
            "amount": "-50.00",
        },
    )
    assert response.status_code == 422


def test_zero_amount_returns_422(client, user_id):
    response = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "someone@upi",
            "device_identifier": "device-z",
            "amount": "0",
        },
    )
    assert response.status_code == 422


def test_missing_required_field_returns_422(client, user_id):
    response = client.post(
        "/api/v1/transactions",
        json={"user_id": user_id, "amount": "100.00"},
    )
    assert response.status_code == 422
