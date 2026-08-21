"""Pydantic schemas for Guardian Approval Subsystem."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ConsentStatus, GuardianOutcome


class TrustedContactCreate(BaseModel):
    user_id: int
    contact_name: str = Field(..., min_length=2, max_length=100)
    phone_number: str = Field(..., min_length=10, max_length=20)
    relationship: str = Field(default="Family", max_length=50)


class TrustedContactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    contact_name: str
    phone_masked: str
    relationship: str
    consent_status: ConsentStatus
    consented_at: datetime
    created_at: datetime


class GuardianRequestCreate(BaseModel):
    transaction_id: int
    trusted_contact_id: Optional[int] = None


class GuardianRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_id: int
    trusted_contact_id: int
    requested_at: datetime
    expires_at: datetime
    resolved_at: Optional[datetime] = None
    outcome: GuardianOutcome
    resolution_notes: Optional[str] = None
    resolution_channel: str
    remaining_seconds: Optional[int] = None
    transaction_amount: Optional[float] = None
    risk_score: Optional[int] = None
    risk_reasons: Optional[list[str]] = None


class GuardianActionRequest(BaseModel):
    notes: Optional[str] = None


class UserOverrideRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=6)
