"""API contracts for /api/v1/transactions.

TransactionCreate takes raw device/recipient identifiers, not internal
device_id/recipient_id foreign keys — the caller (a payment client)
naturally knows "which phone/UPI handle", not S40's internal row IDs.
app/services/transaction_service.py resolves these into hashed,
get-or-create Device/Recipient rows before persisting the transaction.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TransactionStatus


class TransactionCreate(BaseModel):
    user_id: int
    recipient_identifier: str = Field(
        ..., min_length=1, max_length=255, description="Raw recipient handle (UPI ID, phone, account ref) — hashed before storage."
    )
    recipient_display_name: Optional[str] = Field(default=None, max_length=255)
    device_identifier: str = Field(
        ..., min_length=1, max_length=255, description="Raw device fingerprint — hashed before storage."
    )
    device_name: Optional[str] = Field(default=None, max_length=120, description="Human-readable device label reported by the client, e.g. via expo-device.")
    device_type: Optional[str] = Field(default=None, max_length=120)
    amount: Decimal = Field(..., gt=0, description="Transaction amount, must be positive.")
    location: Optional[str] = Field(default=None, max_length=255)
    payment_method: Optional[str] = Field(default=None, max_length=50)


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    recipient_id: int
    device_id: int
    amount: Decimal
    timestamp: datetime
    location: Optional[str]
    payment_method: Optional[str]
    status: TransactionStatus
    authorization_required: bool = False
    authorization_status: Optional[str] = "NONE"
    authorized_at: Optional[datetime] = None
    authorization_method: Optional[str] = None
    merchant: Optional[str] = None
    risk_level: Optional[str] = "LOW"
    risk_score: Optional[float] = 0.0
    risk_factors: Optional[list] = []
    reasons: Optional[list[str]] = []
    # AVARAN PAY Part 2 persisted card fields
    evaluation_id: Optional[str] = None
    recipient_input: Optional[str] = None
    recipient_type: Optional[str] = None
    normalized_recipient: Optional[str] = None
    display_name: Optional[str] = None
    resolution_status: Optional[str] = None
    note: Optional[str] = None
    decision: Optional[str] = "ALLOW"
    evaluation_timestamp: Optional[str] = None
    workflow_stage: Optional[str] = "EVALUATION_COMPLETED"
    guardian_required: Optional[bool] = False



class AuthorizeTransactionRequest(BaseModel):
    method: Optional[str] = Field(default="BIOMETRIC", description="Authorization method: BIOMETRIC or DEVICE_CREDENTIAL")
    stage: Optional[str] = Field(default=None, description="Workflow stage: must be PAYMENT_AUTHORIZED")


class SubmitTransactionRequest(BaseModel):
    stage: Optional[str] = Field(default=None, description="Workflow stage: must be PAYMENT_SUBMITTED")
    payment_app_used: Optional[str] = Field(default=None, description="Payment app used for dispatch, e.g. Google Pay UPI")


class ConfirmTransactionRequest(BaseModel):
    stage: Optional[str] = Field(default=None, description="Workflow stage: must be PAYMENT_COMPLETED")
    payment_app_used: Optional[str] = Field(default=None, description="Payment app used, e.g. Google Pay UPI")
    utr_reference: Optional[str] = Field(default=None, max_length=64, description="UPI transaction reference, if available")

