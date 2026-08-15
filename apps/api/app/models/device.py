"""
devices — spec §18.

Spec field list: id, user_id, device_hash, first_seen, last_seen, risk_score.

A row represents one (user, device) association rather than a single global
device record — this is what lets `device_account_count` (spec §41: "how
many accounts have used this device") be computed as
`COUNT(DISTINCT user_id) WHERE device_hash = X` across rows, since the same
physical device_hash can legitimately appear under multiple users. This
choice is not spelled out in the spec's literal field list; it's the
smallest addition that makes the device_account_count feature the spec
itself requires actually computable. See docs/DEVELOPMENT_PLAN.md Phase 2
notes.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Device(Base):
    __tablename__ = "devices"
    __table_args__ = (UniqueConstraint("user_id", "device_hash", name="uq_device_user_hash"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    device_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    first_seen: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    # Nullable: no device-risk assessment exists until the (future) device
    # risk rules/model actually run — spec §41.
    risk_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    user: Mapped["User"] = relationship(back_populates="devices")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="device")
