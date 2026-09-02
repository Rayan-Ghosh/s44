"""Data access for TrustedContact and GuardianRequest."""

from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.models.enums import ConsentStatus, GuardianOutcome
from app.models.guardian_request import GuardianRequest
from app.models.trusted_contact import TrustedContact


def _resolve_user_by_phone(
    db: Session,
    phone_hash: str,
    phone_raw: Optional[str] = None,
) -> Optional[int]:
    """Helper to resolve an active User ID from a phone hash or raw phone string across formats."""
    from app.core.security import hash_identifier
    from app.models.user import User
    from app.models.user_contact_info import UserContactInfo
    from app.core.contact_encryption import decrypt_field

    # 1. Direct hash match
    matched_user = db.query(User).filter(User.phone_hash == phone_hash).first()
    if matched_user:
        return matched_user.id

    # 2. Extract digits if raw phone is provided
    digits_only = "".join(c for c in phone_raw if c.isdigit()) if phone_raw else ""

    if digits_only:
        candidates = [
            f"+91{digits_only[-10:]}",
            f"+{digits_only}",
            digits_only,
            f"+91-{digits_only[-10:-5]}-{digits_only[-5:]}" if len(digits_only) >= 10 else None,
            f"+91 {digits_only[-10:-5]} {digits_only[-5:]}" if len(digits_only) >= 10 else None,
            f"+91 {digits_only[-10:]}" if len(digits_only) >= 10 else None,
        ]
        for candidate in filter(None, candidates):
            cand_hash = hash_identifier(candidate)
            matched_user = db.query(User).filter(User.phone_hash == cand_hash).first()
            if matched_user:
                return matched_user.id

    # 3. Check encrypted UserContactInfo rows by decrypting and comparing digits
    if digits_only and len(digits_only) >= 10:
        target_10 = digits_only[-10:]
        contacts = db.query(UserContactInfo).all()
        for c in contacts:
            if c.phone_encrypted:
                try:
                    dec = decrypt_field(c.phone_encrypted)
                    dec_digits = "".join(ch for ch in dec if ch.isdigit())
                    if dec_digits and dec_digits.endswith(target_10):
                        return c.user_id
                except Exception:
                    pass

    return None


def link_unbound_trusted_contacts_for_user(
    db: Session,
    user_id: int,
    phone_hash: str,
    phone_raw: Optional[str] = None,
) -> int:
    """When a User registers, logs in, or verifies, automatically backlink any existing
    TrustedContact rows that reference this phone number where guardian_user_id is None."""
    from app.core.security import hash_identifier
    from app.core.contact_encryption import decrypt_field
    from app.models.user_contact_info import UserContactInfo

    # If phone_raw not passed, attempt to find raw phone from UserContactInfo
    if not phone_raw:
        contact_info = db.query(UserContactInfo).filter(UserContactInfo.user_id == user_id).first()
        if contact_info and contact_info.phone_encrypted:
            try:
                phone_raw = decrypt_field(contact_info.phone_encrypted)
            except Exception:
                pass

    candidate_hashes = {phone_hash}
    digits_only = "".join(c for c in phone_raw if c.isdigit()) if phone_raw else ""
    if digits_only:
        for cand in (
            f"+91{digits_only[-10:]}",
            f"+{digits_only}",
            digits_only,
            f"+91-{digits_only[-10:-5]}-{digits_only[-5:]}" if len(digits_only) >= 10 else None,
            f"+91 {digits_only[-10:-5]} {digits_only[-5:]}" if len(digits_only) >= 10 else None,
            f"+91 {digits_only[-10:]}" if len(digits_only) >= 10 else None,
        ):
            if cand:
                candidate_hashes.add(hash_identifier(cand))

    unlinked = db.query(TrustedContact).filter(
        TrustedContact.guardian_user_id.is_(None),
        TrustedContact.contact_phone_hash.in_(candidate_hashes),
    ).all()

    linked_count = 0
    for contact in unlinked:
        contact.guardian_user_id = user_id
        linked_count += 1

    if linked_count > 0:
        db.commit()

    return linked_count


def create_trusted_contact(
    db: Session,
    *,
    user_id: int,
    contact_name: str,
    contact_phone_hash: str,
    phone_masked: str,
    relationship: str = "Family",
    guardian_user_id: Optional[int] = None,
    phone_raw: Optional[str] = None,
) -> TrustedContact:
    if guardian_user_id is None:
        guardian_user_id = _resolve_user_by_phone(db, contact_phone_hash, phone_raw)

    contact = TrustedContact(
        user_id=user_id,
        contact_name=contact_name,
        contact_phone_hash=contact_phone_hash,
        phone_masked=phone_masked,
        relationship=relationship,
        guardian_user_id=guardian_user_id,
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
    # Dynamically verify if trusted contact's guardian_user_id can now be resolved
    contact = db.get(TrustedContact, trusted_contact_id)
    if contact and contact.guardian_user_id is None:
        resolved_gid = _resolve_user_by_phone(db, contact.contact_phone_hash)
        if resolved_gid:
            contact.guardian_user_id = resolved_gid
            db.commit()

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


def get_pending_request_for_transaction(db: Session, transaction_id: int) -> Optional[GuardianRequest]:
    return (
        db.query(GuardianRequest)
        .filter(
            GuardianRequest.transaction_id == transaction_id,
            GuardianRequest.outcome == GuardianOutcome.PENDING,
        )
        .order_by(GuardianRequest.requested_at.desc())
        .first()
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

