"""notification_service — in-app notification records (AVARAN PAY spec §13)."""

from typing import Optional

from sqlalchemy.orm import Session

from app.models.notification import Notification


def notify(
    db: Session,
    *,
    user_id: int,
    type: str,
    title: str,
    body: str,
    transaction_id: Optional[int] = None,
) -> Notification:
    note = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        transaction_id=transaction_id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note
