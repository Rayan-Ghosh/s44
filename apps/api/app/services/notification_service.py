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
    commit: bool = True,
) -> Notification:
    """`commit=False` stages the row on the shared session without a separate
    round-trip transaction — for callers batching many notifications in a
    loop (e.g. a sweep over many expired requests), who commit once at the
    end instead of once per row."""
    note = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        transaction_id=transaction_id,
    )
    db.add(note)
    if commit:
        db.commit()
        db.refresh(note)
    else:
        db.flush()
    return note
