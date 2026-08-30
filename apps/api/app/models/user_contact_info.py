"""
user_contact_info — reversible contact details, decoupled from `users`.

Deliberately a separate table rather than columns on `users`: `users.phone_hash`
stays a one-way identifier used everywhere else in the system (login lookup,
ML features, audit logs, institution console) exactly as docs/SECURITY.md §2
requires. Nothing outside the profile-edit/notification code paths should
ever need to touch this table. See docs/PROFILE_CONTACT_INFO_DECISION.md.

email_encrypted/phone_encrypted are Fernet ciphertext (app/core/
contact_encryption.py) — never queried or filtered on directly, only
decrypted for display once a specific user's row has already been looked
up by user_id.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserContactInfo(Base):
    __tablename__ = "user_contact_info"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    email_encrypted: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    phone_encrypted: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="contact_info")
