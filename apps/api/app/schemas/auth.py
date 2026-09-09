"""
Pydantic schemas for authentication and session management.
Spec: DATABASE_INTEGRATION_REQUIREMENTS.md §5.3
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    identifier: Optional[str] = Field(
        None, description="Email address, mobile phone number, or user identifier"
    )
    email: Optional[str] = None
    mobile: Optional[str] = None
    password: str = Field(..., min_length=1, description="Account password")
    device_id: Optional[str] = None


class SignupRequest(BaseModel):
    fullName: str = Field(..., min_length=1, max_length=255, description="Full name")
    mobileNumber: str = Field(..., min_length=6, max_length=32, description="Mobile number")
    email: Optional[str] = Field(default="", description="Email address")
    password: str = Field(..., min_length=6, max_length=128, description="Password")
    termsAccepted: Optional[bool] = True
    device_id: Optional[str] = None


class AuthUserPayload(BaseModel):
    id: int
    name: str
    phone: str
    email: str
    created_at: Optional[datetime] = None


class TokenResponse(BaseModel):
    success: bool = True
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: AuthUserPayload


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., description="Active refresh token")


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None


class AuthStatusResponse(BaseModel):
    success: bool
    message: str
