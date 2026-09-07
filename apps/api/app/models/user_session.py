"""
user_sessions — Unified session management.
Supports both database-backed JWT refresh token rotation (DATABASE_INTEGRATION_REQUIREMENTS.md §3.1 Table 4)
and cryptographic single-device session tracking.
"""

from datetime import datetime, timezone
from typing import Optional
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    token_hash: Mapped[Optional[str]] = mapped_column(
        String(64), index=True, nullable=True
    )
    refresh_token_hash: Mapped[Optional[str]] = mapped_column(
        String(64), index=True, nullable=True
    )
    device_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    device_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    last_activity_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=True
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="sessions")

    def __init__(self, **kwargs):
        if "token_hash" in kwargs and "refresh_token_hash" not in kwargs:
            kwargs["refresh_token_hash"] = kwargs["token_hash"]
        elif "refresh_token_hash" in kwargs and "token_hash" not in kwargs:
            kwargs["token_hash"] = kwargs["refresh_token_hash"]
        if "device_hash" in kwargs and "device_id" not in kwargs:
            kwargs["device_id"] = kwargs["device_hash"]
        elif "device_id" in kwargs and "device_hash" not in kwargs:
            kwargs["device_hash"] = kwargs["device_id"]
        super().__init__(**kwargs)
