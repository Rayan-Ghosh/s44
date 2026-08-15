"""API contracts for /api/v1/risk.

The read schemas (RiskScoreRead/RiskFactorRead) are real, usable contracts
today — a risk score can be read back once one exists. The evaluation
request schema exists to define the future POST /api/v1/risk/evaluate
contract without the endpoint doing any real evaluation yet (no ML/fusion
engine exists — see app/api/routers/risk.py and
docs/DEVELOPMENT_PLAN.md Phase 4/6).
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import RiskDecision, RiskLevel


class RiskFactorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    factor_type: str
    factor_name: str
    contribution: float
    explanation: str


class RiskScoreRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_id: int
    final_score: float
    risk_level: RiskLevel
    decision: RiskDecision
    created_at: datetime
    risk_factors: list[RiskFactorRead] = []


class RiskEvaluationRequest(BaseModel):
    transaction_id: int
