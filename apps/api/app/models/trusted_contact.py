"""
trusted_contacts — spec §6 (Guardian Approval Subsystem).

Represents an enrolled trusted family member or contact who can approve
high-risk payments on behalf of the user during a live scam attempt.
"""

from datetime import datetime, timezone
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship as orm_relationship

from app.core.database import Base
from app.models.enums import ConsentStatus


class TrustedContact(Base):
    __tablename__ = "trusted_contacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_phone_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    phone_masked: Mapped[str] = mapped_column(String(20), nullable=False)
    relationship: Mapped[str] = mapped_column(String(50), nullable=False, default="Family")
    consent_status: Mapped[ConsentStatus] = mapped_column(
        Enum(ConsentStatus, native_enum=False, length=32),
        default=ConsentStatus.ACCEPTED,
        nullable=False,
    )
    consented_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    user: Mapped["User"] = orm_relationship(back_populates="trusted_contacts")
    guardian_requests: Mapped[list["GuardianRequest"]] = orm_relationship(
        back_populates="trusted_contact", cascade="all, delete-orphan"
    )


