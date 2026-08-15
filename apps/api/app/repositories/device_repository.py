from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.device import Device


def get_device(db: Session, *, user_id: int, device_hash: str) -> Optional[Device]:
    return (
        db.query(Device)
        .filter(Device.user_id == user_id, Device.device_hash == device_hash)
        .first()
    )


def create_device(db: Session, *, user_id: int, device_hash: str) -> Device:
    device = Device(user_id=user_id, device_hash=device_hash)
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


def touch_last_seen(db: Session, device: Device) -> Device:
    device.last_seen = datetime.now(timezone.utc)
    db.add(device)
    db.commit()
    db.refresh(device)
    return device
