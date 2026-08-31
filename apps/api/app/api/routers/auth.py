"""
/api/v1/auth — Authentication router for Avaran mobile & web clients.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.contact_encryption import decrypt_field, encrypt_field
from app.core.database import get_db
from app.core.security import hash_identifier, mask_phone
from app.models.user_contact_info import UserContactInfo
from app.repositories import user_repository
from app.schemas.user import UserCreate
from app.services import user_service
from app.services.exceptions import UserAlreadyExistsError

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    identifier: Optional[str] = Field(None, description="Email, mobile phone number, or user identifier")
    email: Optional[str] = None
    mobile: Optional[str] = None
    password: Optional[str] = Field(default="password123")


class SignupRequest(BaseModel):
    fullName: str = Field(..., min_length=1)
    mobileNumber: str = Field(..., min_length=6)
    email: Optional[str] = ""
    password: Optional[str] = Field(default="password123")
    termsAccepted: Optional[bool] = True


class AuthUserPayload(BaseModel):
    id: int
    name: str
    phone: str
    email: str


class AuthResponse(BaseModel):
    success: bool
    token: str
    user: AuthUserPayload


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    raw_id = payload.identifier or payload.email or payload.mobile
    if not raw_id or not raw_id.strip():
        raise HTTPException(status_code=400, detail="An email address or mobile number is required.")
    identifier = raw_id.strip()

    phone_hash = hash_identifier(identifier)
    user = user_repository.get_user_by_phone_hash(db, phone_hash)
    if user is None:
        # No account exists for this identifier yet. This is a hackathon-demo
        # convenience (login doubles as implicit signup) — NOT a substitute
        # for a real password/OTP check. Previously this fell back to
        # `db.query(User).first()`, which logged an unrecognized identifier
        # into an arbitrary *existing* user's account (an account-takeover
        # bug); creating a fresh user scoped to this identifier is the
        # correct fix regardless of the demo-data cleanup.
        derived_name = identifier.split("@")[0].replace(".", " ").strip() if "@" in identifier else identifier
        user = user_service.create_user(db, UserCreate(name=derived_name or "New User", phone_number=identifier))

    token = f"usr_tok_avaran_{user.id}_{phone_hash[:12]}"

    # Prefer the user's own real saved contact info (this is their own
    # login response, not a listing shown to someone else — unlike
    # trusted-contact phone masking, showing your own account its own real
    # email/phone is fine). Only fall back to a best-effort guess derived
    # from the login identifier when nothing has been saved yet.
    contact = db.query(UserContactInfo).filter(UserContactInfo.user_id == user.id).first()
    saved_email = decrypt_field(contact.email_encrypted) if contact and contact.email_encrypted else ""
    saved_phone = decrypt_field(contact.phone_encrypted) if contact and contact.phone_encrypted else ""

    phone_val = saved_phone or (
        mask_phone(identifier) if identifier.startswith("+") or identifier.isdigit() else "+91 98765 43210"
    )
    email_val = saved_email or (identifier if "@" in identifier else f"{user.name.lower().replace(' ', '.')}@example.com")

    return AuthResponse(
        success=True,
        token=token,
        user=AuthUserPayload(
            id=user.id,
            name=user.name,
            phone=phone_val,
            email=email_val,
        ),
    )


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    phone_clean = payload.mobileNumber.strip()
    if not phone_clean:
        raise HTTPException(status_code=400, detail="Mobile number is required.")

    try:
        user = user_service.create_user(
            db, UserCreate(name=payload.fullName, phone_number=phone_clean)
        )
    except UserAlreadyExistsError as exc:
        raise HTTPException(
            status_code=409, detail="An account with this mobile number already exists."
        ) from exc

    token = f"usr_tok_avaran_{user.id}_new"

    # Save what the signup form actually collected so it round-trips on the
    # very next login/profile fetch, instead of only ever being echoed back
    # for this one response.
    email_val = payload.email or f"{user.name.lower().replace(' ', '.')}@example.com"
    contact = UserContactInfo(
        user_id=user.id,
        email_encrypted=encrypt_field(payload.email) if payload.email else None,
        phone_encrypted=encrypt_field(phone_clean),
    )
    db.add(contact)
    db.commit()

    return AuthResponse(
        success=True,
        token=token,
        user=AuthUserPayload(
            id=user.id,
            name=user.name,
            phone=phone_clean,
            email=email_val,
        ),
    )
