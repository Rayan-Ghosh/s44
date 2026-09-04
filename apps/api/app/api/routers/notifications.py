"""/api/v1/notifications — in-app notification feed (AVARAN PAY spec §13)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.notification import Notification

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("/{user_id}")
def list_notifications(user_id: int, limit: int = 50, offset: int = 0, db: Session = Depends(get_db)) -> list[dict]:
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": n.id,
            "type": n.type,
            "title": n.title,
            "body": n.body,
            "transaction_id": n.transaction_id,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in rows
    ]


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, db: Session = Depends(get_db)) -> dict:
    note = db.get(Notification, notification_id)
    if note is None:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found.")
    note.is_read = True
    db.commit()
    return {"id": note.id, "is_read": True}
