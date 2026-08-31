"""Domain logic for transaction creation.

This is the one piece of real orchestration in Phase 2: a transaction
arrives with raw device/recipient identifiers, which must be hashed and
resolved into (get-or-create) Device/Recipient rows scoped to the sending
user, before the transaction itself can be persisted. That multi-step
resolution is exactly what belongs in a service rather than a repository
(too much logic for "pure CRUD") or a router (an HTTP concern, not a
domain one).

Explicitly NOT done here: no risk evaluation, no fraud/anomaly scoring, no
decision-making. Per spec §12, individual detectors — and by extension,
this creation path — must never make the risk decision themselves. A
transaction is created in PENDING status; risk evaluation is a separate,
not-yet-implemented step (see app/api/routers/risk.py).
"""

from sqlalchemy.orm import Session

from app.core.security import hash_identifier
from app.models.transaction import Transaction
from app.repositories import device_repository, recipient_repository, transaction_repository, user_repository
from app.schemas.transaction import TransactionCreate
from app.services.exceptions import TransactionNotFoundError, UserNotFoundError


def create_transaction(db: Session, payload: TransactionCreate) -> Transaction:
    if user_repository.get_user(db, payload.user_id) is None:
        raise UserNotFoundError(f"User {payload.user_id} not found.")

    device_hash = hash_identifier(payload.device_identifier)
    device = device_repository.get_device(db, user_id=payload.user_id, device_hash=device_hash)
    if device is None:
        device = device_repository.create_device(
            db,
            user_id=payload.user_id,
            device_hash=device_hash,
            device_name=payload.device_name,
            device_type=payload.device_type,
        )
    else:
        device = device_repository.touch_last_seen(
            db, device, device_name=payload.device_name, device_type=payload.device_type
        )

    recipient_hash = hash_identifier(payload.recipient_identifier)
    recipient = recipient_repository.get_recipient(
        db, user_id=payload.user_id, recipient_hash=recipient_hash
    )
    if recipient is None:
        recipient = recipient_repository.create_recipient(
            db,
            user_id=payload.user_id,
            recipient_hash=recipient_hash,
            display_name=payload.recipient_display_name,
        )
    else:
        recipient = recipient_repository.touch_last_seen(db, recipient)

    return transaction_repository.create_transaction(
        db,
        user_id=payload.user_id,
        recipient_id=recipient.id,
        device_id=device.id,
        amount=payload.amount,
        location=payload.location,
        payment_method=payload.payment_method,
    )


def get_transaction(db: Session, transaction_id: int) -> Transaction:
    transaction = transaction_repository.get_transaction(db, transaction_id)
    if transaction is None:
        raise TransactionNotFoundError(f"Transaction {transaction_id} not found.")
    return transaction
