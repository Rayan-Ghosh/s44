from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.contact_encryption import decrypt_field, encrypt_field
from app.core.database import get_db
from app.models.enums import RiskLevel, TransactionStatus
from app.models.transaction import Transaction
from app.models.user import User
from app.models.user_contact_info import UserContactInfo
from app.repositories import risk_repository, transaction_repository
from app.schemas.user import UserCreate, UserRead
from app.services import user_service
from app.services.exceptions import UserAlreadyExistsError, UserNotFoundError

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.post("", response_model=UserRead, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> UserRead:
    try:
        user = user_service.create_user(db, payload)
    except UserAlreadyExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return user


@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: int, db: Session = Depends(get_db)) -> UserRead:
    try:
        user = user_service.get_user(db, user_id)
    except UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    contact = db.query(UserContactInfo).filter(UserContactInfo.user_id == user_id).first()
    return UserRead(
        id=user.id,
        name=user.name,
        created_at=user.created_at,
        email=decrypt_field(contact.email_encrypted) if contact and contact.email_encrypted else "",
        phone=decrypt_field(contact.phone_encrypted) if contact and contact.phone_encrypted else "",
    )


@router.patch("/{user_id}")
def update_user_profile(user_id: int, payload: dict, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found.")

    if "name" in payload and payload["name"]:
        user.name = payload["name"].strip()

    # Real, reversible contact info lives in user_contact_info, encrypted —
    # not on User itself. See docs/PROFILE_CONTACT_INFO_DECISION.md.
    contact = db.query(UserContactInfo).filter(UserContactInfo.user_id == user_id).first()
    if not contact:
        contact = UserContactInfo(user_id=user_id)
        db.add(contact)
    if payload.get("email"):
        contact.email_encrypted = encrypt_field(payload["email"].strip())
    if payload.get("phone"):
        contact.phone_encrypted = encrypt_field(payload["phone"].strip())

    db.commit()
    db.refresh(user)
    db.refresh(contact)

    return {
        "success": True,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": decrypt_field(contact.email_encrypted) if contact.email_encrypted else "",
            "phone": decrypt_field(contact.phone_encrypted) if contact.phone_encrypted else "",
        }
    }


@router.get("/{user_id}/devices")
def get_user_devices(user_id: int, db: Session = Depends(get_db)) -> list:
    from app.models.device import Device
    devices = db.query(Device).filter(Device.user_id == user_id).all()
    # device_name/device_type are real columns now (see
    # docs/PROFILE_CONTACT_INFO_DECISION.md §6.3), populated by whatever the
    # client reported at transaction-creation time (see
    # transaction_service.create_transaction). Older rows / clients that
    # never reported a name fall back to a generic label instead of a
    # fabricated one.
    return [
        {
            "id": d.id,
            "device_name": d.device_name or f"Device {d.device_hash[:8]}",
            "device_type": d.device_type or "Unknown",
            "device_hash": d.device_hash[:16] + "...",
            "is_primary": i == 0,
            "registered_at": d.first_seen.isoformat() if d.first_seen else None,
            "last_active": d.last_seen.isoformat() if d.last_seen else None,
            "security_status": "SECURE" if (d.risk_score or 0) < 50 else "REVIEW",
        }
        for i, d in enumerate(devices)
    ]


@router.get("/{user_id}/overview")
def get_user_overview(user_id: int, db: Session = Depends(get_db)) -> dict:
    try:
        user = user_service.get_user(db, user_id)
    except UserNotFoundError as exc:
        user = None

    txns = db.query(Transaction).filter(Transaction.user_id == user_id).all() if user else []

    if not txns:
        return {
            "total_amount_this_month": 0.0,
            "transaction_count": 0,
            "safe_count": 0,
            "needs_review_count": 0,
            "blocked_count": 0,
            "reported_count": 0,
            "current_risk_level": "LOW",
            "current_risk_score": 0.0,
            "protection_status": "PROTECTED",
        }

    total_amount = sum(float(t.amount) for t in txns)
    safe_count = sum(1 for t in txns if t.status in (TransactionStatus.CONFIRMED, TransactionStatus.ALLOWED, TransactionStatus.GUARDIAN_APPROVED))
    needs_review_count = sum(1 for t in txns if t.status in (TransactionStatus.AWAITING_CONFIRMATION, TransactionStatus.PENDING, TransactionStatus.PENDING_GUARDIAN_APPROVAL))
    blocked_count = sum(1 for t in txns if t.status in (TransactionStatus.CANCELLED, TransactionStatus.GUARDIAN_REJECTED))
    reported_count = sum(1 for t in txns if t.status == TransactionStatus.REPORTED)

    latest_risk = 0.0
    latest_level = "LOW"
    for t in txns:
        if t.risk_scores:
            latest_risk = t.risk_scores[-1].final_score
            latest_level = t.risk_scores[-1].risk_level.value
            break

    protection_status = "ATTENTION REQUIRED" if (needs_review_count > 0 or latest_level == "HIGH") else "PROTECTED"

    return {
        "total_amount_this_month": total_amount,
        "transaction_count": len(txns),
        "safe_count": safe_count,
        "needs_review_count": needs_review_count,
        "blocked_count": blocked_count,
        "reported_count": reported_count,
        "current_risk_level": latest_level,
        "current_risk_score": latest_risk,
        "protection_status": protection_status,
    }


@router.get("/{user_id}/transactions")
def get_user_transactions(
    user_id: int,
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(Transaction).filter(Transaction.user_id == user_id)
    if status and status.upper() != "ALL":
        try:
            status_enum = TransactionStatus(status.upper())
            query = query.filter(Transaction.status == status_enum)
        except ValueError:
            pass

    total = query.count()
    txns = query.order_by(Transaction.timestamp.desc()).offset(offset).limit(limit).all()

    items = []
    for t in txns:
        latest_risk = risk_repository.get_latest_risk_score(db, t.id)
        factors = []
        if latest_risk and latest_risk.risk_factors:
            for rf in latest_risk.risk_factors:
                factors.append({
                    "factor_type": getattr(rf, "factor_type", "rule"),
                    "factor_name": getattr(rf, "factor_name", "Risk Factor"),
                    "contribution": float(rf.contribution),
                    "explanation": rf.explanation,
                })

        items.append({
            "id": t.id,
            "merchant": t.recipient.display_name if (t.recipient and t.recipient.display_name) else "UPI Merchant",
            "amount": float(t.amount),
            "timestamp": t.timestamp.isoformat() if t.timestamp else "",
            "payment_method": t.payment_method or "UPI",
            "status": t.status.value if hasattr(t.status, "value") else str(t.status),
            "risk_level": latest_risk.risk_level.value if (latest_risk and hasattr(latest_risk.risk_level, "value")) else "LOW",
            "risk_score": float(latest_risk.final_score) if latest_risk else 0.0,
            "risk_factors": factors,
        })

    return {"items": items, "total": total}


@router.get("/{user_id}/trusted-contacts")
def get_user_trusted_contacts_by_path(user_id: int, db: Session = Depends(get_db)) -> list:
    from app.repositories import guardian_repository
    contacts = guardian_repository.get_trusted_contacts_by_user(db, user_id)
    return [
        {
            "id": c.id,
            "name": c.contact_name,
            "phone": c.phone_masked,
            "phone_number": c.phone_masked,
            "relationship": c.relationship,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in contacts
    ]


@router.post("/{user_id}/trusted-contacts", status_code=201)
def add_user_trusted_contact_by_path(user_id: int, payload: dict, db: Session = Depends(get_db)) -> dict:
    from app.core.security import hash_identifier, mask_phone
    from app.repositories import guardian_repository

    name = payload.get("name") or payload.get("contact_name") or "Contact"
    phone_raw = payload.get("phone_number") or payload.get("phone") or "+91-98765-00000"
    rel = payload.get("relationship") or "Family"

    phone_hash = hash_identifier(phone_raw)
    phone_masked = mask_phone(phone_raw)

    c = guardian_repository.create_trusted_contact(
        db,
        user_id=user_id,
        contact_name=name,
        contact_phone_hash=phone_hash,
        phone_masked=phone_masked,
        relationship=rel,
    )
    return {
        "id": c.id,
        "name": c.contact_name,
        "phone": c.phone_masked,
        "phone_number": c.phone_masked,
        "relationship": c.relationship,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.delete("/{user_id}/trusted-contacts/{contact_id}")
def delete_user_trusted_contact_by_path(user_id: int, contact_id: int, db: Session = Depends(get_db)) -> dict:
    from app.models.trusted_contact import TrustedContact
    contact = db.query(TrustedContact).filter(TrustedContact.id == contact_id, TrustedContact.user_id == user_id).first()
    if contact:
        db.delete(contact)
        db.commit()
    return {"success": True}

