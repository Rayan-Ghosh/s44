"""Pydantic schemas for 1-Click Simulator Presets."""

from typing import Any, Optional
from pydantic import BaseModel


class ScenarioPreset(BaseModel):
    id: str
    title: str
    badge: str
    description: str
    expected_band: str
    expected_score_range: str
    payload: dict[str, Any]


class ScenarioExecuteResponse(BaseModel):
    scenario_id: str
    transaction_id: int
    user_name: str
    amount: float
    risk_score: int
    risk_level: str
    decision: str
    plain_language_reasons: list[str]
    risk_contributions_pct: dict[str, float]
    latency_ms: float
    held_for_guardian: bool
    guardian_request_id: Optional[int] = None
