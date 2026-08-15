"""
voice_analysis — spec §18.

Spec field list: id, transaction_id, transcript_hash, urgency_score,
threat_score, authority_score, financial_request_score, coercion_score,
overall_score.

`transcript_hash` (not raw transcript text) matches spec §21's "do not
retain raw audio... prefer: audio -> transcription/features -> risk
analysis -> discard raw audio" — the spec's own column name already
implies the transcript itself isn't stored in the clear either.

`transaction_id` is nullable: spec's voice-phishing demo scenario
(§26 Scenario 3) has the voice call happen BEFORE the payment is
initiated ("Suspicious call -> Voice analysis -> ... -> User initiates
payment -> Risk fusion increases"), so a voice analysis record can exist
before any transaction row does. It gets linked once the transaction is
created. This nullability is a documented, reversible interpretation, not
stated explicitly in spec §18.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class VoiceAnalysis(Base):
    __tablename__ = "voice_analysis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("transactions.id"), nullable=True, index=True
    )
    transcript_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    urgency_score: Mapped[float] = mapped_column(Float, nullable=False)
    threat_score: Mapped[float] = mapped_column(Float, nullable=False)
    authority_score: Mapped[float] = mapped_column(Float, nullable=False)
    financial_request_score: Mapped[float] = mapped_column(Float, nullable=False)
    coercion_score: Mapped[float] = mapped_column(Float, nullable=False)
    overall_score: Mapped[float] = mapped_column(Float, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    transaction: Mapped[Optional["Transaction"]] = relationship(
        back_populates="voice_analyses"
    )
