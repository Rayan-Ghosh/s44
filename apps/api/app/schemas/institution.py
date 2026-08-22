"""Pydantic schemas for Bank Analyst Console."""

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict

from app.models.enums import AlertStatus, FraudCaseStatus, RiskLevel, TransactionStatus


class InstitutionTransactionItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_name: Optional[str] = None
    amount: float
    timestamp: datetime
    location: Optional[str] = None
    status: TransactionStatus
    risk_score: Optional[int] = None
    risk_level: Optional[RiskLevel] = None
    top_risk_factor: Optional[str] = None


class InstitutionAuditDetail(BaseModel):
    transaction_id: int
    user_id: int
    user_name: str
    amount: float
    timestamp: datetime
    location: Optional[str] = None
    status: str
    risk_score: int
    risk_level: str
    decision: str
    plain_language_reasons: list[str]
    sub_scores: dict[str, float]
    shap_contributions_pct: dict[str, float]
    risk_factors: list[dict[str, Any]]
    device_context: dict[str, Any]
    voice_analysis: Optional[dict[str, Any]] = None
    audit_timeline: list[dict[str, Any]]
    model_provenance: dict[str, Any]


class DisputeResolutionRequest(BaseModel):
    status: FraudCaseStatus
    notes: str


class InstitutionStats(BaseModel):
    total_transactions_evaluated: int
    high_risk_flagged_count: int
    guardian_held_count: int
    false_positives_resolved_count: int
    confirmed_fraud_count: int
    average_latency_ms: float
