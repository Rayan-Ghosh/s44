"""
Pre-Payment Risk Evaluation Tests (Part 1).

Validates the real backend pre-payment evaluation endpoint POST /api/v1/risk/evaluate:
- Evaluates UPI IDs and 10-digit mobile numbers before any transaction exists.
- Resolves recipient names against DB using hashed identifiers without fabricating names.
- Enforces stage: EVALUATION_COMPLETED.
- Rejects malformed recipients and non-positive amounts with 422.
- Guarantees NO transaction is created, NO status is mutated, NO alert is created,
  and NO guardian request is triggered.
"""

from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_identifier
from app.models.alert import Alert
from app.models.guardian_request import GuardianRequest
from app.models.recipient import Recipient
from app.models.transaction import Transaction
from app.models.user import User


def test_prepayment_evaluation_upi_unverified(client: TestClient, db_session: Session):
    """Evaluating a valid but previously unseen UPI ID returns UNVERIFIED without inventing names."""
    tx_count_before = db_session.query(Transaction).count()
    alert_count_before = db_session.query(Alert).count()
    guardian_count_before = db_session.query(GuardianRequest).count()

    response = client.post(
        "/api/v1/risk/evaluate",
        json={
            "recipient": "newmerchant@okhdfcbank",
            "amount": 1500.00,
            "note": "Grocery shopping",
        },
    )
    assert response.status_code == 200
    data = response.json()

    assert data["stage"] == "EVALUATION_COMPLETED"
    assert 0 <= data["risk_score"] <= 100
    assert data["risk_level"] in ("LOW", "MEDIUM", "HIGH")
    assert data["decision"] in ("ALLOW", "WARN_CHOICE", "CONFIRM_OR_CANCEL")
    assert isinstance(data["plain_language_reasons"], list)
    assert len(data["plain_language_reasons"]) > 0
    assert "disclaimer" in data

    rec = data["recipient"]
    assert rec["raw_input"] == "newmerchant@okhdfcbank"
    assert rec["normalized"] == "newmerchant@okhdfcbank"
    assert rec["recipient_type"] == "UPI_ID"
    assert rec["display_name"] is None
    assert rec["resolution_status"] == "UNVERIFIED"
    assert data["amount"] == 1500.00
    assert data["note"] == "Grocery shopping"

    # Verify strictly no state was persisted
    assert db_session.query(Transaction).count() == tx_count_before
    assert db_session.query(Alert).count() == alert_count_before
    assert db_session.query(GuardianRequest).count() == guardian_count_before


def test_prepayment_evaluation_mobile_unresolved(client: TestClient, db_session: Session):
    """Evaluating a valid 10-digit mobile number returns UNRESOLVED if not in DB, without appending @upi."""
    response = client.post(
        "/api/v1/risk/evaluate",
        json={
            "recipient": "+91 98765 43210",
            "amount": 750.50,
        },
    )
    assert response.status_code == 200
    data = response.json()

    assert data["stage"] == "EVALUATION_COMPLETED"
    rec = data["recipient"]
    assert rec["normalized"] == "9876543210"
    assert rec["recipient_type"] == "PHONE"
    assert rec["display_name"] is None
    assert rec["resolution_status"] == "UNRESOLVED"
    assert "@" not in rec["normalized"]


def test_prepayment_evaluation_resolves_known_recipient(client: TestClient, db_session: Session):
    """Evaluating a known recipient handle resolves the actual DB display name."""
    user = User(name="Sender User", phone_hash=hash_identifier("9900011122"))
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    upi_handle = "known.friend@icici"
    h = hash_identifier(upi_handle)
    recipient = Recipient(user_id=user.id, recipient_hash=h, display_name="Priya Sharma")
    db_session.add(recipient)
    db_session.commit()

    response = client.post(
        "/api/v1/risk/evaluate",
        json={
            "recipient": upi_handle,
            "amount": 250.00,
            "user_id": user.id,
        },
    )
    assert response.status_code == 200
    data = response.json()

    assert data["stage"] == "EVALUATION_COMPLETED"
    rec = data["recipient"]
    assert rec["display_name"] == "Priya Sharma"
    assert rec["resolution_status"] == "RESOLVED"


def test_prepayment_evaluation_resolves_registered_phone_user(client: TestClient, db_session: Session):
    """Evaluating a phone number registered to an existing User resolves their real name."""
    phone = "9888877777"
    user = User(name="Rohit Verma", phone_hash=hash_identifier(phone))
    db_session.add(user)
    db_session.commit()

    response = client.post(
        "/api/v1/risk/evaluate",
        json={
            "recipient": "9888877777",
            "amount": 500.00,
        },
    )
    assert response.status_code == 200
    data = response.json()

    assert data["stage"] == "EVALUATION_COMPLETED"
    rec = data["recipient"]
    assert rec["display_name"] == "Rohit Verma"
    assert rec["resolution_status"] == "RESOLVED"


def test_prepayment_evaluation_rejects_invalid_recipients(client: TestClient):
    """Rejects malformed recipients with HTTP 422."""
    invalid_cases = [
        "",
        "   ",
        "invalid_handle_without_domain",
        "user@",
        "@bank",
        "12345",
        "+14155552671",  # Non-Indian phone
        "abcdefghij",
    ]

    for inv in invalid_cases:
        res = client.post("/api/v1/risk/evaluate", json={"recipient": inv, "amount": 100})
        assert res.status_code == 422
        assert "Invalid recipient" in res.json()["detail"]


def test_prepayment_evaluation_rejects_invalid_amounts(client: TestClient):
    """Rejects missing, zero, or negative amounts with HTTP 422."""
    res1 = client.post("/api/v1/risk/evaluate", json={"recipient": "test@upi", "amount": 0})
    assert res1.status_code == 422
    assert "greater than zero" in res1.json()["detail"].lower()

    res2 = client.post("/api/v1/risk/evaluate", json={"recipient": "test@upi", "amount": -100})
    assert res2.status_code == 422
    assert "greater than zero" in res2.json()["detail"].lower()

    res3 = client.post("/api/v1/risk/evaluate", json={"recipient": "test@upi", "amount": "invalid"})
    assert res3.status_code == 422
    assert "valid number" in res3.json()["detail"].lower()

    res4 = client.post("/api/v1/risk/evaluate", json={"recipient": "test@upi"})
    assert res4.status_code == 422


def test_evaluation_endpoint_rejects_empty_payload(client: TestClient):
    """Rejects payload with neither transaction_id nor recipient/amount with HTTP 422."""
    res = client.post("/api/v1/risk/evaluate", json={})
    assert res.status_code == 422
    assert "Either transaction_id or recipient" in res.json()["detail"]
