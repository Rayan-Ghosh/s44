"""API contracts for /api/v1/payments (AVARAN PAY spec §3, §11).

`PaymentPrepareRequest` is the spec's canonical payment object, adapted to
this repo's existing convention of raw device/recipient identifiers (see
app/schemas/transaction.py) rather than internal FK ids — the caller knows
"which UPI handle / phone number", not S40's row ids.
"""

from decimal import Decimal
from typing import Any, Optional


from pydantic import BaseModel, Field, model_validator

PaymentSource = str  # "QR" | "UPI_ID" | "MOBILE" | "PAYMENT_REQUEST" | "LINK"

VALID_SOURCES = {"QR", "UPI_ID", "MOBILE", "PAYMENT_REQUEST", "LINK"}


class PaymentPrepareRequest(BaseModel):
    user_id: int
    source: PaymentSource = Field(..., description="QR | UPI_ID | MOBILE | PAYMENT_REQUEST | LINK")
    amount: Decimal = Field(..., gt=0, description="Transaction amount, must be positive.")
    upi_id: Optional[str] = Field(default=None, max_length=255)
    phone_number: Optional[str] = Field(default=None, max_length=32)
    recipient_name: Optional[str] = Field(default=None, max_length=255)
    note: Optional[str] = Field(default=None, max_length=255)
    device_identifier: str = Field(..., min_length=1, max_length=255)
    device_name: Optional[str] = Field(default=None, max_length=120)
    device_type: Optional[str] = Field(default=None, max_length=120)
    session_id: Optional[str] = Field(default=None, max_length=120)
    client_request_id: Optional[str] = Field(
        default=None, max_length=120, description="Idempotency key for POST /payments/prepare."
    )
    location: Optional[str] = Field(default=None, max_length=255)
    # Persisted pre-payment evaluation details (Part 2)
    evaluation_id: Optional[str] = Field(default=None, max_length=120)
    risk_score: Optional[float] = Field(default=None, ge=0, le=100)
    risk_level: Optional[str] = Field(default=None, max_length=20)
    decision: Optional[str] = Field(default=None, max_length=50)
    risk_factors: Optional[list[Any]] = Field(default=None)
    plain_language_reasons: Optional[list[str]] = Field(default=None)
    recipient_type: Optional[str] = Field(default=None, max_length=20)
    resolution_status: Optional[str] = Field(default=None, max_length=20)
    evaluation_timestamp: Optional[str] = Field(default=None)
    evaluation_expires_at: Optional[str] = Field(default=None)
    guardian_required: Optional[bool] = Field(default=None)

    @model_validator(mode="after")
    def _validate_source_fields(self) -> "PaymentPrepareRequest":
        if self.source not in VALID_SOURCES:
            raise ValueError(f"source must be one of {sorted(VALID_SOURCES)}.")
        if not self.upi_id and not self.phone_number:
            raise ValueError("Either upi_id or phone_number is required to identify a recipient.")
        return self



class LaunchUpiRequest(BaseModel):
    app: str = Field(..., min_length=1, max_length=50, description="Selected UPI app, e.g. GPAY, PHONEPE, BHIM.")
    amount: Decimal = Field(..., gt=0, description="Amount from the deep-link payload, must match the transaction.")
    recipient_identifier: str = Field(
        ..., min_length=1, max_length=255, description="Recipient handle from the deep-link payload, must match the transaction."
    )


class ConfirmPaymentRequest(BaseModel):
    utr_reference: Optional[str] = Field(default=None, max_length=64)
