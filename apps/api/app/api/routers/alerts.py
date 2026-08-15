"""/api/v1/alerts — read-only in Phase 2. Nothing yet creates alerts
automatically (that depends on the future risk engine); rows only exist
via seed fixtures or manual insertion during development."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories import alert_repository
from app.schemas.alert import AlertRead

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertRead])
def list_alerts(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[AlertRead]:
    return alert_repository.list_alerts(db, limit=limit, offset=offset)


@router.get("/{alert_id}", response_model=AlertRead)
def get_alert(alert_id: int, db: Session = Depends(get_db)) -> AlertRead:
    alert = alert_repository.get_alert(db, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found.")
    return alert
