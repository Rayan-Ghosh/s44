"""Integration tests for /api/v1/payments (AVARAN PAY spec §3, §8, §11, §12)."""


def _create_user(client, name="Payments Test User", phone="+91-96666-77777"):
    return client.post("/api/v1/users", json={"name": name, "phone_number": phone}).json()["id"]


def test_prepare_creates_a_transaction_with_source(client):
    user_id = _create_user(client)
    res = client.post(
        "/api/v1/payments/prepare",
        json={
            "user_id": user_id,
            "source": "UPI_ID",
            "amount": "450.00",
            "upi_id": "chai.stall@upi",
            "device_identifier": "device-payments-1",
        },
    )
    assert res.status_code == 201
    body = res.json()
    assert body["status"] == "PENDING"
    assert body["amount"] == "450.00"


def test_prepare_is_idempotent_on_client_request_id(client):
    user_id = _create_user(client, phone="+91-96666-77778")
    payload = {
        "user_id": user_id,
        "source": "UPI_ID",
        "amount": "500.00",
        "upi_id": "merchant@upi",
        "device_identifier": "device-payments-2",
        "client_request_id": "idem-key-001",
    }
    first = client.post("/api/v1/payments/prepare", json=payload)
    second = client.post("/api/v1/payments/prepare", json=payload)
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]


def test_prepare_requires_recipient_identifier(client):
    user_id = _create_user(client, phone="+91-96666-77779")
    res = client.post(
        "/api/v1/payments/prepare",
        json={
            "user_id": user_id,
            "source": "UPI_ID",
            "amount": "100.00",
            "device_identifier": "device-payments-3",
        },
    )
    assert res.status_code == 422


def test_launch_upi_rejects_amount_recipient_mismatch(client):
    user_id = _create_user(client, phone="+91-96666-77780")
    txn_id = client.post(
        "/api/v1/payments/prepare",
        json={
            "user_id": user_id,
            "source": "UPI_ID",
            "amount": "300.00",
            "upi_id": "real.recipient@upi",
            "device_identifier": "device-payments-4",
        },
    ).json()["id"]

    res = client.post(
        f"/api/v1/payments/{txn_id}/launch-upi",
        json={"app": "GPAY", "amount": "300.00", "recipient_identifier": "different.recipient@upi"},
    )
    assert res.status_code == 409

    res2 = client.post(
        f"/api/v1/payments/{txn_id}/launch-upi",
        json={"app": "GPAY", "amount": "999.00", "recipient_identifier": "real.recipient@upi"},
    )
    assert res2.status_code == 409


def test_low_risk_full_lifecycle_reaches_completed(client, db_session):
    """Full prepare -> (risk-allowed) -> launch-upi -> confirm -> COMPLETED
    chain. Risk banding itself (LOW vs MEDIUM vs HIGH) is exercised by
    test_demo_api.py's scenario tests and app/api/routers/simulator.py's own
    suite; here the transaction is moved straight to ALLOWED to test the
    launch-upi/confirm/duplicate mechanics deterministically, without
    depending on the live ML model landing in an exact band."""
    from app.models.enums import TransactionStatus
    from app.models.transaction import Transaction

    user_id = _create_user(client, phone="+91-96666-77781")
    txn_id = client.post(
        "/api/v1/payments/prepare",
        json={
            "user_id": user_id,
            "source": "UPI_ID",
            "amount": "450.00",
            "upi_id": "sharma.chai@upi",
            "device_identifier": "Rohan iPhone 15",
            "location": "Indiranagar, Bengaluru",
        },
    ).json()["id"]

    txn = db_session.get(Transaction, txn_id)
    txn.status = TransactionStatus.ALLOWED
    db_session.commit()

    launch = client.post(
        f"/api/v1/payments/{txn_id}/launch-upi",
        json={"app": "GPAY", "amount": "450.00", "recipient_identifier": "sharma.chai@upi"},
    )
    assert launch.status_code == 200
    assert launch.json()["status"] == "PAYMENT_PENDING"

    confirm = client.post(f"/api/v1/payments/{txn_id}/confirm", json={"utr_reference": "UTR123456"})
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "COMPLETED"
    assert confirm.json()["duplicate"] is False

    # Duplicate confirmation is safe and idempotent (spec §12).
    dup = client.post(f"/api/v1/payments/{txn_id}/confirm")
    assert dup.status_code == 200
    assert dup.json()["duplicate"] is True
    assert dup.json()["status"] == "COMPLETED"

    status_res = client.get(f"/api/v1/payments/{txn_id}/status")
    assert status_res.json()["status"] == "COMPLETED"
    assert status_res.json()["utr_reference"] == "UTR123456"


def test_cancel_is_idempotent(client):
    user_id = _create_user(client, phone="+91-96666-77782")
    txn_id = client.post(
        "/api/v1/payments/prepare",
        json={
            "user_id": user_id,
            "source": "MOBILE",
            "amount": "200.00",
            "phone_number": "+91-90000-11111",
            "device_identifier": "device-payments-6",
        },
    ).json()["id"]

    first = client.post(f"/api/v1/payments/{txn_id}/cancel")
    assert first.status_code == 200
    assert first.json()["status"] == "CANCELLED"

    second = client.post(f"/api/v1/payments/{txn_id}/cancel")
    assert second.status_code == 200
    assert second.json()["status"] == "CANCELLED"
