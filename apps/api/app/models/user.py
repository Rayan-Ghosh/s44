"""
users — spec §18.

Spec field list: id, name, phone_hash, created_at, risk_profile.
`phone_hash` is pre-hashed at the service layer (app/services/user_service.py)
before it ever reaches this model — see app/core/security.py and
docs/SECURITY.md.
"""

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # Flexible structured summary of the User Risk Profile described in
    # spec §7 (normal amount/range, frequent recipients, known devices,
    # typical locations/times, velocity, historical risk/outcomes). JSON
    # is used deliberately here because the spec describes this as an
    # evolving, multi-shaped summary rather than a fixed set of columns.
    # Phase 2 does not populate this field — it is written by future
    # feature-engineering logic (docs/DEVELOPMENT_PLAN.md Phase 4).
    risk_profile: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)

    devices: Mapped[list["Device"]] = relationship(back_populates="user")
    recipients: Mapped[list["Recipient"]] = relationship(back_populates="user")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="user")
    trusted_contacts: Mapped[list["TrustedContact"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    contact_info: Mapped[Optional["UserContactInfo"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    credentials: Mapped[Optional["UserCredentials"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


