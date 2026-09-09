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


from app.core.security import hash_identifier


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
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
        if "token_hash" in kwargs and not kwargs.get("refresh_token_hash"):
            kwargs["refresh_token_hash"] = kwargs["token_hash"]
        elif "refresh_token_hash" in kwargs and not kwargs.get("token_hash"):
            kwargs["token_hash"] = kwargs["refresh_token_hash"]

        if not kwargs.get("token_hash"):
            kwargs["token_hash"] = hash_identifier(kwargs.get("refresh_token_hash") or "token")
        if not kwargs.get("refresh_token_hash"):
            kwargs["refresh_token_hash"] = kwargs["token_hash"]

        effective_device = (
            kwargs.get("device_id")
            or kwargs.get("device_hash")
            or f"client-device-{kwargs.get('user_id', 'unknown')}"
        )
        if not kwargs.get("device_hash"):
            kwargs["device_hash"] = hash_identifier(effective_device)
        if not kwargs.get("device_id"):
            kwargs["device_id"] = effective_device

        super().__init__(**kwargs)
