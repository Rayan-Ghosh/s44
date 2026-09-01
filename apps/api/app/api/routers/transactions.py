from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import FraudCaseStatus, GuardianOutcome, TransactionStatus
from app.models.fraud_case import FraudCase
from app.repositories import guardian_repository, transaction_repository
from app.schemas.transaction import TransactionCreate, TransactionRead
from app.services import transaction_service
from app.services.exceptions import TransactionNotFoundError, UserNotFoundError
from app.services.security_audit_service import SecurityAuditService
from app.services.session_service import SessionService
from app.services.transaction_integrity_service import TransactionIntegrityService

router = APIRouter(prefix="/api/v1/transactions", tags=["transactions"])


class AuthorizeTransactionRequest(BaseModel):
    method: Optional[str] = Field(default="BIOMETRIC", description="Authorization method: BIOMETRIC or DEVICE_CREDENTIAL")


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return authorization


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreate, db: Session = Depends(get_db)
) -> TransactionRead:
    try:
        return transaction_service.create_transaction(db, payload)
    except UserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get("/{transaction_id}")
def get_transaction(transaction_id: int, db: Session = Depends(get_db)) -> dict:
    try:
        txn = transaction_service.get_transaction(db, transaction_id)
        from app.api.routers.users import _get_or_compute_risk_score
        latest_risk = _get_or_compute_risk_score(db, txn)
        factors = []
        if latest_risk and latest_risk.risk_factors:
            for rf in latest_risk.risk_factors:
                factors.append({
                    "factor_type": getattr(rf, "factor_type", "rule"),
                    "factor_name": getattr(rf, "factor_name", "Risk Factor"),
                    "contribution": float(rf.contribution),
                    "explanation": rf.explanation,
                })

        final_sc = float(latest_risk.final_score) if latest_risk else 0.0
        from app.api.routers.users import get_risk_level_from_score
        return {
            "id": txn.id,
            "user_id": txn.user_id,
            "recipient_id": txn.recipient_id,
            "device_id": txn.device_id,
            "amount": str(txn.amount),
            "timestamp": txn.timestamp.isoformat() if txn.timestamp else "",
            "location": txn.location,
            "payment_method": txn.payment_method or "UPI",
            "merchant": txn.recipient.display_name if (txn.recipient and txn.recipient.display_name) else "UPI Merchant",
            "status": txn.status.value if hasattr(txn.status, "value") else str(txn.status),
            "authorization_required": txn.authorization_required,
            "authorization_status": txn.authorization_status or "NONE",
            "authorized_at": txn.authorized_at.isoformat() if txn.authorized_at else None,
            "authorization_method": txn.authorization_method,
            "risk_level": get_risk_level_from_score(final_sc),
            "risk_score": final_sc,
            "risk_factors": factors,
            "reasons": [f["explanation"] for f in factors if f.get("explanation")],
        }
    except TransactionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post("/{transaction_id}/authorize")
def authorize_transaction(
    transaction_id: int,
    payload: Optional[AuthorizeTransactionRequest] = None,
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    db: Session = Depends(get_db),
) -> dict:
    """
    Authorizes a high-risk transaction following biometric / device credential authentication.
    Validates ownership, verifies guardian integrity if applicable, and binds a cryptographic integrity hash.
    """
    txn = transaction_repository.get_transaction(db, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")

    # Validate session if Bearer token is provided
    raw_token = _extract_bearer_token(authorization)
    if raw_token:
        is_valid, session, err_msg = SessionService.validate_session_token(
            db=db, raw_token=raw_token, device_id=x_device_id
        )
        if not is_valid or not session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=err_msg or "Invalid session token.",
            )
        if session.user_id != txn.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to approve transactions for another user.",
            )

    # Check terminal states
    if txn.status in (
        TransactionStatus.CONFIRMED,
        TransactionStatus.CANCELLED,
        TransactionStatus.REPORTED,
        TransactionStatus.GUARDIAN_REJECTED,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot authorize a transaction in terminal status {txn.status.value}.",
        )

    # If guardian approval is active and pending, guardian approval must occur first
    if txn.status == TransactionStatus.PENDING_GUARDIAN_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Guardian approval is required before biometric authorization.",
        )

    # Verify Guardian integrity hash if Guardian approval was previously granted
    if txn.guardian_integrity_hash:
        if not TransactionIntegrityService.verify_integrity(txn, txn.guardian_integrity_hash):
            # Invalidate guardian approval
            txn.guardian_integrity_hash = None
            txn.authorization_status = "PENDING"
            txn.integrity_hash = None
            txn.status = TransactionStatus.PENDING_GUARDIAN_APPROVAL
            for req in txn.guardian_requests:
                if req.outcome == GuardianOutcome.APPROVED:
                    req.outcome = GuardianOutcome.INVALIDATED
                    req.resolution_notes = "Guardian approval invalidated due to transaction details modification."
            db.commit()

            SecurityAuditService.log_event(
                "GUARDIAN_INVALIDATED",
                user_id=txn.user_id,
                transaction_id=txn.id,
                details={"reason": "transaction details modified prior to authorization"},
            )

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Transaction details changed after Guardian approval. Previous approval has been invalidated and the transaction must be reviewed again.",
            )

    auth_method = (payload.method if payload and payload.method else "BIOMETRIC").upper()
    if auth_method not in ("BIOMETRIC", "DEVICE_CREDENTIAL"):
        auth_method = "BIOMETRIC"

    now = datetime.now(timezone.utc)
    # Compute and bind authorization integrity hash
    auth_integrity_hash = TransactionIntegrityService.compute_integrity_hash(txn)
    txn.integrity_hash = auth_integrity_hash
    txn.authorization_status = "AUTHORIZED"
    txn.authorized_at = now
    txn.authorization_method = auth_method
    txn.status = TransactionStatus.AUTHORIZED
    db.commit()

    SecurityAuditService.log_event(
        "TRANSACTION_AUTHORIZED",
        user_id=txn.user_id,
        transaction_id=txn.id,
        details={"method": auth_method},
    )

    return {
        "transaction_id": transaction_id,
        "status": TransactionStatus.AUTHORIZED.value,
        "authorization_status": "AUTHORIZED",
        "authorized_at": now.isoformat(),
        "authorization_method": auth_method,
        "integrity_hash": auth_integrity_hash,
        "message": "High-risk transaction authorized successfully.",
    }


@router.post("/{transaction_id}/confirm")
def confirm_transaction(transaction_id: int, db: Session = Depends(get_db)) -> dict:
    """User confirms payment after review and required authorization with integrity validation."""
    txn = transaction_repository.get_transaction(db, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")

    if txn.status in (
        TransactionStatus.CANCELLED,
        TransactionStatus.REPORTED,
        TransactionStatus.GUARDIAN_REJECTED,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot confirm a transaction in terminal status {txn.status.value}.",
        )

    # Authoritative Backend Enforcement: High-risk payments awaiting guardian approval cannot be confirmed directly
    if txn.status == TransactionStatus.PENDING_GUARDIAN_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction is awaiting trusted guardian approval and cannot be confirmed directly.",
        )

    pending_req = guardian_repository.get_pending_request_for_transaction(db, txn.id)
    if pending_req:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Transaction is awaiting trusted contact approval.",
        )

    # Authoritative Backend Enforcement: High-risk payments MUST be authorized
    if txn.authorization_required:
        if txn.authorization_status != "AUTHORIZED":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="High-risk transaction requires biometric authorization before confirmation.",
            )

        # Cryptographic Integrity Verification: Ensure no parameters changed after authorization
        if not TransactionIntegrityService.verify_integrity(txn, txn.integrity_hash):
            # Invalidate authorization and any guardian approvals atomically
            txn.authorization_status = "PENDING"
            txn.integrity_hash = None
            txn.guardian_integrity_hash = None
            txn.status = TransactionStatus.PENDING_AUTHORIZATION
            for req in txn.guardian_requests:
                if req.outcome == GuardianOutcome.APPROVED:
                    req.outcome = GuardianOutcome.INVALIDATED
                    req.resolution_notes = "Guardian approval invalidated due to transaction details modification."
            db.commit()

            SecurityAuditService.log_event(
                "TRANSACTION_INTEGRITY_VIOLATION",
                user_id=txn.user_id,
                transaction_id=txn.id,
                details={"action": "confirmation_rejected_authorization_invalidated"},
            )

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Transaction details changed after security approval. Previous authorization has been invalidated and the transaction must be reviewed again.",
            )

    txn.status = TransactionStatus.CONFIRMED
    db.commit()

    return {
        "transaction_id": transaction_id,
        "status": TransactionStatus.CONFIRMED.value,
        "message": "Payment confirmed and released.",
    }


@router.post("/{transaction_id}/cancel")
def cancel_transaction(transaction_id: int, db: Session = Depends(get_db)) -> dict:
    """User cancels payment during hold window."""
    txn = transaction_repository.get_transaction(db, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")
    transaction_repository.update_transaction_status(db, transaction_id, TransactionStatus.CANCELLED)
    return {
        "transaction_id": transaction_id,
        "status": TransactionStatus.CANCELLED.value,
        "message": "Payment cancelled. Money remains in your account.",
    }


@router.post("/{transaction_id}/report")
def report_transaction(
    transaction_id: int,
    reason: Optional[str] = "Suspected fraud reported by user",
    db: Session = Depends(get_db),
) -> dict:
    """User reports suspicious payment / scam attempt."""
    txn = transaction_repository.get_transaction(db, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")
    transaction_repository.update_transaction_status(db, transaction_id, TransactionStatus.REPORTED)

    fraud_case = FraudCase(
        transaction_id=transaction_id,
        reviewer="user_report",
        review_notes=f"User Report: {reason}",
        status=FraudCaseStatus.OPEN,
    )
    db.add(fraud_case)
    db.commit()

    return {
        "transaction_id": transaction_id,
        "status": TransactionStatus.REPORTED.value,
        "case_id": fraud_case.id,
        "message": "Payment reported and fraud case opened for investigation.",
    }
