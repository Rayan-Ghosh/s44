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


# Cap on how many expired requests are flushed into a single transaction.
# Bounds worst-case lock hold time / statement count per commit when a sweep
# (or a list endpoint) has to process an unusually large pending backlog.
_EXPIRY_BATCH_CHUNK_SIZE = 200


def check_and_expire_request(db: Session, req: GuardianRequest, *, commit: bool = True) -> bool:
    """If `req` is PENDING and past its expires_at, atomically transition it
    to TIMEOUT and the parent transaction to GUARDIAN_TIMEOUT. Returns True
    if an expiry just happened.

    `commit=False` stages the GuardianRequest update, audit log row, and
    notification row on the shared session without committing — for a
    caller processing many requests in a loop (sweep_expired_requests,
    guardian.py's list endpoints), who commits once per batch instead of
    once per row. The default (commit=True) preserves the original
    single-row, immediately-committed behavior for lazy/pull-path callers
    that check one request at a time.
    """
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

    if commit:
        db.commit()
        db.refresh(req)
    else:
        db.flush()

    SecurityAuditService.log_event(
        "GUARDIAN_TIMEOUT",
        transaction_id=req.transaction_id,
        details={"trusted_contact_id": req.trusted_contact_id},
        db=db,
        commit=commit,
    )
    if req.transaction:
        notification_service.notify(
            db,
            user_id=req.transaction.user_id,
            type="GUARDIAN_TIMEOUT",
            title="Guardian did not respond in time",
            body="Your guardian did not respond within 120 seconds. This payment has been stopped.",
            transaction_id=req.transaction_id,
            commit=commit,
        )
    return True


def sweep_expired_requests(db: Session) -> int:
    """Proactively expire every PENDING GuardianRequest past its deadline,
    independent of whether anything has read/polled it. Returns the count
    of requests expired in this sweep.

    Batches all writes for up to _EXPIRY_BATCH_CHUNK_SIZE requests into a
    single commit instead of committing (GuardianRequest update + AuditLog
    insert + Notification insert) once per expired request — turning what
    was up to 3 round trips per row into one round trip per chunk. Large
    backlogs are committed in chunks so no single transaction holds locks
    over an unbounded number of rows.
    """
    pending = (
        db.query(GuardianRequest)
        .filter(GuardianRequest.outcome == GuardianOutcome.PENDING)
        .all()
    )
    expired_count = 0
    pending_in_chunk = 0
    for req in pending:
        if check_and_expire_request(db, req, commit=False):
            expired_count += 1
            pending_in_chunk += 1
        if pending_in_chunk >= _EXPIRY_BATCH_CHUNK_SIZE:
            db.commit()
            pending_in_chunk = 0
    if pending_in_chunk:
        db.commit()
    return expired_count
