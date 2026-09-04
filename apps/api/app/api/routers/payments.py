"""
/api/v1/payments — AVARAN PAY spec-shaped payment lifecycle surface
(spec §3, §11). Backs onto the same models/services as the pre-existing
/api/v1/transactions and /api/v1/guardian routers — see
app/services/payment_lifecycle_service.py and app/services/risk_service.py
for the shared implementation.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_identifier
from app.models.enums import RiskLevel
from app.models.enums import TransactionStatus as S
from app.repositories import guardian_repository, risk_repository, transaction_repository
from app.schemas.payment import ConfirmPaymentRequest, LaunchUpiRequest, PaymentPrepareRequest
from app.schemas.transaction import TransactionCreate, TransactionRead
from app.services import notification_service, payment_lifecycle_service, risk_service, transaction_service
from app.services.exceptions import TransactionNotFoundError, UserNotFoundError
from app.services.payment_lifecycle_service import (
    AuthorizationExpiredError,
    AuthorizationRequiredError,
    PaymentMismatchError,
    PaymentNotEligibleError,
    TransactionIntegrityViolationError,
)
from app.services.security_audit_service import SecurityAuditService
from app.services.transaction_state_machine import transition

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])


@router.post("/prepare", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
def prepare_payment(payload: PaymentPrepareRequest, db: Session = Depends(get_db)) -> TransactionRead:
    """Canonical payment intake (spec §3): normalizes QR / UPI_ID / MOBILE /
    PAYMENT_REQUEST / LINK input into one transaction, deduped by
    `client_request_id` (idempotency key) when provided."""
    if payload.client_request_id:
        existing = (
            db.query(transaction_repository.Transaction)
            .filter(
                transaction_repository.Transaction.user_id == payload.user_id,
                transaction_repository.Transaction.idempotency_key == payload.client_request_id,
            )
            .first()
        )
        if existing:
            return existing

    recipient_identifier = payload.upi_id or payload.phone_number
    try:
        txn = transaction_service.create_transaction(
            db,
            TransactionCreate(
                user_id=payload.user_id,
                recipient_identifier=recipient_identifier,
                recipient_display_name=payload.recipient_name,
                device_identifier=payload.device_identifier,
                device_name=payload.device_name,
                device_type=payload.device_type,
                amount=payload.amount,
                location=payload.location,
                payment_method="UPI",
            ),
        )
    except UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    txn.source = payload.source
    txn.idempotency_key = payload.client_request_id
    db.commit()
    db.refresh(txn)

    SecurityAuditService.log_event(
        "PAYMENT_INITIATED", user_id=txn.user_id, transaction_id=txn.id, details={"source": payload.source}, db=db
    )
    SecurityAuditService.log_event(
        "PAYMENT_DATA_VALIDATED", user_id=txn.user_id, transaction_id=txn.id, db=db
    )

    return txn


@router.post("/{transaction_id}/analyse")
def analyse_payment(transaction_id: int, db: Session = Depends(get_db)) -> dict:
    """Run and store risk analysis (spec §4, §11). When the result is HIGH
    risk and the user has a linked Guardian, automatically creates the
    Guardian request (spec §6) — the transaction becomes eligible for UPI
    launch only after that request is approved."""
    txn = transaction_repository.get_transaction(db, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")

    try:
        decision_package = risk_service.evaluate(db, transaction_id)
    except Exception:
        raise HTTPException(status_code=503, detail="Risk scoring is temporarily unavailable. Please try again.")

    SecurityAuditService.log_event(
        "RISK_EVALUATED",
        user_id=txn.user_id,
        transaction_id=transaction_id,
        details={"risk_level": decision_package.get("risk_level"), "risk_score": decision_package.get("risk_score")},
        db=db,
    )

    guardian_required = False
    guardian_request_id = None
    if decision_package.get("risk_level") == "HIGH":
        notification_service.notify(
            db,
            user_id=txn.user_id,
            type="HIGH_RISK_DETECTED",
            title="High-risk payment detected",
            body=f"We flagged your ₹{txn.amount} payment as high risk.",
            transaction_id=txn.id,
        )
        existing_pending = guardian_repository.get_pending_request_for_transaction(db, txn.id)
        contacts = guardian_repository.get_trusted_contacts_by_user(db, txn.user_id)
        if existing_pending:
            guardian_required = True
            guardian_request_id = existing_pending.id
        elif contacts:
            guardian_required = True
            req = guardian_repository.create_guardian_request(
                db, transaction_id=txn.id, trusted_contact_id=contacts[0].id, expires_in_seconds=120
            )
            db.refresh(txn)
            txn = transition(db, txn, S.PENDING_GUARDIAN_APPROVAL, idempotent_ok=True)
            guardian_request_id = req.id
            SecurityAuditService.log_event(
                "GUARDIAN_REQUESTED",
                user_id=txn.user_id,
                transaction_id=txn.id,
                details={"trusted_contact_id": contacts[0].id},
                db=db,
            )

    return {
        "transaction_id": txn.id,
        "risk_score": decision_package.get("risk_score"),
        "risk_label": decision_package.get("risk_level"),
        "recommended_action": decision_package.get("decision"),
        "guardian_required": guardian_required,
        "guardian_request_id": guardian_request_id,
        "biometric_required": bool(txn.authorization_required),
        "risk_factors": decision_package.get("plain_language_reasons", []),
    }


@router.post("/{transaction_id}/launch-upi")
def launch_upi(transaction_id: int, payload: LaunchUpiRequest, db: Session = Depends(get_db)) -> dict:
    try:
        txn = payment_lifecycle_service.launch_upi(
            db,
            transaction_id,
            app=payload.app,
            amount=payload.amount,
            recipient_identifier=payload.recipient_identifier,
        )
    except TransactionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PaymentMismatchError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except PaymentNotEligibleError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {
        "transaction_id": transaction_id,
        "status": txn.status.value,
        "upi_app": txn.upi_app,
        "upi_launch_count": txn.upi_launch_count,
    }


@router.post("/{transaction_id}/confirm")
def confirm_payment(transaction_id: int, payload: ConfirmPaymentRequest | None = None, db: Session = Depends(get_db)) -> dict:
    try:
        result = payment_lifecycle_service.confirm(
            db, transaction_id, utr_reference=payload.utr_reference if payload else None
        )
    except TransactionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AuthorizationExpiredError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except AuthorizationRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except TransactionIntegrityViolationError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except PaymentNotEligibleError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {
        "transaction_id": transaction_id,
        "status": result.transaction.status.value,
        "duplicate": result.duplicate,
        "utr_reference": result.transaction.utr_reference,
    }


@router.post("/{transaction_id}/cancel")
def cancel_payment(transaction_id: int, db: Session = Depends(get_db)) -> dict:
    try:
        result = payment_lifecycle_service.cancel(db, transaction_id)
    except TransactionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PaymentNotEligibleError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {"transaction_id": transaction_id, "status": result.transaction.status.value}


@router.get("/{transaction_id}", response_model=TransactionRead)
def get_payment(transaction_id: int, db: Session = Depends(get_db)) -> TransactionRead:
    txn = transaction_repository.get_transaction(db, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")
    return txn


@router.get("/{transaction_id}/status")
def get_payment_status(transaction_id: int, db: Session = Depends(get_db)) -> dict:
    txn = transaction_repository.get_transaction(db, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")
    return {
        "transaction_id": txn.id,
        "status": txn.status.value,
        "created_at": txn.timestamp.isoformat() if txn.timestamp else None,
        "upi_app": txn.upi_app,
        "upi_launch_count": txn.upi_launch_count,
        "utr_reference": txn.utr_reference,
    }
