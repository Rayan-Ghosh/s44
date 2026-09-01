"""
Automated unit & integration tests for Cryptographic Transaction Integrity,
Authorization Binding, Anti-Replay, Tamper Detection, and Guardian Invalidation.
"""

from datetime import datetime, timezone
from decimal import Decimal
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_identifier, hash_password
from app.main import app
from app.models.device import Device
from app.models.enums import GuardianOutcome, TransactionStatus
from app.models.guardian_request import GuardianRequest
from app.models.recipient import Recipient
from app.models.transaction import Transaction
from app.models.trusted_contact import TrustedContact
from app.models.user import User
from app.models.user_contact_info import UserContactInfo
from app.services.transaction_integrity_service import TransactionIntegrityService


@pytest.fixture
def client(db_session: Session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def integrity_setup(db_session: Session):
    user1 = User(name="Integrity User 1", phone_hash=hash_identifier("+919876543201"), is_verified=True)
    user2 = User(name="Integrity User 2", phone_hash=hash_identifier("+919876543202"), is_verified=True)
    db_session.add_all([user1, user2])
    db_session.commit()
    db_session.refresh(user1)
    db_session.refresh(user2)

    dev = Device(device_hash=hash_identifier("dev-integrity-1"), user_id=user1.id)
    rec1 = Recipient(recipient_hash=hash_identifier("utility.bill@upi"), user_id=user1.id, display_name="Electricity Bill")
    rec2 = Recipient(recipient_hash=hash_identifier("attacker.scam@upi"), user_id=user1.id, display_name="Attacker Handle")
    guardian_contact = TrustedContact(
        user_id=user1.id,
        contact_name="Family Guardian",
        contact_phone_hash=hash_identifier("+919876543299"),
        phone_masked="+91 98*** **299",
        relationship="Parent",
    )
    db_session.add_all([dev, rec1, rec2, guardian_contact])
    db_session.commit()
    db_session.refresh(dev)
    db_session.refresh(rec1)
    db_session.refresh(rec2)
    db_session.refresh(guardian_contact)

    return {
        "user1": user1,
        "user2": user2,
        "device": dev,
        "recipient1": rec1,
        "recipient2": rec2,
        "guardian_contact": guardian_contact,
    }


def test_unchanged_transaction_authorizes_and_confirms(client: TestClient, integrity_setup: dict, db_session: Session):
    txn = Transaction(
        user_id=integrity_setup["user1"].id,
        recipient_id=integrity_setup["recipient1"].id,
        device_id=integrity_setup["device"].id,
        amount=Decimal("4500.00"),
        payment_method="UPI",
        status=TransactionStatus.PENDING_AUTHORIZATION,
        authorization_required=True,
        authorization_status="PENDING",
    )
    db_session.add(txn)
    db_session.commit()
    db_session.refresh(txn)

    # 1. Authorize transaction
    auth_resp = client.post(f"/api/v1/transactions/{txn.id}/authorize", json={"method": "BIOMETRIC"})
    assert auth_resp.status_code == 200
    assert auth_resp.json()["authorization_status"] == "AUTHORIZED"
    assert "integrity_hash" in auth_resp.json()

    # 2. Confirm without modifications -> must succeed
    confirm_resp = client.post(f"/api/v1/transactions/{txn.id}/confirm")
    assert confirm_resp.status_code == 200
    assert confirm_resp.json()["status"] == TransactionStatus.CONFIRMED.value


def test_amount_tamper_detected_and_invalidates_authorization(client: TestClient, integrity_setup: dict, db_session: Session):
    txn = Transaction(
        user_id=integrity_setup["user1"].id,
        recipient_id=integrity_setup["recipient1"].id,
        device_id=integrity_setup["device"].id,
        amount=Decimal("500.00"),
        payment_method="UPI",
        status=TransactionStatus.PENDING_AUTHORIZATION,
        authorization_required=True,
        authorization_status="PENDING",
    )
    db_session.add(txn)
    db_session.commit()

    # 1. User authorizes ₹500 payment
    auth_resp = client.post(f"/api/v1/transactions/{txn.id}/authorize", json={"method": "BIOMETRIC"})
    assert auth_resp.status_code == 200

    # 2. Tamper: amount modified to ₹50,000 in database
    txn.amount = Decimal("50000.00")
    db_session.commit()

    # 3. Confirmation attempt must be rejected with 409 Conflict
    confirm_resp = client.post(f"/api/v1/transactions/{txn.id}/confirm")
    assert confirm_resp.status_code == 409
    assert "Transaction details changed after security approval" in confirm_resp.json()["detail"]

    # 4. Verify authorization was wiped and transaction reverted to PENDING_AUTHORIZATION
    db_session.refresh(txn)
    assert txn.authorization_status == "PENDING"
    assert txn.integrity_hash is None
    assert txn.status == TransactionStatus.PENDING_AUTHORIZATION


def test_recipient_tamper_detected(client: TestClient, integrity_setup: dict, db_session: Session):
    txn = Transaction(
        user_id=integrity_setup["user1"].id,
        recipient_id=integrity_setup["recipient1"].id,
        device_id=integrity_setup["device"].id,
        amount=Decimal("2000.00"),
        payment_method="UPI",
        status=TransactionStatus.PENDING_AUTHORIZATION,
        authorization_required=True,
        authorization_status="PENDING",
    )
    db_session.add(txn)
    db_session.commit()

    # Authorize for recipient 1
    client.post(f"/api/v1/transactions/{txn.id}/authorize", json={"method": "BIOMETRIC"})

    # Tamper recipient to attacker
    txn.recipient_id = integrity_setup["recipient2"].id
    db_session.commit()

    # Confirm fails
    confirm_resp = client.post(f"/api/v1/transactions/{txn.id}/confirm")
    assert confirm_resp.status_code == 409


def test_payment_method_tamper_detected(client: TestClient, integrity_setup: dict, db_session: Session):
    txn = Transaction(
        user_id=integrity_setup["user1"].id,
        recipient_id=integrity_setup["recipient1"].id,
        device_id=integrity_setup["device"].id,
        amount=Decimal("1500.00"),
        payment_method="UPI",
        status=TransactionStatus.PENDING_AUTHORIZATION,
        authorization_required=True,
        authorization_status="PENDING",
    )
    db_session.add(txn)
    db_session.commit()

    client.post(f"/api/v1/transactions/{txn.id}/authorize", json={"method": "BIOMETRIC"})

    # Tamper payment method
    txn.payment_method = "IMPS_DIRECT"
    db_session.commit()

    confirm_resp = client.post(f"/api/v1/transactions/{txn.id}/confirm")
    assert confirm_resp.status_code == 409


def test_cross_transaction_replay_prevention(client: TestClient, integrity_setup: dict, db_session: Session):
    txn1 = Transaction(
        user_id=integrity_setup["user1"].id,
        recipient_id=integrity_setup["recipient1"].id,
        device_id=integrity_setup["device"].id,
        amount=Decimal("1000.00"),
        payment_method="UPI",
        status=TransactionStatus.PENDING_AUTHORIZATION,
        authorization_required=True,
        authorization_status="PENDING",
    )
    txn2 = Transaction(
        user_id=integrity_setup["user1"].id,
        recipient_id=integrity_setup["recipient1"].id,
        device_id=integrity_setup["device"].id,
        amount=Decimal("1000.00"),
        payment_method="UPI",
        status=TransactionStatus.PENDING_AUTHORIZATION,
        authorization_required=True,
        authorization_status="PENDING",
    )
    db_session.add_all([txn1, txn2])
    db_session.commit()

    # Authorize Tx 1
    auth1 = client.post(f"/api/v1/transactions/{txn1.id}/authorize", json={"method": "BIOMETRIC"}).json()
    hash1 = auth1["integrity_hash"]

    # Attempt to replay hash1 onto Tx 2
    txn2.integrity_hash = hash1
    txn2.authorization_status = "AUTHORIZED"
    db_session.commit()

    # Confirming Tx 2 must fail with 409
    confirm2 = client.post(f"/api/v1/transactions/{txn2.id}/confirm")
    assert confirm2.status_code == 409


def test_guardian_approval_tamper_invalidates_request(client: TestClient, integrity_setup: dict, db_session: Session):
    txn = Transaction(
        user_id=integrity_setup["user1"].id,
        recipient_id=integrity_setup["recipient1"].id,
        device_id=integrity_setup["device"].id,
        amount=Decimal("10000.00"),
        payment_method="UPI",
        status=TransactionStatus.PENDING_GUARDIAN_APPROVAL,
        authorization_required=True,
        authorization_status="PENDING",
    )
    db_session.add(txn)
    db_session.commit()

    req = GuardianRequest(
        transaction_id=txn.id,
        trusted_contact_id=integrity_setup["guardian_contact"].id,
        expires_at=datetime.now(timezone.utc),
    )
    db_session.add(req)
    db_session.commit()

    # 1. Guardian approves ₹10,000 transaction
    app_resp = client.post(f"/api/v1/guardian/requests/{req.id}/approve")
    assert app_resp.status_code == 200
    db_session.refresh(req)
    db_session.refresh(txn)
    assert req.outcome == GuardianOutcome.APPROVED
    assert req.integrity_hash is not None
    assert txn.guardian_integrity_hash == req.integrity_hash

    # 2. Tamper transaction details (e.g. increase to ₹80,000)
    txn.amount = Decimal("80000.00")
    db_session.commit()

    # 3. Biometric authorization attempt must detect guardian hash mismatch, reject with 409, and mark guardian request INVALIDATED
    auth_resp = client.post(f"/api/v1/transactions/{txn.id}/authorize", json={"method": "BIOMETRIC"})
    assert auth_resp.status_code == 409
    assert "Transaction details changed after Guardian approval" in auth_resp.json()["detail"]

    db_session.refresh(req)
    db_session.refresh(txn)
    assert req.outcome == GuardianOutcome.INVALIDATED
    assert txn.guardian_integrity_hash is None
    assert txn.status == TransactionStatus.PENDING_GUARDIAN_APPROVAL
