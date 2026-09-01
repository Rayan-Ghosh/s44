"""
trusted_device_bindings — Single-device binding for user accounts.
Enforces that each user account is bound to at most one active trusted device.
Stores only the hashed device identifier and non-sensitive device metadata.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TrustedDeviceBinding(Base):
    __tablename__ = "trusted_device_bindings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    device_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    device_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    device_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    bound_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped["User"] = relationship(back_populates="trusted_device")
