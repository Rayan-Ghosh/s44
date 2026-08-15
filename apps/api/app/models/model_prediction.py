"""
model_predictions — listed among spec §3's core entities, no field list in
§18 (same documented gap as `recipients`/`alerts`).

Purpose, inferred from spec §17 (Model Health & Monitoring wants metrics
"from the evaluation/inference metadata where possible") and spec §23
(models are trained offline and loaded for inference, never trained in the
API process): this table is a raw, per-model, per-transaction inference
log — one row per individual detector's output (e.g. the XGBoost fraud
model's raw fraud_probability) — kept separate from `risk_scores`, which
stores the fusion engine's already-combined inputs. Keeping them separate
means individual model outputs can be audited/evaluated independently of
whatever the fusion layer later did with them, without overloading the
risk_scores table's shape.

Phase 2 does not populate this table — there are no trained models yet.
It exists so the later ML inference phase (docs/DEVELOPMENT_PLAN.md
Phase 4) has a place to log to without a schema change.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ModelPrediction(Base):
    __tablename__ = "model_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id"), nullable=False, index=True
    )
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    output_type: Mapped[str] = mapped_column(String(50), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    transaction: Mapped["Transaction"] = relationship(back_populates="model_predictions")
