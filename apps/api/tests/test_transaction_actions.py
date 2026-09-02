def _create_txn(client):
    user_id = client.post("/api/v1/users", json={"name": "Kavita Rao", "phone_number": "+91-98765-99999"}).json()["id"]
    return client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "friend.upi@bank",
            "device_identifier": "device-kavita",
            "amount": "3000.00",
        },
    ).json()["id"]


def test_confirm_transaction_endpoint(client):
    txn_id = _create_txn(client)
    res = client.post(f"/api/v1/transactions/{txn_id}/confirm")
    assert res.status_code == 200
    assert res.json()["status"] == "CONFIRMED"

    txn = client.get(f"/api/v1/transactions/{txn_id}").json()
    assert txn["status"] == "CONFIRMED"


def test_cancel_transaction_endpoint(client):
    txn_id = _create_txn(client)
    res = client.post(f"/api/v1/transactions/{txn_id}/cancel")
    assert res.status_code == 200
    assert res.json()["status"] == "CANCELLED"

    txn = client.get(f"/api/v1/transactions/{txn_id}").json()
    assert txn["status"] == "CANCELLED"


def test_report_transaction_endpoint(client):
    txn_id = _create_txn(client)
    res = client.post(f"/api/v1/transactions/{txn_id}/report?reason=Suspicious%20scam")
    assert res.status_code == 200
    assert res.json()["status"] == "REPORTED"
    assert "case_id" in res.json()

    txn = client.get(f"/api/v1/transactions/{txn_id}").json()
    assert txn["status"] == "REPORTED"


def test_cannot_confirm_or_cancel_already_confirmed_transaction(client):
    txn_id = _create_txn(client)

    # 1. First confirmation succeeds
    res1 = client.post(f"/api/v1/transactions/{txn_id}/confirm")
    assert res1.status_code == 200
    assert res1.json()["status"] == "CONFIRMED"

    # 2. Repeated confirmation must fail with 400 Bad Request
    res2 = client.post(f"/api/v1/transactions/{txn_id}/confirm")
    assert res2.status_code == 400
    assert "terminal status" in res2.json()["detail"].lower()

    # 3. Cancellation on completed/confirmed transaction must fail with 400 Bad Request
    res3 = client.post(f"/api/v1/transactions/{txn_id}/cancel")
    assert res3.status_code == 400
    assert "terminal status" in res3.json()["detail"].lower()

    # 4. Status remains CONFIRMED in database
    txn = client.get(f"/api/v1/transactions/{txn_id}").json()
    assert txn["status"] == "CONFIRMED"

