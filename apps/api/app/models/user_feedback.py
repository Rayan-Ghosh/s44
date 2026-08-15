"""
user_feedback — spec §18.

Spec field list: id, transaction_id, user_decision, feedback_type,
created_at.

`user_decision` uses UserDecision (CONFIRM/CANCEL/REPORT), mirroring the
spec §19 endpoints (/confirm, /cancel, /report) exactly.

`feedback_type` is kept as free text rather than an enum: spec §16's only
concrete example is "legitimate" (used to derive a false-positive case),
without enumerating the full set of possible values. A String preserves
that flexibility instead of guessing a closed set.

A transaction is expected to receive at most one feedback record per the
spec's feedback-loop description (spec §16: "AI prediction -> User
decision -> Transaction outcome -> Feedback") — enforced with a unique
constraint here as the smallest reversible interpretation.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import UserDecision


class UserFeedback(Base):
    __tablename__ = "user_feedback"
    __table_args__ = (
        UniqueConstraint("transaction_id", name="uq_user_feedback_transaction"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id"), nullable=False, index=True
    )
    user_decision: Mapped[UserDecision] = mapped_column(
        Enum(UserDecision, native_enum=False, length=16), nullable=False
    )
    feedback_type: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    transaction: Mapped["Transaction"] = relationship(back_populates="feedback_entries")
