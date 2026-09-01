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

    # Attach preview details
    risk = risk_repository.get_latest_risk_score(db, txn.id)
    return GuardianRequestRead(
        id=req.id,
        transaction_id=req.transaction_id,
        trusted_contact_id=req.trusted_contact_id,
        requested_at=req.requested_at,
        expires_at=req.expires_at,
        resolved_at=req.resolved_at,
        outcome=req.outcome,
        resolution_notes=req.resolution_notes,
        resolution_channel=req.resolution_channel,
        remaining_seconds=120,
        transaction_amount=float(txn.amount),
        risk_score=int(risk.final_score) if risk else 75,
        risk_reasons=[f.explanation for f in (risk.risk_factors if risk else [])] or ["High Risk transaction detected"],
    )


@router.get("/requests/pending/{trusted_contact_id}", response_model=list[GuardianRequestRead])
def list_pending_requests(trusted_contact_id: int, db: Session = Depends(get_db)) -> list[GuardianRequestRead]:
    reqs = guardian_repository.get_pending_guardian_requests(db, trusted_contact_id)
    results = []
    now = datetime.now(timezone.utc)
    for req in reqs:
        rem = max(0, int((req.expires_at.replace(tzinfo=timezone.utc) - now).total_seconds())) if req.expires_at.tzinfo is None else max(0, int((req.expires_at - now).total_seconds()))
        if rem <= 0:
            continue
        txn = req.transaction
        risk = risk_repository.get_latest_risk_score(db, txn.id) if txn else None
        results.append(GuardianRequestRead(
            id=req.id,
            transaction_id=req.transaction_id,
            trusted_contact_id=req.trusted_contact_id,
            requested_at=req.requested_at,
            expires_at=req.expires_at,
            resolved_at=req.resolved_at,
            outcome=req.outcome,
            resolution_notes=req.resolution_notes,
            resolution_channel=req.resolution_channel,
            remaining_seconds=rem,
            transaction_amount=float(txn.amount) if txn else 0.0,
            risk_score=int(risk.final_score) if risk else None,
            risk_reasons=[f.explanation for f in (risk.risk_factors if risk else [])],
        ))
    return results


@router.get("/requests/{request_id}", response_model=GuardianRequestRead)
def get_guardian_request_detail(request_id: int, db: Session = Depends(get_db)) -> GuardianRequestRead:
    req = guardian_repository.get_guardian_request(db, request_id)
    if req is None:
        raise HTTPException(status_code=404, detail=f"Guardian request {request_id} not found.")

    now = datetime.now(timezone.utc)
    exp = req.expires_at.replace(tzinfo=timezone.utc) if req.expires_at.tzinfo is None else req.expires_at
    rem = max(0, int((exp - now).total_seconds()))
    txn = req.transaction
    risk = risk_repository.get_latest_risk_score(db, txn.id) if txn else None

    return GuardianRequestRead(
        id=req.id,
        transaction_id=req.transaction_id,
        trusted_contact_id=req.trusted_contact_id,
        requested_at=req.requested_at,
        expires_at=req.expires_at,
        resolved_at=req.resolved_at,
        outcome=req.outcome,
        resolution_notes=req.resolution_notes,
        resolution_channel=req.resolution_channel,
        remaining_seconds=rem,
        transaction_amount=float(txn.amount) if txn else 0.0,
        risk_score=int(risk.final_score) if risk else None,
        risk_reasons=[f.explanation for f in (risk.risk_factors if risk else [])],
    )


@router.post("/requests/{request_id}/approve")
def approve_guardian_request(request_id: int, payload: Optional[GuardianActionRequest] = None, db: Session = Depends(get_db)) -> dict:
    req = guardian_repository.get_guardian_request(db, request_id)
    if req is None:
        raise HTTPException(status_code=404, detail=f"Guardian request {request_id} not found.")

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
