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


def test_dynamic_guardian_user_lookup_and_approval(client):
    # 1. Register User A (Payer) and User B (Guardian)
    payer = client.post("/api/v1/users", json={"name": "Payer User", "phone_number": "+91-98765-11111"}).json()
    guardian = client.post("/api/v1/users", json={"name": "Guardian User", "phone_number": "+91-98765-22222"}).json()

    # 2. Payer adds Guardian by phone number -> guardian_user_id automatically resolved
    tc_res = client.post(
        f"/api/v1/users/{payer['id']}/trusted-contacts",
        json={"name": "My Guardian", "phone_number": "+91-98765-22222", "relationship": "Sister"},
    )
    assert tc_res.status_code == 201
    contact = tc_res.json()
    assert contact["guardian_user_id"] == guardian["id"]

    # 3. Payer initiates high-risk transaction
    txn = client.post(
        "/api/v1/transactions",
        json={
            "user_id": payer["id"],
            "recipient_identifier": "unknown.crypto@upi",
            "recipient_display_name": "Apex Crypto Merchant",
            "device_identifier": "device-payer-1",
            "amount": "80000.00",
        },
    ).json()

    # 4. Trigger guardian hold request dynamically without explicit contact ID
    req_res = client.post("/api/v1/guardian/requests", json={"transaction_id": txn["id"]})
    assert req_res.status_code == 201
    req = req_res.json()
    assert req["sender_name"] == "Payer User"
    assert req["recipient_name"] == "Apex Crypto Merchant"

    # 5. Guardian polls notifications dynamically by their own user ID
    guardian_pending = client.get(f"/api/v1/guardian/requests/by-guardian-user/{guardian['id']}").json()
    assert len(guardian_pending) == 1
    assert guardian_pending[0]["id"] == req["id"]
    assert guardian_pending[0]["sender_name"] == "Payer User"
    assert guardian_pending[0]["transaction_amount"] == 80000.0

    # 6. Guardian approves
    appr = client.post(f"/api/v1/guardian/requests/{req['id']}/approve", json={"notes": "Approved by sister"})
    assert appr.status_code == 200

    # 7. Transaction status is updated
    txn_check = client.get(f"/api/v1/transactions/{txn['id']}").json()
    assert txn_check["status"] == "GUARDIAN_APPROVED"

    # 8. Guardian's pending list is now cleared
    guardian_pending_after = client.get(f"/api/v1/guardian/requests/by-guardian-user/{guardian['id']}").json()
    assert len(guardian_pending_after) == 0


def test_late_guardian_signup_backlink(client):
    # 1. Payer exists, Guardian does NOT yet have an account
    payer = client.post("/api/v1/users", json={"name": "Kavita Rao", "phone_number": "+91-98765-33333"}).json()

    # 2. Payer adds contact with phone +91-98765-44444 -> guardian_user_id is None initially
    tc_res = client.post(
        f"/api/v1/users/{payer['id']}/trusted-contacts",
        json={"name": "Deepak Rao", "phone_number": "+91-98765-44444", "relationship": "Brother"},
    )
    contact = tc_res.json()
    assert contact["guardian_user_id"] is None

    # 3. Deepak now registers on Avaran
    deepak = client.post("/api/v1/users", json={"name": "Deepak Rao", "phone_number": "+91-98765-44444"}).json()

    # 4. Verify contact was automatically backlinked!
    contacts_list = client.get(f"/api/v1/users/{payer['id']}/trusted-contacts").json()
    assert len(contacts_list) == 1
    assert contacts_list[0]["guardian_user_id"] == deepak["id"]


def test_guardian_request_exact_120_seconds_countdown(client):
    from datetime import datetime, timezone
    user_id, contact_id, txn_id = _setup_high_risk_txn(client)

    req_res = client.post("/api/v1/guardian/requests", json={"transaction_id": txn_id, "trusted_contact_id": contact_id})
    assert req_res.status_code == 201
    req = req_res.json()

    assert req["outcome"] == "PENDING"
    assert req["remaining_seconds"] in (119, 120)

    req_at = datetime.fromisoformat(req["requested_at"])
    exp_at = datetime.fromisoformat(req["expires_at"])
    diff = (exp_at - req_at).total_seconds()
    assert int(diff) == 120


def test_guardian_request_expired_blocks_approval_and_blocks_transaction(client, db_session):
    from datetime import datetime, timedelta, timezone
    from app.models.guardian_request import GuardianRequest

    user_id, contact_id, txn_id = _setup_high_risk_txn(client)
    req_res = client.post("/api/v1/guardian/requests", json={"transaction_id": txn_id, "trusted_contact_id": contact_id})
    req_id = req_res.json()["id"]

    # Artificially set expires_at in the past
    req_orm = db_session.get(GuardianRequest, req_id)
    req_orm.expires_at = datetime.now(timezone.utc) - timedelta(seconds=10)
    db_session.commit()

    # Attempting to approve an expired request must fail with 400
    appr_res = client.post(f"/api/v1/guardian/requests/{req_id}/approve", json={"notes": "Late approval"})
    assert appr_res.status_code == 400
    assert "expired" in appr_res.json()["detail"].lower()

    # Request detail should now be TIMEOUT with 0 remaining seconds
    detail = client.get(f"/api/v1/guardian/requests/{req_id}").json()
    assert detail["outcome"] == "TIMEOUT"
    assert detail["remaining_seconds"] == 0

    # Associated transaction must be permanently blocked (GUARDIAN_REJECTED)
    txn = client.get(f"/api/v1/transactions/{txn_id}").json()
    assert txn["status"] == "GUARDIAN_REJECTED"

