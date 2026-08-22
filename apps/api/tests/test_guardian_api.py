def _setup_high_risk_txn(client):
    user_id = client.post("/api/v1/users", json={"name": "Shyam Sundar", "phone_number": "+91-91111-22222"}).json()["id"]
    contact_res = client.post(
        "/api/v1/guardian/trusted-contacts",
        json={
            "user_id": user_id,
            "contact_name": "Deepak Sundar (Son)",
            "phone_number": "+91-93333-44444",
            "relationship": "Child",
        },
    )
    contact_id = contact_res.json()["id"]

    txn_res = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "scam.target@upi",
            "device_identifier": "device-shyam",
            "amount": "65000.00",
        },
    )
    txn_id = txn_res.json()["id"]
    return user_id, contact_id, txn_id


def test_trusted_contact_enrolment(client):
    user_id = client.post("/api/v1/users", json={"name": "Meera Patel", "phone_number": "+91-92222-33333"}).json()["id"]
    res = client.post(
        "/api/v1/guardian/trusted-contacts",
        json={
            "user_id": user_id,
            "contact_name": "Ramesh Patel",
            "phone_number": "+91-94444-55555",
            "relationship": "Spouse",
        },
    )
    assert res.status_code == 201
    contact = res.json()
    assert contact["contact_name"] == "Ramesh Patel"
    assert "XXXXX" in contact["phone_masked"]

    list_res = client.get(f"/api/v1/guardian/trusted-contacts/{user_id}")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1


def test_guardian_request_trigger_and_approve(client):
    user_id, contact_id, txn_id = _setup_high_risk_txn(client)

    req_res = client.post("/api/v1/guardian/requests", json={"transaction_id": txn_id, "trusted_contact_id": contact_id})
    assert req_res.status_code == 201
    req = req_res.json()
    assert req["outcome"] == "PENDING"
    assert req["remaining_seconds"] <= 120

    # Pending list
    pending = client.get(f"/api/v1/guardian/requests/pending/{contact_id}").json()
    assert len(pending) >= 1

    # Approve
    approve_res = client.post(f"/api/v1/guardian/requests/{req['id']}/approve", json={"notes": "Approved by son"})
    assert approve_res.status_code == 200
    assert approve_res.json()["outcome"] == "APPROVED"

    txn = client.get(f"/api/v1/transactions/{txn_id}").json()
    assert txn["status"] == "GUARDIAN_APPROVED"


def test_guardian_request_reject(client):
    user_id, contact_id, txn_id = _setup_high_risk_txn(client)
    req = client.post("/api/v1/guardian/requests", json={"transaction_id": txn_id, "trusted_contact_id": contact_id}).json()

    reject_res = client.post(f"/api/v1/guardian/requests/{req['id']}/reject", json={"notes": "Scam call reported by father"})
    assert reject_res.status_code == 200
    assert reject_res.json()["outcome"] == "REJECTED"

    txn = client.get(f"/api/v1/transactions/{txn_id}").json()
    assert txn["status"] == "GUARDIAN_REJECTED"


def test_guardian_user_friction_override(client):
    user_id, contact_id, txn_id = _setup_high_risk_txn(client)
    req = client.post("/api/v1/guardian/requests", json={"transaction_id": txn_id, "trusted_contact_id": contact_id}).json()

    override_res = client.post(f"/api/v1/guardian/requests/{req['id']}/user-override", json={"pin": "1234"})
    assert override_res.status_code == 200
    assert override_res.json()["status"] == "GUARDIAN_TIMEOUT_USER_OVERRODE"

    txn = client.get(f"/api/v1/transactions/{txn_id}").json()
    assert txn["status"] == "GUARDIAN_TIMEOUT_USER_OVERRODE"
