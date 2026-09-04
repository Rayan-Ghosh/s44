"""
/api/v1/guardian — Guardian / Family Shield Subsystem endpoints (spec §6).
"""

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_identifier, mask_phone
from app.models.enums import GuardianOutcome, TransactionStatus
from app.repositories import guardian_repository, risk_repository, transaction_repository, user_repository
from app.services import guardian_service, notification_service
from app.schemas.guardian import (
    GuardianActionRequest,
    GuardianRequestCreate,
    GuardianRequestRead,
    TrustedContactCreate,
    TrustedContactRead,
)
from app.services.payment_workflow_guard import (
    enforce_guardian_stage,
    resolve_candidate_stage,
)
from app.services.transaction_state_machine import (
    InvalidTransactionTransition,
    is_terminal,
    transition,
)

router = APIRouter(prefix="/api/v1/guardian", tags=["guardian"])


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return authorization


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
def trigger_guardian_request(
    payload: GuardianRequestCreate,
    x_workflow_stage: Optional[str] = Header(None, alias="X-Workflow-Stage"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    db: Session = Depends(get_db),
) -> GuardianRequestRead:
    body_stage_provided = payload is not None and "stage" in payload.model_fields_set
    body_stage = payload.stage if payload is not None else None

    candidate_stage, stage_provided, conflict_err = resolve_candidate_stage(
        body_stage=body_stage,
        header_stage=x_workflow_stage,
        body_stage_provided=body_stage_provided,
    )
    if conflict_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=conflict_err,
        )

    if stage_provided:
        enforce_guardian_stage(candidate_stage)

    txn = transaction_repository.get_transaction(db, payload.transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {payload.transaction_id} not found.")

    # 1. User authentication & ownership validation
    raw_token = _extract_bearer_token(authorization)
    if raw_token:
        from app.services.session_service import SessionService
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
                detail="You are not authorized to trigger Guardian requests for another user.",
            )

    if payload.user_id is not None and payload.user_id != txn.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Transaction {txn.id} does not belong to user {payload.user_id}.",
        )

    # 2. Terminal state check
    if is_terminal(txn.status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot initiate Guardian approval for a transaction in terminal status {txn.status.value}.",
        )

    # 3. Already approved Guardian check
    if txn.status == TransactionStatus.GUARDIAN_APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Guardian approval has already been granted for this transaction.",
        )

    # 4. In-flight duplicate pending check
    existing_pending = guardian_repository.get_pending_request_for_transaction(db, txn.id)
    if existing_pending:
        if _check_and_expire_request(db, existing_pending):
            existing_pending = None
        else:
            now_utc = datetime.now(timezone.utc)
            exp = (
                existing_pending.expires_at.replace(tzinfo=timezone.utc)
                if existing_pending.expires_at.tzinfo is None
                else existing_pending.expires_at
            )
            remaining = max(0, int((exp - now_utc).total_seconds()))
            if remaining > 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"A guardian request is already pending for this transaction (remaining: {remaining}s).",
                )

    # 5. Risk score / risk level check - ONLY HIGH RISK ALLOWED
    from app.api.routers.users import _get_or_compute_risk_score, get_risk_level_from_score

    latest_risk = _get_or_compute_risk_score(db, txn)
    final_sc = float(latest_risk.final_score) if latest_risk else 0.0
    risk_level = get_risk_level_from_score(final_sc)
    if risk_level != "HIGH":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Guardian approval can only be triggered for HIGH-risk transactions (current risk level: {risk_level}).",
        )

    # 6. Trusted contact validation
    contact_id = payload.trusted_contact_id
    if contact_id:
        contact = guardian_repository.get_trusted_contact(db, contact_id)
        if not contact or contact.user_id != txn.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Specified trusted contact does not belong to the transaction user.",
            )
    else:
        contacts = guardian_repository.get_trusted_contacts_by_user(db, txn.user_id)
        if not contacts:
            raise HTTPException(status_code=400, detail="User has no enrolled trusted contacts.")
        contact_id = contacts[0].id

    # 7. Create request & transition state
    req = guardian_repository.create_guardian_request(
        db, transaction_id=txn.id, trusted_contact_id=contact_id, expires_in_seconds=120
    )
    try:
        transition(db, txn, TransactionStatus.PENDING_GUARDIAN_APPROVAL, idempotent_ok=True)
    except InvalidTransactionTransition as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    notification_service.notify(
        db,
        user_id=txn.user_id,
        type="GUARDIAN_REQUESTED",
        title="Guardian approval requested",
        body=f"A guardian approval request was sent for ₹{txn.amount}.",
        transaction_id=txn.id,
    )
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
    """Thin wrapper kept for call-site compatibility — see
    app/services/guardian_service.py for the shared implementation also
    used by the background expiry worker (app/main.py's lifespan task)."""
    return guardian_service.check_and_expire_request(db, req)


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
def approve_guardian_request(
    request_id: int,
    payload: Optional[GuardianActionRequest] = None,
    x_workflow_stage: Optional[str] = Header(None, alias="X-Workflow-Stage"),
    db: Session = Depends(get_db),
) -> dict:
    body_stage_provided = payload is not None and "stage" in payload.model_fields_set
    body_stage = payload.stage if payload is not None else None

    candidate_stage, stage_provided, conflict_err = resolve_candidate_stage(
        body_stage=body_stage,
        header_stage=x_workflow_stage,
        body_stage_provided=body_stage_provided,
    )
    if conflict_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=conflict_err,
        )

    if stage_provided:
        enforce_guardian_stage(candidate_stage)

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
        db=db,
    )

    transaction_repository.update_transaction_status(db, req.transaction_id, TransactionStatus.GUARDIAN_APPROVED)
    notification_service.notify(
        db,
        user_id=req.transaction.user_id,
        type="GUARDIAN_APPROVED",
        title="Guardian approved your payment",
        body="Your family guardian approved the payment. You can now proceed.",
        transaction_id=req.transaction_id,
    )
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
        db=db,
    )

    transaction_repository.update_transaction_status(db, req.transaction_id, TransactionStatus.GUARDIAN_REJECTED)
    notification_service.notify(
        db,
        user_id=req.transaction.user_id,
        type="GUARDIAN_REJECTED",
        title="Guardian rejected your payment",
        body="Your family guardian blocked this payment as unsafe.",
        transaction_id=req.transaction_id,
    )
    return {"request_id": request_id, "outcome": GuardianOutcome.REJECTED.value, "message": "Transaction blocked and cancelled by guardian."}


# NOTE: the former POST /requests/{id}/user-override endpoint (PIN-bypass
# of a timed-out/rejected Guardian hold) has been removed. AVARAN PAY spec
# §6 requires Guardian rejection or expiry to stop the payment
# unconditionally; there is no override path. Verified before removal that
# no mobile client code calls this endpoint.
