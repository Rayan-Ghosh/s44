"""
trusted_contacts — spec §6 (Guardian Approval Subsystem).

Represents an enrolled trusted family member or contact who can approve
high-risk payments on behalf of the user during a live scam attempt.

`guardian_user_id` (nullable FK → users.id) was added by migration
b3c4d5e6f7a8 to create a real, queryable link between this row and the
actual Avaran User account of the trusted contact person (the guardian).
This is required for multi-device notification delivery and for Rayan's
dashboard to retrieve pending Guardian Approval requests keyed on
his own user_id rather than on a bare phone-hash lookup.

The column is nullable so all pre-existing rows remain valid — only rows
where the trusted contact is also a registered Avaran user will populate it.
"""

from datetime import datetime, timezone
from typing import Optional
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

    # Real FK link to the guardian's own Avaran User account (added by
    # migration b3c4d5e6f7a8).  Nullable: only populated when the trusted
    # contact is also a registered Avaran user.  This is the authoritative
    # way to determine which User should receive a Guardian Approval request
    # — never rely on contact_name matching alone.
    guardian_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True, index=True
    )

    user: Mapped["User"] = orm_relationship(
        back_populates="trusted_contacts",
        foreign_keys="TrustedContact.user_id",
    )
    # The guardian's own User account (if they are a registered Avaran user).
    guardian_user: Mapped[Optional["User"]] = orm_relationship(
        foreign_keys="TrustedContact.guardian_user_id",
    )
    guardian_requests: Mapped[list["GuardianRequest"]] = orm_relationship(
        back_populates="trusted_contact", cascade="all, delete-orphan"
    )


