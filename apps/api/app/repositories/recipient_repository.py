from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.recipient import Recipient


def get_recipient(db: Session, *, user_id: int, recipient_hash: str) -> Optional[Recipient]:
    return (
        db.query(Recipient)
        .filter(Recipient.user_id == user_id, Recipient.recipient_hash == recipient_hash)
        .first()
    )


def create_recipient(
    db: Session, *, user_id: int, recipient_hash: str, display_name: Optional[str]
) -> Recipient:
    recipient = Recipient(
        user_id=user_id, recipient_hash=recipient_hash, display_name=display_name
    )
    db.add(recipient)
    db.commit()
    db.refresh(recipient)
    return recipient


def touch_last_seen(db: Session, recipient: Recipient) -> Recipient:
    recipient.last_seen = datetime.now(timezone.utc)
    db.add(recipient)
    db.commit()
    db.refresh(recipient)
    return recipient
