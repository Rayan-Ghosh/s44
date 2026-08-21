"""Data access for TrustedContact and GuardianRequest."""

from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.models.enums import ConsentStatus, GuardianOutcome
from app.models.guardian_request import GuardianRequest
from app.models.trusted_contact import TrustedContact


def create_trusted_contact(
    db: Session,
    *,
    user_id: int,
    contact_name: str,
    contact_phone_hash: str,
    phone_masked: str,
    relationship: str = "Family",
) -> TrustedContact:
    contact = TrustedContact(
        user_id=user_id,
        contact_name=contact_name,
        contact_phone_hash=contact_phone_hash,
        phone_masked=phone_masked,
        relationship=relationship,
        consent_status=ConsentStatus.ACCEPTED,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


def get_trusted_contacts_by_user(db: Session, user_id: int) -> list[TrustedContact]:
    return db.query(TrustedContact).filter(TrustedContact.user_id == user_id).all()


def get_trusted_contact(db: Session, contact_id: int) -> Optional[TrustedContact]:
    return db.get(TrustedContact, contact_id)


def create_guardian_request(
    db: Session,
    *,
    transaction_id: int,
    trusted_contact_id: int,
    expires_in_seconds: int = 120,
) -> GuardianRequest:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=expires_in_seconds)
    req = GuardianRequest(
        transaction_id=transaction_id,
        trusted_contact_id=trusted_contact_id,
        requested_at=now,
        expires_at=expires_at,
        outcome=GuardianOutcome.PENDING,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def get_guardian_request(db: Session, request_id: int) -> Optional[GuardianRequest]:
    return db.get(GuardianRequest, request_id)


def get_pending_guardian_requests(db: Session, trusted_contact_id: int) -> list[GuardianRequest]:
    return (
        db.query(GuardianRequest)
        .filter(
            GuardianRequest.trusted_contact_id == trusted_contact_id,
            GuardianRequest.outcome == GuardianOutcome.PENDING,
        )
        .order_by(GuardianRequest.requested_at.desc())
        .all()
    )


def resolve_guardian_request(
    db: Session,
    request_id: int,
    outcome: GuardianOutcome,
    resolution_notes: Optional[str] = None,
    resolution_channel: str = "WEB_CONSOLE",
) -> Optional[GuardianRequest]:
    req = db.get(GuardianRequest, request_id)
    if req is None:
        return None
    req.outcome = outcome
    req.resolved_at = datetime.now(timezone.utc)
    req.resolution_notes = resolution_notes
    req.resolution_channel = resolution_channel
    db.commit()
    db.refresh(req)
    return req
