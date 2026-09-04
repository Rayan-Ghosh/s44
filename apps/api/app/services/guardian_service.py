"""
GuardianService — shared Guardian-request expiry logic (AVARAN PAY spec §6).

Extracted from app/api/routers/guardian.py so the same expiry check backs
both the lazy/pull-based path (a request gets checked whenever something
reads it) and the proactive background sweep (app/main.py's lifespan
worker), which is what spec §6 actually asks for: "A background expiry
worker must process pending requests independently of the frontend."
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.enums import GuardianOutcome, TransactionStatus
from app.models.guardian_request import GuardianRequest
from app.services import notification_service
from app.services.security_audit_service import SecurityAuditService


def check_and_expire_request(db: Session, req: GuardianRequest) -> bool:
    """If `req` is PENDING and past its expires_at, atomically transition it
    to TIMEOUT and the parent transaction to GUARDIAN_TIMEOUT. Returns True
    if an expiry just happened."""
    if req is None or req.outcome != GuardianOutcome.PENDING:
        return False
    now = datetime.now(timezone.utc)
    exp = req.expires_at.replace(tzinfo=timezone.utc) if req.expires_at.tzinfo is None else req.expires_at
    if now < exp:
        return False

    req.outcome = GuardianOutcome.TIMEOUT
    req.resolved_at = now
    req.resolution_notes = "Guardian approval window expired after 120 seconds."
    if req.transaction and req.transaction.status == TransactionStatus.PENDING_GUARDIAN_APPROVAL:
        req.transaction.status = TransactionStatus.GUARDIAN_TIMEOUT
    db.commit()
    db.refresh(req)

    SecurityAuditService.log_event(
        "GUARDIAN_TIMEOUT",
        transaction_id=req.transaction_id,
        details={"trusted_contact_id": req.trusted_contact_id},
        db=db,
    )
    if req.transaction:
        notification_service.notify(
            db,
            user_id=req.transaction.user_id,
            type="GUARDIAN_TIMEOUT",
            title="Guardian did not respond in time",
            body="Your guardian did not respond within 120 seconds. This payment has been stopped.",
            transaction_id=req.transaction_id,
        )
    return True


def sweep_expired_requests(db: Session) -> int:
    """Proactively expire every PENDING GuardianRequest past its deadline,
    independent of whether anything has read/polled it. Returns the count
    of requests expired in this sweep."""
    pending = (
        db.query(GuardianRequest)
        .filter(GuardianRequest.outcome == GuardianOutcome.PENDING)
        .all()
    )
    expired_count = 0
    for req in pending:
        if check_and_expire_request(db, req):
            expired_count += 1
    return expired_count
