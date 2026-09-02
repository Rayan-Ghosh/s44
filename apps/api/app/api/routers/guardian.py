"""
/api/v1/guardian — Guardian / Family Shield Subsystem endpoints (spec §6).
"""

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_identifier, mask_phone
from app.models.enums import GuardianOutcome, TransactionStatus
from app.repositories import guardian_repository, risk_repository, transaction_repository, user_repository
from app.schemas.guardian import (
    GuardianActionRequest,
    GuardianRequestCreate,
    GuardianRequestRead,
    TrustedContactCreate,
    TrustedContactRead,
    UserOverrideRequest,
)

router = APIRouter(prefix="/api/v1/guardian", tags=["guardian"])


@router.post("/trusted-contacts", response_model=TrustedContactRead, status_code=status.HTTP_201_CREATED)
def add_trusted_contact(payload: TrustedContactCreate, db: Session = Depends(get_db)) -> TrustedContactRead:
    if user_repository.get_user(db, payload.user_id) is None:
        raise HTTPException(status_code=404, detail=f"User {payload.user_id} not found.")

    contact_phone_hash = hash_identifier(payload.phone_number)
    phone_masked = mask_phone(payload.phone_number)

    return guardian_repository.create_trusted_contact(
        db,
        user_id=payload.user_id,
        contact_name=payload.contact_name,
        contact_phone_hash=contact_phone_hash,
        phone_masked=phone_masked,
        relationship=payload.relationship,
        guardian_user_id=payload.guardian_user_id,
        phone_raw=payload.phone_number,
    )


@router.get("/trusted-contacts/{user_id}", response_model=list[TrustedContactRead])
def get_user_trusted_contacts(user_id: int, db: Session = Depends(get_db)) -> list[TrustedContactRead]:
    return guardian_repository.get_trusted_contacts_by_user(db, user_id)


@router.post("/requests", response_model=GuardianRequestRead, status_code=status.HTTP_201_CREATED)
def trigger_guardian_request(payload: GuardianRequestCreate, db: Session = Depends(get_db)) -> GuardianRequestRead:
    txn = transaction_repository.get_transaction(db, payload.transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {payload.transaction_id} not found.")

    contact_id = payload.trusted_contact_id
    if not contact_id:
        contacts = guardian_repository.get_trusted_contacts_by_user(db, txn.user_id)
        if not contacts:
            raise HTTPException(status_code=400, detail="User has no enrolled trusted contacts.")
        contact_id = contacts[0].id

    req = guardian_repository.create_guardian_request(
        db, transaction_id=txn.id, trusted_contact_id=contact_id, expires_in_seconds=120
    )
    transaction_repository.update_transaction_status(db, txn.id, TransactionStatus.PENDING_GUARDIAN_APPROVAL)
    return _serialize_pending_requests(db, [req])[0]

def _get_sender_masked_phone(db: Session, sender) -> Optional[str]:
    if not sender:
        return None
    from app.models.user_contact_info import UserContactInfo
    from app.core.contact_encryption import decrypt_field
    from app.core.security import mask_phone
    contact = db.query(UserContactInfo).filter(UserContactInfo.user_id == sender.id).first()
    if contact and contact.phone_encrypted:
        try:
            dec = decrypt_field(contact.phone_encrypted)
            return mask_phone(dec)
        except Exception:
            pass
    return None


def _check_and_expire_request(db: Session, req) -> bool:
    """Check if a PENDING guardian request has passed its authoritative expires_at timestamp.
    If expired, atomically transition to TIMEOUT and mark the transaction as GUARDIAN_REJECTED.
    """
    if req is None or req.outcome != GuardianOutcome.PENDING:
        return False
    now = datetime.now(timezone.utc)
    exp = req.expires_at.replace(tzinfo=timezone.utc) if req.expires_at.tzinfo is None else req.expires_at
    if now >= exp:
        req.outcome = GuardianOutcome.TIMEOUT
        req.resolved_at = now
        req.resolution_notes = "Guardian approval window expired after 120 seconds."
        if req.transaction and req.transaction.status == TransactionStatus.PENDING_GUARDIAN_APPROVAL:
            req.transaction.status = TransactionStatus.GUARDIAN_REJECTED
        db.commit()
        db.refresh(req)
        return True
    return False


def _serialize_pending_requests(db: Session, reqs: list) -> list[GuardianRequestRead]:
    """Shared helper: convert a list of pending GuardianRequest ORM rows into
    GuardianRequestRead responses with dynamic sender and recipient details,
    filtering out any that have already expired and auto-resolving them."""
    results = []
    now = datetime.now(timezone.utc)
    for req in reqs:
        if _check_and_expire_request(db, req) or req.outcome != GuardianOutcome.PENDING:
            continue
        exp = req.expires_at.replace(tzinfo=timezone.utc) if req.expires_at.tzinfo is None else req.expires_at
        rem = max(0, int((exp - now).total_seconds()))
        if rem <= 0:
            continue
        txn = req.transaction
        risk = risk_repository.get_latest_risk_score(db, txn.id) if txn else None
        sender = txn.user if txn else None
        recipient = txn.recipient if txn else None
        sender_name = sender.name if sender else "Family Member"
        sender_phone_masked = _get_sender_masked_phone(db, sender)
        recipient_name = recipient.display_name if (recipient and recipient.display_name) else (txn.payment_method if txn and txn.payment_method else "UPI Merchant")

        req_at = req.requested_at.replace(tzinfo=timezone.utc) if req.requested_at.tzinfo is None else req.requested_at
        res_at = req.resolved_at.replace(tzinfo=timezone.utc) if (req.resolved_at and req.resolved_at.tzinfo is None) else req.resolved_at

        results.append(GuardianRequestRead(
            id=req.id,
            transaction_id=req.transaction_id,
            trusted_contact_id=req.trusted_contact_id,
            requested_at=req_at,
            expires_at=exp,
            resolved_at=res_at,
            outcome=req.outcome,
            resolution_notes=req.resolution_notes,
            resolution_channel=req.resolution_channel,
            remaining_seconds=rem,
            transaction_amount=float(txn.amount) if txn else 0.0,
            risk_score=int(risk.final_score) if risk else None,
            risk_reasons=[f.explanation for f in (risk.risk_factors if risk else [])],
            sender_name=sender_name,
            sender_phone_masked=sender_phone_masked,
            recipient_name=recipient_name,
        ))
    return results


@router.get("/requests/pending/{trusted_contact_id}", response_model=list[GuardianRequestRead])
def list_pending_requests(trusted_contact_id: int, db: Session = Depends(get_db)) -> list[GuardianRequestRead]:
    reqs = guardian_repository.get_pending_guardian_requests(db, trusted_contact_id)
    return _serialize_pending_requests(db, reqs)


@router.get("/requests/by-guardian-user/{guardian_user_id}", response_model=list[GuardianRequestRead])
def list_pending_requests_by_guardian_user(
    guardian_user_id: int, db: Session = Depends(get_db)
) -> list[GuardianRequestRead]:
    """Return all non-expired PENDING GuardianRequests that belong to any
    guardian identified by their own Avaran user account (guardian_user_id).

    Flow:
      1. Resolve TrustedContact rows where TrustedContact.guardian_user_id == guardian_user_id.
      2. Collect all pending GuardianRequests across those contact IDs.
      3. Serialise and filter expired ones with dynamic sender/recipient details.
    """
    from app.models.trusted_contact import TrustedContact

    user = user_repository.get_user(db, guardian_user_id)
    if user is None:
        raise HTTPException(status_code=404, detail=f"Guardian user {guardian_user_id} not found.")

    # Automatically resolve & link any unlinked contacts matching this guardian's phone
    guardian_repository.link_unbound_trusted_contacts_for_user(
        db, user_id=guardian_user_id, phone_hash=user.phone_hash
    )

    contacts = (
        db.query(TrustedContact)
        .filter(TrustedContact.guardian_user_id == guardian_user_id)
        .all()
    )

    if not contacts:
        return []

    all_reqs = []
    for contact in contacts:
        all_reqs.extend(guardian_repository.get_pending_guardian_requests(db, contact.id))

    return _serialize_pending_requests(db, all_reqs)


@router.get("/requests/by-transaction/{transaction_id}", response_model=Optional[GuardianRequestRead])
def get_guardian_request_by_transaction(transaction_id: int, db: Session = Depends(get_db)) -> Optional[GuardianRequestRead]:
    from app.models.guardian_request import GuardianRequest
    req = (
        db.query(GuardianRequest)
        .filter(GuardianRequest.transaction_id == transaction_id)
        .order_by(GuardianRequest.requested_at.desc())
        .first()
    )
    if not req:
        return None
    _check_and_expire_request(db, req)
    return get_guardian_request_detail(req.id, db)


@router.get("/requests/{request_id}", response_model=GuardianRequestRead)
def get_guardian_request_detail(request_id: int, db: Session = Depends(get_db)) -> GuardianRequestRead:
    req = guardian_repository.get_guardian_request(db, request_id)
    if req is None:
        raise HTTPException(status_code=404, detail=f"Guardian request {request_id} not found.")

    _check_and_expire_request(db, req)

    now = datetime.now(timezone.utc)
    exp = req.expires_at.replace(tzinfo=timezone.utc) if req.expires_at.tzinfo is None else req.expires_at
    req_at = req.requested_at.replace(tzinfo=timezone.utc) if req.requested_at.tzinfo is None else req.requested_at
    res_at = req.resolved_at.replace(tzinfo=timezone.utc) if (req.resolved_at and req.resolved_at.tzinfo is None) else req.resolved_at
    rem = max(0, int((exp - now).total_seconds())) if req.outcome == GuardianOutcome.PENDING else 0
    txn = req.transaction
    risk = risk_repository.get_latest_risk_score(db, txn.id) if txn else None
    sender = txn.user if txn else None
    recipient = txn.recipient if txn else None
    return GuardianRequestRead(
        id=req.id,
        transaction_id=req.transaction_id,
        trusted_contact_id=req.trusted_contact_id,
        requested_at=req_at,
        expires_at=exp,
        resolved_at=res_at,
        outcome=req.outcome,
        resolution_notes=req.resolution_notes,
        resolution_channel=req.resolution_channel,
        remaining_seconds=rem,
        transaction_amount=float(txn.amount) if txn else 0.0,
        risk_score=int(risk.final_score) if risk else None,
        risk_reasons=[f.explanation for f in (risk.risk_factors if risk else [])],
        sender_name=sender.name if sender else "Family Member",
        sender_phone_masked=_get_sender_masked_phone(db, sender),
        recipient_name=recipient.display_name if (recipient and recipient.display_name) else (txn.payment_method if txn and txn.payment_method else "UPI Merchant"),
    )


@router.post("/requests/{request_id}/approve")
def approve_guardian_request(request_id: int, payload: Optional[GuardianActionRequest] = None, db: Session = Depends(get_db)) -> dict:
    req = guardian_repository.get_guardian_request(db, request_id)
    if req is None:
        raise HTTPException(status_code=404, detail=f"Guardian request {request_id} not found.")

    is_expired = _check_and_expire_request(db, req)
    if is_expired or req.outcome != GuardianOutcome.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Guardian request has expired or has already been resolved and cannot be approved.",
        )

    notes = payload.notes if payload else "Approved by trusted contact"
    guardian_repository.resolve_guardian_request(db, request_id, GuardianOutcome.APPROVED, notes)

    # Compute and bind transaction integrity hash at moment of Guardian approval
    from app.services.security_audit_service import SecurityAuditService
    from app.services.transaction_integrity_service import TransactionIntegrityService
    if req.transaction:
        g_hash = TransactionIntegrityService.compute_integrity_hash(req.transaction)
        req.integrity_hash = g_hash
        req.transaction.guardian_integrity_hash = g_hash
        db.commit()

    SecurityAuditService.log_event(
        "GUARDIAN_APPROVED",
        transaction_id=req.transaction_id,
        details={"trusted_contact_id": req.trusted_contact_id},
    )

    transaction_repository.update_transaction_status(db, req.transaction_id, TransactionStatus.GUARDIAN_APPROVED)
    return {"request_id": request_id, "outcome": GuardianOutcome.APPROVED.value, "message": "Transaction approved by family guardian."}


@router.post("/requests/{request_id}/reject")
def reject_guardian_request(request_id: int, payload: Optional[GuardianActionRequest] = None, db: Session = Depends(get_db)) -> dict:
    req = guardian_repository.get_guardian_request(db, request_id)
    if req is None:
        raise HTTPException(status_code=404, detail=f"Guardian request {request_id} not found.")

    _check_and_expire_request(db, req)
    if req.outcome != GuardianOutcome.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Guardian request is already resolved ({req.outcome.value}).",
        )

    notes = payload.notes if payload else "Rejected by trusted contact due to fraud risk"
    guardian_repository.resolve_guardian_request(db, request_id, GuardianOutcome.REJECTED, notes)

    from app.services.security_audit_service import SecurityAuditService
    SecurityAuditService.log_event(
        "GUARDIAN_REJECTED",
        transaction_id=req.transaction_id,
        details={"trusted_contact_id": req.trusted_contact_id},
    )

    transaction_repository.update_transaction_status(db, req.transaction_id, TransactionStatus.GUARDIAN_REJECTED)
    return {"request_id": request_id, "outcome": GuardianOutcome.REJECTED.value, "message": "Transaction blocked and cancelled by guardian."}


@router.post("/requests/{request_id}/user-override")
def user_override_timeout(request_id: int, payload: UserOverrideRequest, db: Session = Depends(get_db)) -> dict:
    """User friction override with PIN re-entry if 2-min guardian window expires (spec §6.3)."""
    req = guardian_repository.get_guardian_request(db, request_id)
    if req is None:
        raise HTTPException(status_code=404, detail=f"Guardian request {request_id} not found.")

    guardian_repository.resolve_guardian_request(db, request_id, GuardianOutcome.TIMEOUT, "User overrode via PIN")
    transaction_repository.update_transaction_status(db, req.transaction_id, TransactionStatus.GUARDIAN_TIMEOUT_USER_OVERRODE)
    return {"request_id": request_id, "status": TransactionStatus.GUARDIAN_TIMEOUT_USER_OVERRODE.value, "message": "Override verified with PIN. Payment proceeds under user confirmation."}
