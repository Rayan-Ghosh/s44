from typing import Optional

from sqlalchemy.orm import Session

from app.models.risk_score import RiskScore


def get_latest_risk_score(db: Session, transaction_id: int) -> Optional[RiskScore]:
    return (
        db.query(RiskScore)
        .filter(RiskScore.transaction_id == transaction_id)
        .order_by(RiskScore.created_at.desc())
        .first()
    )
