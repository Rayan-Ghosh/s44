"""Relationship integrity across the ORM models — independent of the API
layer, so a broken relationship() is caught even if no router exercises it
yet (e.g. voice_analysis, fraud_cases, model_predictions, audit_logs)."""

from decimal import Decimal

from app.models.device import Device
from app.models.enums import RiskDecision, RiskLevel, TransactionStatus
from app.models.recipient import Recipient
from app.models.risk_factor import RiskFactor
from app.models.risk_score import RiskScore
from app.models.transaction import Transaction
from app.models.user import User
from app.models.voice_analysis import VoiceAnalysis


def test_user_device_recipient_transaction_relationships(db_session):
    user = User(name="Test User", phone_hash="hash-1")
    db_session.add(user)
    db_session.commit()

    device = Device(user_id=user.id, device_hash="device-hash-1")
    recipient = Recipient(user_id=user.id, recipient_hash="recipient-hash-1")
    db_session.add_all([device, recipient])
    db_session.commit()

    transaction = Transaction(
        user_id=user.id,
        recipient_id=recipient.id,
        device_id=device.id,
        amount=Decimal("100.00"),
        status=TransactionStatus.PENDING,
    )
    db_session.add(transaction)
    db_session.commit()

    db_session.refresh(user)
    db_session.refresh(device)
    db_session.refresh(recipient)

    assert transaction.user.id == user.id
    assert transaction.device.id == device.id
    assert transaction.recipient.id == recipient.id
    assert user.transactions[0].id == transaction.id
    assert device.transactions[0].id == transaction.id
    assert recipient.transactions[0].id == transaction.id


def test_risk_score_and_risk_factor_relationship(db_session):
    user = User(name="Test User 2", phone_hash="hash-2")
    db_session.add(user)
    db_session.commit()

    device = Device(user_id=user.id, device_hash="device-hash-2")
    recipient = Recipient(user_id=user.id, recipient_hash="recipient-hash-2")
    db_session.add_all([device, recipient])
    db_session.commit()

    transaction = Transaction(
        user_id=user.id,
        recipient_id=recipient.id,
        device_id=device.id,
        amount=Decimal("500.00"),
    )
    db_session.add(transaction)
    db_session.commit()

    risk_score = RiskScore(
        transaction_id=transaction.id,
        final_score=72.0,
        risk_level=RiskLevel.HIGH,
        decision=RiskDecision.CONFIRM_OR_CANCEL,
    )
    db_session.add(risk_score)
    db_session.commit()

    risk_factor = RiskFactor(
        risk_score_id=risk_score.id,
        factor_type="device",
        factor_name="new_device",
        contribution=25.0,
        explanation="First transaction from this device.",
    )
    db_session.add(risk_factor)
    db_session.commit()

    db_session.refresh(risk_score)
    assert risk_score.transaction.id == transaction.id
    assert risk_score.risk_factors[0].factor_name == "new_device"
    assert risk_factor.risk_score.id == risk_score.id


def test_voice_analysis_transaction_link_is_optional(db_session):
    # spec §26 Scenario 3: the voice call can precede the transaction, so
    # voice_analysis.transaction_id must be able to start out unset.
    voice = VoiceAnalysis(
        transcript_hash="transcript-hash-1",
        urgency_score=0.9,
        threat_score=0.8,
        authority_score=0.7,
        financial_request_score=0.9,
        coercion_score=0.85,
        overall_score=0.88,
    )
    db_session.add(voice)
    db_session.commit()

    assert voice.transaction_id is None
    assert voice.transaction is None
