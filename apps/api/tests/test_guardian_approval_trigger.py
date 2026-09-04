"""
Tests for Guardian approval trigger validation and state transition rules.

Validates that:
1. Guardian requests can only be triggered for HIGH-risk transactions.
2. Guardian requests cannot be triggered on terminal or already approved transactions.
3. Duplicate pending requests for the same transaction return 409 Conflict with countdown.
4. Ownership isolation prevents triggering guardian requests for another user's transaction.
5. Trusted contacts must belong to the transaction user.
6. Triggering guardian request transitions transaction to PENDING_GUARDIAN_APPROVAL.
"""

import pytest
from app.models.enums import TransactionStatus


def _setup_users_and_contact(client):
    user_res = client.post("/api/v1/users", json={"name": "Alice Sharma", "phone_number": "+91-91111-33333"})
    user_id = user_res.json()["id"]

    contact_res = client.post(
        "/api/v1/guardian/trusted-contacts",
        json={
            "user_id": user_id,
            "contact_name": "Bob Sharma (Brother)",
            "phone_number": "+91-92222-44444",
            "relationship": "Sibling",
        },
    )
    contact_id = contact_res.json()["id"]

    other_user_res = client.post("/api/v1/users", json={"name": "Eve Malicious", "phone_number": "+91-99999-00000"})
    other_user_id = other_user_res.json()["id"]

    other_contact_res = client.post(
        "/api/v1/guardian/trusted-contacts",
        json={
            "user_id": other_user_id,
            "contact_name": "Mallory",
            "phone_number": "+91-98888-11111",
            "relationship": "Friend",
        },
    )
    other_contact_id = other_contact_res.json()["id"]

    return user_id, contact_id, other_user_id, other_contact_id


def test_cannot_trigger_guardian_on_low_risk_transaction(client):
    user_id, contact_id, _, _ = _setup_users_and_contact(client)

    # Low risk transaction: small amount, normal merchant
    txn_res = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "local.grocery@upi",
            "device_identifier": "device-alice",
            "amount": "150.00",
        },
    )
    txn_id = txn_res.json()["id"]

    res = client.post(
        "/api/v1/guardian/requests",
        json={"transaction_id": txn_id, "trusted_contact_id": contact_id},
    )
    assert res.status_code == 400
    assert "Guardian approval can only be triggered for HIGH-risk transactions" in res.json()["detail"]


def test_duplicate_pending_request_returns_409_conflict(client):
    user_id, contact_id, _, _ = _setup_users_and_contact(client)

    # High risk transaction: high amount, scam identifier
    txn_res = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "scam.lottery@upi",
            "device_identifier": "device-alice",
            "amount": "75000.00",
        },
    )
    txn_id = txn_res.json()["id"]

    # First request succeeds
    res1 = client.post(
        "/api/v1/guardian/requests",
        json={"transaction_id": txn_id, "trusted_contact_id": contact_id},
    )
    assert res1.status_code == 201
    assert res1.json()["outcome"] == "PENDING"

    # Second request immediately returns 409 Conflict
    res2 = client.post(
        "/api/v1/guardian/requests",
        json={"transaction_id": txn_id, "trusted_contact_id": contact_id},
    )
    assert res2.status_code == 409
    assert "already pending" in res2.json()["detail"]


def test_cannot_trigger_guardian_on_already_approved_transaction(client):
    user_id, contact_id, _, _ = _setup_users_and_contact(client)

    txn_res = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "scam.lottery@upi",
            "device_identifier": "device-alice",
            "amount": "75000.00",
        },
    )
    txn_id = txn_res.json()["id"]

    req_res = client.post(
        "/api/v1/guardian/requests",
        json={"transaction_id": txn_id, "trusted_contact_id": contact_id},
    )
    assert req_res.status_code == 201
    req_id = req_res.json()["id"]

    # Approve the request
    approve_res = client.post(f"/api/v1/guardian/requests/{req_id}/approve", json={"notes": "Approved"})
    assert approve_res.status_code == 200

    # Attempt to trigger another guardian request on now-approved transaction
    retrigger_res = client.post(
        "/api/v1/guardian/requests",
        json={"transaction_id": txn_id, "trusted_contact_id": contact_id},
    )
    assert retrigger_res.status_code == 400
    assert "Guardian approval has already been granted" in retrigger_res.json()["detail"]


def test_cannot_trigger_guardian_on_terminal_transaction(client):
    user_id, contact_id, _, _ = _setup_users_and_contact(client)

    txn_res = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "scam.lottery@upi",
            "device_identifier": "device-alice",
            "amount": "75000.00",
        },
    )
    txn_id = txn_res.json()["id"]

    # Cancel the transaction (terminal state)
    cancel_res = client.post(f"/api/v1/transactions/{txn_id}/cancel")
    assert cancel_res.status_code == 200

    # Attempt to trigger guardian request
    res = client.post(
        "/api/v1/guardian/requests",
        json={"transaction_id": txn_id, "trusted_contact_id": contact_id},
    )
    assert res.status_code == 400
    assert "terminal status" in res.json()["detail"]


def test_user_ownership_enforcement_on_guardian_request(client):
    user_id, contact_id, other_user_id, _ = _setup_users_and_contact(client)

    txn_res = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "scam.lottery@upi",
            "device_identifier": "device-alice",
            "amount": "75000.00",
        },
    )
    txn_id = txn_res.json()["id"]

    # Pass other_user_id in payload
    res = client.post(
        "/api/v1/guardian/requests",
        json={"transaction_id": txn_id, "trusted_contact_id": contact_id, "user_id": other_user_id},
    )
    assert res.status_code == 403
    assert "does not belong to user" in res.json()["detail"]


def test_trusted_contact_ownership_enforcement(client):
    user_id, _, _, other_contact_id = _setup_users_and_contact(client)

    txn_res = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "scam.lottery@upi",
            "device_identifier": "device-alice",
            "amount": "75000.00",
        },
    )
    txn_id = txn_res.json()["id"]

    # Try to use another user's trusted contact
    res = client.post(
        "/api/v1/guardian/requests",
        json={"transaction_id": txn_id, "trusted_contact_id": other_contact_id},
    )
    assert res.status_code == 400
    assert "does not belong to the transaction user" in res.json()["detail"]


def test_valid_high_risk_transitions_transaction_status(client):
    user_id, contact_id, _, _ = _setup_users_and_contact(client)

    txn_res = client.post(
        "/api/v1/transactions",
        json={
            "user_id": user_id,
            "recipient_identifier": "scam.lottery@upi",
            "device_identifier": "device-alice",
            "amount": "75000.00",
        },
    )
    txn_id = txn_res.json()["id"]

    res = client.post(
        "/api/v1/guardian/requests",
        json={"transaction_id": txn_id, "trusted_contact_id": contact_id},
    )
    assert res.status_code == 201
    assert res.json()["outcome"] == "PENDING"

    txn = client.get(f"/api/v1/transactions/{txn_id}").json()
    assert txn["status"] == "PENDING_GUARDIAN_APPROVAL"
