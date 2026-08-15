"""
risk_scores — spec §18.

Spec field list: id, transaction_id, fraud_probability, anomaly_score,
device_score, behaviour_score, voice_score, final_score, decision,
created_at.

`risk_level` is a documented addition beyond that literal field list.
Spec §12's decision package example returns risk_score, risk_level,
risk_factors, AND decision as four distinct pieces of information — the
§18 table just doesn't list risk_level as a column. Omitting it here would
mean the database couldn't actually store what spec §12/§14 says the
fusion/decision output contains, so it's added rather than silently
dropped. This is filling a gap between two spec sections, not inventing a
new requirement.

Individual component scores (fraud_probability, anomaly_score,
device_score, behaviour_score, voice_score) are nullable: a given
evaluation may not have every signal available (e.g. no voice call
occurred), matching spec §12's fusion inputs being combined from whichever
detectors actually ran. final_score and decision are required — they are
the fusion engine's actual output, per spec §12: "individual detectors
should not directly block transactions... The fusion output should be a
structured decision package."
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import RiskDecision, RiskLevel


class RiskScore(Base):
    __tablename__ = "risk_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id"), nullable=False, index=True
    )

    fraud_probability: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    anomaly_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    device_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    behaviour_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    voice_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Fusion engine output — spec §13 thresholds, 0-100 scale.
    final_score: Mapped[float] = mapped_column(Float, nullable=False)
    risk_level: Mapped[RiskLevel] = mapped_column(
        Enum(RiskLevel, native_enum=False, length=16), nullable=False
    )
    decision: Mapped[RiskDecision] = mapped_column(
        Enum(RiskDecision, native_enum=False, length=32), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )

    transaction: Mapped["Transaction"] = relationship(back_populates="risk_scores")
    risk_factors: Mapped[list["RiskFactor"]] = relationship(back_populates="risk_score")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="risk_score")
