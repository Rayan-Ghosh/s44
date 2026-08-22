from typing import Any, Optional
from sqlalchemy.orm import Session

from app.models.enums import RiskDecision, RiskLevel
from app.models.risk_factor import RiskFactor
from app.models.risk_score import RiskScore


def get_latest_risk_score(db: Session, transaction_id: int) -> Optional[RiskScore]:
    return (
        db.query(RiskScore)
        .filter(RiskScore.transaction_id == transaction_id)
        .order_by(RiskScore.created_at.desc())
        .first()
    )


def save_risk_evaluation(
    db: Session,
    *,
    transaction_id: int,
    fraud_probability: float,
    final_score: float,
    risk_level: RiskLevel,
    decision: RiskDecision,
    risk_factors: list[dict[str, Any]],
) -> RiskScore:
    risk_score = RiskScore(
        transaction_id=transaction_id,
        fraud_probability=fraud_probability,
        final_score=final_score,
        risk_level=risk_level,
        decision=decision,
    )
    db.add(risk_score)
    db.commit()
    db.refresh(risk_score)

    for factor in risk_factors:
        db_factor = RiskFactor(
            risk_score_id=risk_score.id,
            factor_type=str(factor.get("factor_type", "ml_signal")),
            factor_name=str(factor.get("name", factor.get("factor_name", "risk_factor"))),
            contribution=float(factor.get("contribution", 0.0)),
            explanation=str(factor.get("explanation", factor.get("label", ""))),
        )
        db.add(db_factor)

    db.commit()
    db.refresh(risk_score)
    return risk_score
