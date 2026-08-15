"""API contracts for /api/v1/alerts. Read-only in Phase 2 — nothing yet
creates alerts automatically, since that depends on the future risk engine
(docs/DEVELOPMENT_PLAN.md Phase 6). Seed data provides example rows so the
endpoint is exercisable during development."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import AlertStatus, RiskLevel


class AlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_id: int
    severity: RiskLevel
    status: AlertStatus
    summary: str
    created_at: datetime
