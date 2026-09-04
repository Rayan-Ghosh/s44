"""
Automated unit & integration tests for High-Risk Transaction Authorization,
Backend 403 Bypass Prevention, Native Biometric Integration State,
and Guardian Compatibility.
"""

from decimal import Decimal
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_identifier, hash_password
from app.main import app
from app.models.device import Device
from app.models.enums import RiskDecision, RiskLevel, TransactionStatus
from app.models.recipient import Recipient
from app.models.transaction import Transaction
from app.models.user import User
from app.models.user_contact_info import UserContactInfo
from app.services.session_service import SessionService


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
def setup_data(db_session: Session):
    # User 1
    user1 = User(name="Tx User 1", phone_hash=hash_identifier("+919876543211"), is_verified=True)
    db_session.add(user1)
    db_session.commit()
    db_session.refresh(user1)

    contact1 = UserContactInfo(
        user_id=user1.id,
        phone_encrypted="+919876543211",
        email_encrypted="tx1@avaran.ai",
        password_hash=hash_password("Password@12345"),
    )
    db_session.add(contact1)

    # User 2
    user2 = User(name="Tx User 2", phone_hash=hash_identifier("+919876543222"), is_verified=True)
    db_session.add(user2)
    db_session.commit()
    db_session.refresh(user2)

    # Device & Recipient
    dev = Device(device_hash=hash_identifier("dev-test-1"), user_id=user1.id)
    rec = Recipient(recipient_hash=hash_identifier("merchant@upi"), user_id=user1.id, display_name="Merchant Store")
    db_session.add_all([dev, rec])
    db_session.commit()
    db_session.refresh(dev)
    db_session.refresh(rec)

    return {
        "user1": user1,
        "user2": user2,
        "device": dev,
        "recipient": rec,
    }


def test_low_risk_transaction_proceeds_without_authorization(
    client: TestClient, setup_data: dict, db_session: Session
):
    # Create low-risk transaction
    txn = Transaction(
        user_id=setup_data["user1"].id,
        recipient_id=setup_data["recipient"].id,
        device_id=setup_data["device"].id,
        amount=Decimal("150.00"),
        status=TransactionStatus.ALLOWED,
        authorization_required=False,
        authorization_status="NONE",
    )
    db_session.add(txn)
    db_session.commit()
    db_session.refresh(txn)

    # Confirm directly without authorization
    confirm_resp = client.post(f"/api/v1/transactions/{txn.id}/confirm", json={"stage": "PAYMENT_COMPLETED"})
    assert confirm_resp.status_code == 200
    assert confirm_resp.json()["status"] == TransactionStatus.COMPLETED.value


def test_high_risk_transaction_blocks_confirmation_without_authorization(
    client: TestClient, setup_data: dict, db_session: Session
):
    # Create high-risk transaction
    txn = Transaction(
        user_id=setup_data["user1"].id,
        recipient_id=setup_data["recipient"].id,
        device_id=setup_data["device"].id,
        amount=Decimal("45000.00"),
        status=TransactionStatus.PENDING_AUTHORIZATION,
        authorization_required=True,
        authorization_status="PENDING",
    )
    db_session.add(txn)
    db_session.commit()
    db_session.refresh(txn)

    # Attempt to confirm without prior authorization -> MUST return HTTP 403 Forbidden
    confirm_resp = client.post(f"/api/v1/transactions/{txn.id}/confirm", json={"stage": "PAYMENT_COMPLETED"})
    assert confirm_resp.status_code == 403
    assert "High-risk transaction requires biometric authorization" in confirm_resp.json()["detail"]


def test_high_risk_transaction_authorizes_and_completes(
    client: TestClient, setup_data: dict, db_session: Session
):
    txn = Transaction(
        user_id=setup_data["user1"].id,
        recipient_id=setup_data["recipient"].id,
        device_id=setup_data["device"].id,
        amount=Decimal("50000.00"),
        status=TransactionStatus.PENDING_AUTHORIZATION,
        authorization_required=True,
        authorization_status="PENDING",
    )
    db_session.add(txn)
    db_session.commit()
    db_session.refresh(txn)

    # Authorize transaction with Biometrics
    auth_resp = client.post(
        f"/api/v1/transactions/{txn.id}/authorize",
        json={"method": "BIOMETRIC"},
    )
    assert auth_resp.status_code == 200
    data = auth_resp.json()
    assert data["authorization_status"] == "AUTHORIZED"
    assert data["status"] == TransactionStatus.AUTHORIZED.value

    # Now confirm the authorized transaction
    confirm_resp = client.post(f"/api/v1/transactions/{txn.id}/confirm", json={"stage": "PAYMENT_COMPLETED"})
    assert confirm_resp.status_code == 200
    assert confirm_resp.json()["status"] == TransactionStatus.COMPLETED.value


def test_authorization_isolation_between_transactions(
    client: TestClient, setup_data: dict, db_session: Session
):
    # Tx 1 & Tx 2 both high risk
    txn1 = Transaction(
        user_id=setup_data["user1"].id,
        recipient_id=setup_data["recipient"].id,
        device_id=setup_data["device"].id,
        amount=Decimal("30000.00"),
        status=TransactionStatus.PENDING_AUTHORIZATION,
        authorization_required=True,
        authorization_status="PENDING",
    )
    txn2 = Transaction(
        user_id=setup_data["user1"].id,
        recipient_id=setup_data["recipient"].id,
        device_id=setup_data["device"].id,
        amount=Decimal("35000.00"),
        status=TransactionStatus.PENDING_AUTHORIZATION,
        authorization_required=True,
        authorization_status="PENDING",
    )
    db_session.add_all([txn1, txn2])
    db_session.commit()

    # Authorize only Tx 1
    client.post(f"/api/v1/transactions/{txn1.id}/authorize", json={"method": "BIOMETRIC"})

    # Tx 1 confirms successfully
    assert client.post(f"/api/v1/transactions/{txn1.id}/confirm", json={"stage": "PAYMENT_COMPLETED"}).status_code == 200

    # Tx 2 must STILL be blocked (cannot reuse Tx 1's authorization)
    assert client.post(f"/api/v1/transactions/{txn2.id}/confirm", json={"stage": "PAYMENT_COMPLETED"}).status_code == 403


def test_terminal_transaction_rejects_authorization(
    client: TestClient, setup_data: dict, db_session: Session
):
    # Cancelled transaction
    txn = Transaction(
        user_id=setup_data["user1"].id,
        recipient_id=setup_data["recipient"].id,
        device_id=setup_data["device"].id,
        amount=Decimal("20000.00"),
        status=TransactionStatus.CANCELLED,
        authorization_required=True,
        authorization_status="PENDING",
    )
    db_session.add(txn)
    db_session.commit()

    # Attempting to authorize a cancelled transaction must fail with 400
    auth_resp = client.post(f"/api/v1/transactions/{txn.id}/authorize", json={"method": "BIOMETRIC"})
    assert auth_resp.status_code == 400
    assert "Cannot authorize a transaction in terminal status" in auth_resp.json()["detail"]


def test_guardian_pending_transaction_requires_guardian_first(
    client: TestClient, setup_data: dict, db_session: Session
):
    txn = Transaction(
        user_id=setup_data["user1"].id,
        recipient_id=setup_data["recipient"].id,
        device_id=setup_data["device"].id,
        amount=Decimal("90000.00"),
        status=TransactionStatus.PENDING_GUARDIAN_APPROVAL,
        authorization_required=True,
        authorization_status="PENDING",
    )
    db_session.add(txn)
    db_session.commit()

    # Attempt to bypass guardian with biometric auth -> rejected
    auth_resp = client.post(f"/api/v1/transactions/{txn.id}/authorize", json={"method": "BIOMETRIC"})
    assert auth_resp.status_code == 400
    assert "Guardian approval is required before biometric authorization" in auth_resp.json()["detail"]
