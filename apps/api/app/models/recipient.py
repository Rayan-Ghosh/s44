"""
recipients — listed among spec §3's core entities, but spec §18 gives no
field list for it (unlike users/devices/transactions/etc., which do). This
is a documented gap, not a silent invention: the fields below are the
minimum needed to support the recipient-novelty/recipient-frequency
features spec §6.1 and §7 already require (recipient_seen_before,
recipient_frequency, "frequent recipients" in the User Risk Profile).

Deviation from spec, documented per CLAUDE.md's rule for genuinely
undecided items: recipient identity is hashed (recipient_hash) for the
same reason phone numbers and device IDs are (spec §21) — a recipient
handle (UPI ID, phone number, account reference) is a sensitive
identifier. display_name is kept separate and unhashed for demo/UI
purposes, since seed data uses synthetic Indian names, not real PII.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Recipient(Base):
    __tablename__ = "recipients"
    __table_args__ = (
        UniqueConstraint("user_id", "recipient_hash", name="uq_recipient_user_hash"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    recipient_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    first_seen: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="recipients")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="recipient")
