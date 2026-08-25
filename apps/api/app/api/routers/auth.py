"""
/api/v1/auth — Authentication endpoints for mobile and web clients.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_identifier, mask_phone
from app.models.user import User
from app.repositories import user_repository

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    identifier: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    password: Optional[str] = "password123"


class SignupRequest(BaseModel):
    fullName: str
    mobileNumber: str
    email: Optional[str] = ""
    password: Optional[str] = "password123"
    termsAccepted: Optional[bool] = True


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    raw_id = payload.identifier or payload.email or payload.mobile or "user_001"
    identifier = raw_id.strip()
    if not identifier:
        identifier = "user_001"

    # Find or initialize user
    phone_hash = hash_identifier(identifier)
    user = user_repository.get_user_by_phone_hash(db, phone_hash)
    
    if user is None:
        user = db.query(User).first()
        if user is None:
            name = identifier.split("@")[0].title() if "@" in identifier else "Rahul Sharma"
            user = user_repository.create_user(
                db,
                name=name,
                phone_hash=phone_hash,
                risk_profile={"normal_avg_amount": 2500.0, "normal_std_amount": 800.0},
            )

    token = f"usr_tok_{user.id}_{phone_hash[:12]}"
    display_email = identifier if "@" in identifier else f"{user.name.lower().replace(' ', '.')}@example.com"
    display_phone = identifier if not "@" in identifier else "+91 98765 43210"

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user.id,
            "name": user.name,
            "phone": display_phone,
            "email": display_email,
        },
    }


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> dict:
    phone_clean = payload.mobileNumber.strip()
    if not phone_clean:
        raise HTTPException(status_code=400, detail="Mobile number is required.")

    phone_hash = hash_identifier(phone_clean)
    existing = user_repository.get_user_by_phone_hash(db, phone_hash)
    if existing:
        user = existing
    else:
        user = user_repository.create_user(
            db,
            name=payload.fullName.strip() or "Rahul Sharma",
            phone_hash=phone_hash,
            risk_profile={"normal_avg_amount": 2000.0, "normal_std_amount": 500.0},
        )

    token = f"usr_tok_{user.id}_{phone_hash[:12]}"
    return {
        "success": True,
        "token": token,
        "user": {
            "id": user.id,
            "name": user.name,
            "phone": payload.mobileNumber,
            "email": payload.email or f"{user.name.lower().replace(' ', '.')}@example.com",
        },
    }
