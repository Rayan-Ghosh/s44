"""
transactions — spec §18.

Spec field list: id, user_id, recipient_id, device_id, amount, timestamp,
location, status.

`payment_method` is a documented addition, not in spec §18's literal field
list, but present in the spec's own canonical transaction-event example
(spec §5, e.g. "payment_method": "UPI"). Kept nullable so it's additive,
not required — the smallest reversible way to avoid silently discarding a
field the spec's own example transaction includes.

`status` uses TransactionStatus (app/models/enums.py), derived from the
Allow/Warn/Confirm-or-Cancel decision flow (spec §13, §15) and the
confirm/cancel/report APIs (spec §19) — not a literal spec enum, since the
spec doesn't enumerate transaction status values itself.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import TransactionStatus


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    recipient_id: Mapped[int] = mapped_column(
        ForeignKey("recipients.id"), nullable=False, index=True
    )
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), nullable=False, index=True)

    # Numeric (not Float) for currency — avoids floating-point rounding on
    # monetary amounts. Two decimal places matches paise/cents precision.
    amount: Mapped[Numeric] = mapped_column(Numeric(12, 2), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payment_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[TransactionStatus] = mapped_column(
        Enum(TransactionStatus, native_enum=False, length=32),
        default=TransactionStatus.PENDING,
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="transactions")
    recipient: Mapped["Recipient"] = relationship(back_populates="transactions")
    device: Mapped["Device"] = relationship(back_populates="transactions")
    risk_scores: Mapped[list["RiskScore"]] = relationship(back_populates="transaction")
    voice_analyses: Mapped[list["VoiceAnalysis"]] = relationship(back_populates="transaction")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="transaction")
    feedback_entries: Mapped[list["UserFeedback"]] = relationship(back_populates="transaction")
    fraud_cases: Mapped[list["FraudCase"]] = relationship(back_populates="transaction")
    model_predictions: Mapped[list["ModelPrediction"]] = relationship(
        back_populates="transaction"
    )
