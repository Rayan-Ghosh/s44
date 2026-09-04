"""API contracts for /api/v1/risk.

The read schemas (RiskScoreRead/RiskFactorRead) are real, usable contracts
today — a risk score can be read back once one exists. The evaluation
request schema exists to define the future POST /api/v1/risk/evaluate
contract without the endpoint doing any real evaluation yet (no ML/fusion
engine exists — see app/api/routers/risk.py and
docs/DEVELOPMENT_PLAN.md Phase 4/6).
"""

from datetime import datetime
from typing import Optional

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


class PrePaymentRecipientDetail(BaseModel):
    raw_input: str
    normalized: str
    recipient_type: str
    display_name: Optional[str] = None
    resolution_status: str


class RiskEvaluationRequest(BaseModel):
    transaction_id: Optional[int] = None
    recipient: Optional[str] = None
    recipient_type: Optional[str] = None
    amount: Optional[float] = None
    note: Optional[str] = None
    qr_data: Optional[str] = None
    contact_phone: Optional[str] = None
    user_id: Optional[int] = None


class PrePaymentEvaluationResponse(BaseModel):
    evaluation_id: Optional[str] = None
    stage: str
    risk_score: float
    risk_level: str
    decision: str
    plain_language_reasons: list[str] = []
    risk_factors: list[str] = []
    risk_contributions_pct: dict[str, float] = {}
    sub_scores: dict[str, float] = {}
    recipient: Optional[PrePaymentRecipientDetail] = None
    amount: Optional[float] = None
    note: Optional[str] = None
    qr_data: Optional[str] = None
    latency_ms: Optional[float] = None
    timestamp: str
    expires_at: Optional[str] = None
    guardian_required: bool = False
    disclaimer: str

