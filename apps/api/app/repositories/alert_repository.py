from typing import Optional

from sqlalchemy.orm import Session

from app.models.alert import Alert


def list_alerts(db: Session, *, limit: int = 50, offset: int = 0) -> list[Alert]:
    return (
        db.query(Alert)
        .order_by(Alert.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def get_alert(db: Session, alert_id: int) -> Optional[Alert]:
    return db.get(Alert, alert_id)
