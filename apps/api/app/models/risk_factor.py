"""
risk_factors — spec §18.

Spec field list: id, risk_score_id, factor_type, factor_name, contribution,
explanation.

`factor_type` is kept as a free-text String rather than an enum: the spec
uses inconsistent category taxonomies across sections (fusion inputs in
§12 are Transaction/Behaviour/Device/Voice/Rule/Context; the explainability
example in §14 uses Transaction/Device/Behaviour/Recipient/Other). Forcing
one of those onto a strict enum now would be guessing which taxonomy the
spec actually intends — a genuinely undecided detail, left as a documented
convention rather than a constraint.

`contribution` is a percentage (0-100), matching spec §14's display format
("Transaction 31%", "Device 20%", ...) directly rather than a 0-1 fraction.
"""

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RiskFactor(Base):
    __tablename__ = "risk_factors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    risk_score_id: Mapped[int] = mapped_column(
        ForeignKey("risk_scores.id"), nullable=False, index=True
    )
    # Convention (not an enforced enum): "transaction" | "device" |
    # "behaviour" | "voice" | "rule" | "recipient" | "context" | "other".
    factor_type: Mapped[str] = mapped_column(String(50), nullable=False)
    factor_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contribution: Mapped[float] = mapped_column(Float, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)

    risk_score: Mapped["RiskScore"] = relationship(back_populates="risk_factors")
