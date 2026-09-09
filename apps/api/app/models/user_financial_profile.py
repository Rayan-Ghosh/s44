"""
user_financial_profiles — personalized transaction-pattern baseline.

One row per user. Holds the interpretable statistics (percentiles, not a
black-box score) that back the on-device advisory model described in
docs/ML_ARCHITECTURE.md §6's "User Risk Profile" — the amounts themselves
are never stored here, only the derived summary, computed from the user's
own confirmed/completed transactions (see app/models/transaction.py) plus
any statement-upload history (see statement_ledger_transaction.py).

Retraining eligibility (72h cooldown, >=15 new transactions, active within
14 days) is evaluated against `last_retrained_at` / `pending_transactions_
count` / `last_active_at` by
app/services/user_pattern_trainer.py::is_eligible_for_retrain — kept as
plain columns rather than derived at query time so the opportunistic
scheduler's SQL WHERE clause (app/services/user_pattern_scheduler.py) can
filter on them directly and cheaply.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import UserPersonaArchetype


class UserFinancialProfile(Base):
    __tablename__ = "user_financial_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), unique=True, nullable=False, index=True
    )

    archetype: Mapped[UserPersonaArchetype] = mapped_column(
        Enum(UserPersonaArchetype, native_enum=False, length=32),
        default=UserPersonaArchetype.GENERAL,
        nullable=False,
    )

    # Bayesian-shrunk percentiles — see ml/profiles/user_pattern.py. Numeric
    # (not Float), matching Transaction.amount's currency convention.
    p50_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    p90_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    p99_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)

    total_transactions_at_last_train: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    # Count of confirmed/completed transactions since last_retrained_at —
    # the volume gate (>=15) in is_eligible_for_retrain reads this directly.
    pending_transactions_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    last_retrained_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_active_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, index=True
    )
    needs_retrain: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    active_artifact_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("user_model_artifacts.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user: Mapped["User"] = relationship()
    active_artifact: Mapped[Optional["UserModelArtifact"]] = relationship(
        foreign_keys=[active_artifact_id]
    )
