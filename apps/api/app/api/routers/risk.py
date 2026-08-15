"""
/api/v1/risk — establishes the contract spec §19 requires, without
pretending the fusion/decision engine exists yet.

GET /{transaction_id} is fully real: it reads back whatever risk_scores
row exists (e.g. from seed fixtures during development). There is nothing
fake about it — it just has nothing to return until Phase 6 (Risk Engine)
starts writing real rows.

POST /evaluate is deliberately NOT implemented. Returning a fabricated
risk_score here would violate CLAUDE.md's "never fabricate ML metrics...
model performance" rule as directly as anything could — a hard-coded
fraud_probability presented as if a model produced it. Instead it returns
501 with a clear explanation, so the URL/request contract exists for the
frontend and future risk engine to build against, but nothing pretends to
work yet.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories import risk_repository, transaction_repository
from app.schemas.risk import RiskEvaluationRequest, RiskScoreRead

router = APIRouter(prefix="/api/v1/risk", tags=["risk"])


@router.get("/{transaction_id}", response_model=RiskScoreRead)
def get_risk_score(transaction_id: int, db: Session = Depends(get_db)) -> RiskScoreRead:
    if transaction_repository.get_transaction(db, transaction_id) is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")

    risk_score = risk_repository.get_latest_risk_score(db, transaction_id)
    if risk_score is None:
        raise HTTPException(
            status_code=404,
            detail=f"No risk evaluation exists yet for transaction {transaction_id}.",
        )
    return risk_score


@router.post("/evaluate", status_code=501)
def evaluate_risk(payload: RiskEvaluationRequest) -> dict:
    raise HTTPException(
        status_code=501,
        detail=(
            "Risk evaluation is not implemented yet. The fraud/anomaly/"
            "device/voice detectors and the fusion engine are later, "
            "controlled phases (see docs/DEVELOPMENT_PLAN.md Phase 4-6). "
            "This endpoint exists to establish the request contract."
        ),
    )
