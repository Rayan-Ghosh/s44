"""
/api/v1/auth — Authentication, Rate Limiting, Anti-Enumeration, Single-Device, OTP & Password Reset Router.
"""

from datetime import datetime, timedelta, timezone
import secrets
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.contact_encryption import decrypt_field, encrypt_field
from app.core.database import get_db
from app.core.security import hash_identifier, hash_password, mask_phone, validate_password_strength, verify_password
from app.models.otp_verification import OtpVerification
from app.models.password_reset_authorization import PasswordResetAuthorization
from app.models.user_contact_info import UserContactInfo
from app.repositories import user_repository
from app.schemas.user import UserCreate
from app.services import user_service
from app.services.exceptions import UserAlreadyExistsError
from app.services.otp_service import generate_secure_otp, hash_otp, mask_contact, otp_delivery_provider, verify_otp
from app.services.rate_limit_service import RateLimitService, extract_client_ip
from app.services.security_audit_service import SecurityAuditService
from app.services.session_service import SessionService

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

# Pre-computed dummy Argon2id hash for constant-time failure response on nonexistent accounts
DUMMY_ARGON2_HASH = hash_password("avaran_timing_safe_dummy_credential")


# Request & Response Schemas
class LoginRequest(BaseModel):
    identifier: Optional[str] = Field(None, description="Email, mobile phone number, or user identifier")
    email: Optional[str] = None
    mobile: Optional[str] = None
    password: Optional[str] = Field(default=None, description="Account password")
    deviceId: Optional[str] = Field(default="default-mobile-device", description="Cryptographic installation device ID")
    deviceName: Optional[str] = None
    deviceType: Optional[str] = None


class SignupRequest(BaseModel):
    fullName: str = Field(..., min_length=1)
    mobileNumber: str = Field(..., min_length=6)
    email: Optional[str] = ""
    password: Optional[str] = Field(default=None, description="Account password meeting strength requirements")
    termsAccepted: Optional[bool] = True
    deviceId: Optional[str] = Field(default="default-mobile-device", description="Cryptographic installation device ID")
    deviceName: Optional[str] = None
    deviceType: Optional[str] = None


class VerifyOtpRequest(BaseModel):
    userId: int = Field(..., description="User ID to verify")
    otp: str = Field(..., min_length=4, max_length=10, description="6-digit verification code")
    deviceId: Optional[str] = Field(default="default-mobile-device", description="Cryptographic installation device ID")
    deviceName: Optional[str] = None
    deviceType: Optional[str] = None


class ResendOtpRequest(BaseModel):
    userId: int = Field(..., description="User ID for OTP resend")


class RequestDeviceTransferRequest(BaseModel):
    userId: int = Field(..., description="User ID requesting device transfer")
    password: Optional[str] = Field(default=None, description="Account password if set")
    deviceId: str = Field(..., description="New device identifier")
    deviceName: Optional[str] = None
    deviceType: Optional[str] = None


class VerifyDeviceTransferRequest(BaseModel):
    userId: int = Field(..., description="User ID completing transfer")
    otp: str = Field(..., min_length=4, max_length=10, description="6-digit transfer code")
    deviceId: str = Field(..., description="New device identifier to bind")
    deviceName: Optional[str] = None
    deviceType: Optional[str] = None


class RequestPasswordResetRequest(BaseModel):
    identifier: str = Field(..., min_length=3, description="Registered email address or mobile number")


class RequestPasswordResetResponse(BaseModel):
    success: bool
    maskedContact: str
    resendCooldownSeconds: int = 30
    isLiveDelivery: bool = False
    message: str = "If an account exists for this information, a verification process has been initiated."
    devTestCode: Optional[str] = Field(
        default=None,
        description="Development/Demo testing code. Strictly omitted/null in production.",
    )


class VerifyPasswordResetOtpRequest(BaseModel):
    identifier: str = Field(..., min_length=3, description="Registered email address or mobile number")
    otp: str = Field(..., min_length=4, max_length=10, description="6-digit reset code")


class VerifyPasswordResetOtpResponse(BaseModel):
    success: bool
    resetToken: str
    message: str = "Verification successful. Please create a new password."


class ResetPasswordRequest(BaseModel):
    resetToken: str = Field(..., min_length=16, description="Single-use password reset authorization token")
    newPassword: str = Field(..., min_length=10, description="New strong password")


class ResetPasswordResponse(BaseModel):
    success: bool
    message: str = "Password has been reset successfully. Please log in with your new password."


class AuthUserPayload(BaseModel):
    id: int
    name: str
    phone: str
    email: str


class AuthResponse(BaseModel):
    success: bool
    token: str
    user: AuthUserPayload


class SignupInitResponse(BaseModel):
    success: bool
    pendingVerification: bool = True
    userId: int
    maskedContact: str
    resendCooldownSeconds: int = 30
    isLiveDelivery: bool = False
    message: str = "Verification code generated. Enter the 6-digit code to activate your account."
    devTestCode: Optional[str] = Field(
        default=None,
        description="Development/Demo testing code. Strictly omitted/null in production.",
    )
    user: Optional[AuthUserPayload] = None


class ResendOtpResponse(BaseModel):
    success: bool
    maskedContact: str
    resendCooldownSeconds: int = 30
    isLiveDelivery: bool = False
    message: str = "A new 6-digit verification code has been generated."
    devTestCode: Optional[str] = Field(
        default=None,
        description="Development/Demo testing code. Strictly omitted/null in production.",
    )


class TransferInitResponse(BaseModel):
    success: bool
    requiresDeviceTransfer: bool = True
    userId: int
    maskedContact: str
    resendCooldownSeconds: int = 30
    isLiveDelivery: bool = False
    message: str = "A transfer verification code has been generated for your registered phone number."
    devTestCode: Optional[str] = Field(
        default=None,
        description="Development/Demo testing code. Strictly omitted/null in production.",
    )


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return authorization


def _find_user_by_identifier(db: Session, identifier: str):
    """Finds user by phone hash, normalized phone digits, or email without leaking existence."""
    clean = identifier.strip()
    phone_hash = hash_identifier(clean)
    user = user_repository.get_user_by_phone_hash(db, phone_hash)
    if user is not None:
        return user

    # Also try normalized digits phone hash (e.g. +919876543210)
    digits_only = "".join(c for c in clean if c.isdigit())
    if digits_only:
        for candidate in (f"+91{digits_only[-10:]}", f"+{digits_only}", digits_only):
            cand_hash = hash_identifier(candidate)
            user = user_repository.get_user_by_phone_hash(db, cand_hash)
            if user is not None:
                return user

    # Check encrypted contact infos for email or phone matches
    contacts = db.query(UserContactInfo).all()
    for c in contacts:
        if c.email_encrypted and "@" in clean:
            try:
                dec_email = decrypt_field(c.email_encrypted).lower()
                if dec_email == clean.lower():
                    return user_repository.get_user(db, c.user_id)
            except Exception:
                pass
        if c.phone_encrypted and digits_only:
            try:
                dec_phone = decrypt_field(c.phone_encrypted)
                dec_digits = "".join(ch for ch in dec_phone if ch.isdigit())
                if dec_digits and (dec_digits.endswith(digits_only[-10:]) or digits_only.endswith(dec_digits[-10:])):
                    return user_repository.get_user(db, c.user_id)
            except Exception:
                pass
    return None


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    x_device_name: Optional[str] = Header(None, alias="X-Device-Name"),
    x_device_type: Optional[str] = Header(None, alias="X-Device-Type"),
    db: Session = Depends(get_db),
) -> AuthResponse:
    client_ip = extract_client_ip(request)
    raw_id = payload.identifier or payload.email or payload.mobile
    if not raw_id or not raw_id.strip():
        raise HTTPException(status_code=400, detail="An email address or mobile number is required.")
    identifier = raw_id.strip()

    # 1. Rate Limit & Brute Force Check
    is_allowed, retry_after, limit_msg = RateLimitService.check_login_rate_limit(
        db, identifier, client_ip
    )
    if not is_allowed:
        SecurityAuditService.log_event("LOGIN_RATE_LIMITED", ip_address=client_ip, details={"retry_after": retry_after})
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=limit_msg or "Too many failed attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    # 2. Look up account by phone or email
    user = _find_user_by_identifier(db, identifier)

    # 3. Timing-Safe Credential Verification & Anti-Enumeration
    if user is None:
        verify_password(payload.password or "invalid", DUMMY_ARGON2_HASH)
        RateLimitService.record_login_failure(db, identifier, client_ip)
        SecurityAuditService.log_event("LOGIN_FAILURE", ip_address=client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/mobile number or password.",
        )

    # Enforce verification check
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account verification required. Please complete OTP verification.",
        )

    # Verify password if set
    contact = db.query(UserContactInfo).filter(UserContactInfo.user_id == user.id).first()
    if contact and contact.password_hash:
        if not payload.password or not verify_password(payload.password, contact.password_hash):
            RateLimitService.record_login_failure(db, identifier, client_ip)
            SecurityAuditService.log_event("LOGIN_FAILURE", user_id=user.id, ip_address=client_ip)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email/mobile number or password.",
            )
    elif contact and not contact.password_hash and payload.password:
        contact.password_hash = hash_password(payload.password)
        db.commit()

    # 4. Successful credential verification -> Reset account-level failure counter
    RateLimitService.record_login_success(db, identifier)
    SecurityAuditService.log_event("LOGIN_SUCCESS", user_id=user.id, ip_address=client_ip)

    saved_email = decrypt_field(contact.email_encrypted) if contact and contact.email_encrypted else ""
    saved_phone = decrypt_field(contact.phone_encrypted) if contact and contact.phone_encrypted else ""

    # 5. Device Binding Check
    effective_dev_id = payload.deviceId or x_device_id or "default-mobile-device"
    effective_dev_name = payload.deviceName or x_device_name or "Avaran Client Device"
    effective_dev_type = payload.deviceType or x_device_type or "Mobile App"

    is_dev_allowed, requires_transfer, _ = SessionService.check_device_access(
        db=db,
        user_id=user.id,
        device_id=effective_dev_id,
        device_name=effective_dev_name,
        device_type=effective_dev_type,
    )

    if requires_transfer:
        masked = mask_contact(saved_phone or identifier)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "requiresDeviceTransfer": True,
                "userId": user.id,
                "maskedContact": masked,
                "message": "This account is currently secured to another device.",
            },
        )

    # 6. Issue secure hashed session
    raw_token, _ = SessionService.create_session(
        db=db,
        user_id=user.id,
        device_id=effective_dev_id,
        device_name=effective_dev_name,
        device_type=effective_dev_type,
    )

    phone_val = saved_phone or (
        mask_phone(identifier) if identifier.startswith("+") or identifier.isdigit() else "+91 98765 43210"
    )
    email_val = saved_email or (identifier if "@" in identifier else f"{user.name.lower().replace(' ', '.')}@example.com")

    return AuthResponse(
        success=True,
        token=raw_token,
        user=AuthUserPayload(
            id=user.id,
            name=user.name,
            phone=phone_val,
            email=email_val,
        ),
    )


@router.post("/signup", response_model=SignupInitResponse, status_code=status.HTTP_201_CREATED)
def signup(
    payload: SignupRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> SignupInitResponse:
    client_ip = extract_client_ip(request)

    allowed, retry_sec, msg = RateLimitService.check_and_record_endpoint_rate_limit(
        db, "signup", client_ip, settings.auth_signup_ip_max_per_hour, 3600
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=msg or "Too many account registrations. Please try again later.",
            headers={"Retry-After": str(retry_sec)},
        )

    phone_clean = payload.mobileNumber.strip()
    if not phone_clean:
        raise HTTPException(status_code=400, detail="Mobile number is required.")

    pwd_hash: Optional[str] = None
    if payload.password:
        is_valid, err_msg = validate_password_strength(payload.password)
        if not is_valid:
            raise HTTPException(status_code=400, detail=err_msg)
        pwd_hash = hash_password(payload.password)

    try:
        user = user_service.create_user(
            db, UserCreate(name=payload.fullName, phone_number=phone_clean), is_verified=False
        )
    except UserAlreadyExistsError as exc:
        raise HTTPException(
            status_code=409, detail="An account with this mobile number already exists."
        ) from exc

    email_val = payload.email or f"{user.name.lower().replace(' ', '.')}@example.com"
    contact = UserContactInfo(
        user_id=user.id,
        email_encrypted=encrypt_field(payload.email) if payload.email else None,
        phone_encrypted=encrypt_field(phone_clean),
        password_hash=pwd_hash,
    )
    db.add(contact)
    db.commit()

    plain_otp = generate_secure_otp(6)
    otp_record = OtpVerification(
        user_id=user.id,
        otp_hash=hash_otp(plain_otp),
        purpose="ACCOUNT_VERIFICATION",
        contact_target=phone_clean,
        attempts=0,
        max_attempts=5,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        resend_available_at=datetime.now(timezone.utc) + timedelta(seconds=30),
        is_used=False,
    )
    db.add(otp_record)
    db.commit()

    otp_delivery_provider.send_otp(target=phone_clean, otp=plain_otp, purpose="ACCOUNT_VERIFICATION")

    masked = mask_contact(phone_clean)

    dev_code: Optional[str] = None
    if settings.environment != "production" and settings.enable_dev_otp_inspection:
        dev_code = plain_otp

    msg_out = (
        "Verification code sent to your registered contact."
        if otp_delivery_provider.is_live_provider
        else "Verification code generated. Enter the 6-digit code to activate your account."
    )

    return SignupInitResponse(
        success=True,
        pendingVerification=True,
        userId=user.id,
        maskedContact=masked,
        resendCooldownSeconds=30,
        isLiveDelivery=otp_delivery_provider.is_live_provider,
        message=msg_out,
        devTestCode=dev_code,
        user=AuthUserPayload(
            id=user.id,
            name=user.name,
            phone=phone_clean,
            email=email_val,
        ),
    )


@router.post("/verify-otp", response_model=AuthResponse)
def verify_account_otp(
    payload: VerifyOtpRequest,
    request: Request,
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    x_device_name: Optional[str] = Header(None, alias="X-Device-Name"),
    x_device_type: Optional[str] = Header(None, alias="X-Device-Type"),
    db: Session = Depends(get_db),
) -> AuthResponse:
    client_ip = extract_client_ip(request)

    allowed, retry_sec, msg = RateLimitService.check_and_record_endpoint_rate_limit(
        db, "verify_otp", client_ip, settings.auth_otp_verify_ip_max_per_hour, 3600
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=msg or "Too many verification attempts. Please wait.",
            headers={"Retry-After": str(retry_sec)},
        )

    user = user_repository.get_user(db, payload.userId)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification request.")

    contact = db.query(UserContactInfo).filter(UserContactInfo.user_id == user.id).first()
    saved_email = decrypt_field(contact.email_encrypted) if contact and contact.email_encrypted else ""
    saved_phone = decrypt_field(contact.phone_encrypted) if contact and contact.phone_encrypted else ""

    effective_dev_id = payload.deviceId or x_device_id or "default-mobile-device"
    effective_dev_name = payload.deviceName or x_device_name or "Avaran Client Device"
    effective_dev_type = payload.deviceType or x_device_type or "Mobile App"

    if not user.is_verified:
        record = (
            db.query(OtpVerification)
            .filter(
                OtpVerification.user_id == user.id,
                OtpVerification.is_used == False,
                OtpVerification.purpose == "ACCOUNT_VERIFICATION",
            )
            .order_by(OtpVerification.id.desc())
            .first()
        )

        if not record:
            raise HTTPException(
                status_code=400, detail="No active verification code found. Please request a new code."
            )

        if record.attempts >= record.max_attempts:
            raise HTTPException(
                status_code=400,
                detail="Maximum verification attempts exceeded. Please request a new code.",
            )

        now = datetime.now(timezone.utc)
        record_expires = (
            record.expires_at.replace(tzinfo=timezone.utc)
            if record.expires_at.tzinfo is None
            else record.expires_at
        )
        if now > record_expires:
            raise HTTPException(
                status_code=400, detail="Verification code has expired. Please request a new code."
            )

        is_valid = verify_otp(payload.otp, record.otp_hash)
        if not is_valid:
            record.attempts += 1
            db.commit()
            if record.attempts >= record.max_attempts:
                raise HTTPException(
                    status_code=400,
                    detail="Maximum verification attempts exceeded. Please request a new code.",
                )
            raise HTTPException(
                status_code=400, detail="Invalid verification code. Please check and try again."
            )

        record.is_used = True
        user.is_verified = True
        db.commit()

    # Bind initial device and create active session
    SessionService.check_device_access(
        db=db,
        user_id=user.id,
        device_id=effective_dev_id,
        device_name=effective_dev_name,
        device_type=effective_dev_type,
    )

    raw_token, _ = SessionService.create_session(
        db=db,
        user_id=user.id,
        device_id=effective_dev_id,
        device_name=effective_dev_name,
        device_type=effective_dev_type,
    )

    return AuthResponse(
        success=True,
        token=raw_token,
        user=AuthUserPayload(
            id=user.id,
            name=user.name,
            phone=saved_phone or "+91 98765 43210",
            email=saved_email or f"{user.name.lower().replace(' ', '.')}@example.com",
        ),
    )


@router.post("/resend-otp", response_model=ResendOtpResponse)
def resend_account_otp(
    payload: ResendOtpRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ResendOtpResponse:
    client_ip = extract_client_ip(request)

    allowed, retry_sec, msg = RateLimitService.check_and_record_endpoint_rate_limit(
        db, "resend_otp", client_ip, settings.auth_otp_resend_ip_max_per_hour, 3600
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=msg or "Too many OTP resend requests. Please wait.",
            headers={"Retry-After": str(retry_sec)},
        )

    user = user_repository.get_user(db, payload.userId)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid request.")

    if user.is_verified:
        raise HTTPException(status_code=400, detail="Account is already verified.")

    record = (
        db.query(OtpVerification)
        .filter(
            OtpVerification.user_id == user.id,
            OtpVerification.is_used == False,
            OtpVerification.purpose == "ACCOUNT_VERIFICATION",
        )
        .order_by(OtpVerification.id.desc())
        .first()
    )

    now = datetime.now(timezone.utc)
    if record:
        record_resend = (
            record.resend_available_at.replace(tzinfo=timezone.utc)
            if record.resend_available_at.tzinfo is None
            else record.resend_available_at
        )
        if now < record_resend:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait before requesting a new verification code.",
            )

    db.query(OtpVerification).filter(
        OtpVerification.user_id == user.id,
        OtpVerification.is_used == False,
    ).update({"is_used": True})

    contact = db.query(UserContactInfo).filter(UserContactInfo.user_id == user.id).first()
    saved_phone = decrypt_field(contact.phone_encrypted) if contact and contact.phone_encrypted else ""

    plain_otp = generate_secure_otp(6)
    new_record = OtpVerification(
        user_id=user.id,
        otp_hash=hash_otp(plain_otp),
        purpose="ACCOUNT_VERIFICATION",
        contact_target=saved_phone or "user_contact",
        attempts=0,
        max_attempts=5,
        expires_at=now + timedelta(minutes=5),
        resend_available_at=now + timedelta(seconds=30),
        is_used=False,
    )
    db.add(new_record)
    db.commit()

    otp_delivery_provider.send_otp(
        target=saved_phone or "user_contact", otp=plain_otp, purpose="ACCOUNT_VERIFICATION"
    )

    dev_code: Optional[str] = None
    if settings.environment != "production" and settings.enable_dev_otp_inspection:
        dev_code = plain_otp

    msg_out = (
        "A fresh verification code has been sent to your registered contact."
        if otp_delivery_provider.is_live_provider
        else "A new 6-digit verification code has been generated."
    )

    return ResendOtpResponse(
        success=True,
        maskedContact=mask_contact(saved_phone),
        resendCooldownSeconds=30,
        isLiveDelivery=otp_delivery_provider.is_live_provider,
        message=msg_out,
        devTestCode=dev_code,
    )


# PASSWORD RESET FLOW
@router.post("/request-password-reset", response_model=RequestPasswordResetResponse)
def request_password_reset(
    payload: RequestPasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> RequestPasswordResetResponse:
    client_ip = extract_client_ip(request)

    # 1. Rate limiting
    allowed, retry_sec, msg = RateLimitService.check_and_record_endpoint_rate_limit(
        db, "pwd_reset_request", client_ip, settings.auth_password_reset_ip_max_per_hour, 3600
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=msg or "Too many password reset requests. Please wait.",
            headers={"Retry-After": str(retry_sec)},
        )

    clean_id = payload.identifier.strip()
    user = _find_user_by_identifier(db, clean_id)

    # 2. Anti-enumeration timing & execution
    if user is None:
        # Perform dummy cryptographic computation to match timing
        verify_password("dummy_password_timing_pad", DUMMY_ARGON2_HASH)
        masked = mask_contact(clean_id if clean_id.startswith("+") else "+91 98765 43210")
        return RequestPasswordResetResponse(
            success=True,
            maskedContact=masked,
            resendCooldownSeconds=30,
            isLiveDelivery=otp_delivery_provider.is_live_provider,
            message="If an account exists for this information, a verification process has been initiated.",
            devTestCode=None,
        )

    now = datetime.now(timezone.utc)

    # Check resend cooldown on existing active PASSWORD_RESET OTP
    latest_otp = (
        db.query(OtpVerification)
        .filter(
            OtpVerification.user_id == user.id,
            OtpVerification.is_used == False,
            OtpVerification.purpose == "PASSWORD_RESET",
        )
        .order_by(OtpVerification.id.desc())
        .first()
    )
    if latest_otp:
        resend_time = (
            latest_otp.resend_available_at.replace(tzinfo=timezone.utc)
            if latest_otp.resend_available_at.tzinfo is None
            else latest_otp.resend_available_at
        )
        if now < resend_time:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait before requesting a new recovery verification code.",
            )

    # Invalidate previous unused reset OTPs for this user
    db.query(OtpVerification).filter(
        OtpVerification.user_id == user.id,
        OtpVerification.is_used == False,
        OtpVerification.purpose == "PASSWORD_RESET",
    ).update({"is_used": True})

    contact = db.query(UserContactInfo).filter(UserContactInfo.user_id == user.id).first()
    saved_phone = decrypt_field(contact.phone_encrypted) if contact and contact.phone_encrypted else ""

    plain_otp = generate_secure_otp(6)
    reset_otp_record = OtpVerification(
        user_id=user.id,
        otp_hash=hash_otp(plain_otp),
        purpose="PASSWORD_RESET",
        contact_target=saved_phone or "user_recovery",
        attempts=0,
        max_attempts=5,
        expires_at=now + timedelta(minutes=5),
        resend_available_at=now + timedelta(seconds=30),
        is_used=False,
    )
    db.add(reset_otp_record)
    db.commit()

    otp_delivery_provider.send_otp(
        target=saved_phone or "user_recovery", otp=plain_otp, purpose="PASSWORD_RESET"
    )

    dev_code: Optional[str] = None
    if settings.environment != "production" and settings.enable_dev_otp_inspection:
        dev_code = plain_otp

    masked = mask_contact(saved_phone or clean_id)

    return RequestPasswordResetResponse(
        success=True,
        maskedContact=masked,
        resendCooldownSeconds=30,
        isLiveDelivery=otp_delivery_provider.is_live_provider,
        message="If an account exists for this information, a verification process has been initiated.",
        devTestCode=dev_code,
    )


@router.post("/verify-password-reset-otp", response_model=VerifyPasswordResetOtpResponse)
def verify_password_reset_otp(
    payload: VerifyPasswordResetOtpRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> VerifyPasswordResetOtpResponse:
    client_ip = extract_client_ip(request)

    allowed, retry_sec, msg = RateLimitService.check_and_record_endpoint_rate_limit(
        db, "pwd_reset_verify", client_ip, settings.auth_otp_verify_ip_max_per_hour, 3600
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=msg or "Too many verification attempts. Please wait.",
            headers={"Retry-After": str(retry_sec)},
        )

    clean_id = payload.identifier.strip()
    user = _find_user_by_identifier(db, clean_id)

    if not user:
        verify_password(payload.otp, DUMMY_ARGON2_HASH)
        raise HTTPException(
            status_code=400, detail="Invalid or expired verification code."
        )

    # Strictly check OTP with purpose="PASSWORD_RESET"
    record = (
        db.query(OtpVerification)
        .filter(
            OtpVerification.user_id == user.id,
            OtpVerification.is_used == False,
            OtpVerification.purpose == "PASSWORD_RESET",
        )
        .order_by(OtpVerification.id.desc())
        .first()
    )

    if not record:
        raise HTTPException(
            status_code=400, detail="No active password recovery code found. Please request a new code."
        )

    if record.attempts >= record.max_attempts:
        raise HTTPException(
            status_code=400,
            detail="Maximum verification attempts exceeded. Please request a new recovery code.",
        )

    now = datetime.now(timezone.utc)
    record_expires = (
        record.expires_at.replace(tzinfo=timezone.utc)
        if record.expires_at.tzinfo is None
        else record.expires_at
    )
    if now > record_expires:
        raise HTTPException(
            status_code=400, detail="Verification code has expired. Please request a new code."
        )

    is_valid = verify_otp(payload.otp, record.otp_hash)
    if not is_valid:
        record.attempts += 1
        db.commit()
        if record.attempts >= record.max_attempts:
            raise HTTPException(
                status_code=400,
                detail="Maximum verification attempts exceeded. Please request a new recovery code.",
            )
        raise HTTPException(
            status_code=400, detail="Invalid verification code. Please try again."
        )

    # Consume the OTP
    record.is_used = True

    # Generate single-use password reset authorization token
    raw_token = f"pwd_reset_auth_{secrets.token_urlsafe(48)}"
    token_hash = hash_identifier(raw_token)
    expires_at = now + timedelta(minutes=settings.auth_password_reset_token_expiry_minutes)

    auth_record = PasswordResetAuthorization(
        user_id=user.id,
        token_hash=token_hash,
        created_at=now,
        expires_at=expires_at,
        is_used=False,
    )
    db.add(auth_record)
    db.commit()

    return VerifyPasswordResetOtpResponse(
        success=True,
        resetToken=raw_token,
        message="Verification successful. Please create a new password.",
    )


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ResetPasswordResponse:
    client_ip = extract_client_ip(request)

    allowed, retry_sec, msg = RateLimitService.check_and_record_endpoint_rate_limit(
        db, "pwd_reset_submit", client_ip, 20, 3600
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=msg or "Too many password reset requests. Please wait.",
            headers={"Retry-After": str(retry_sec)},
        )

    # 1. Validate password strength
    is_valid_strength, err_msg = validate_password_strength(payload.newPassword)
    if not is_valid_strength:
        raise HTTPException(status_code=400, detail=err_msg)

    # 2. Look up authorization token by hash
    token_hash = hash_identifier(payload.resetToken)
    auth_record = (
        db.query(PasswordResetAuthorization)
        .filter_by(token_hash=token_hash)
        .first()
    )

    if not auth_record:
        raise HTTPException(status_code=400, detail="Invalid or unrecognized password reset token.")

    if auth_record.is_used:
        raise HTTPException(
            status_code=400, detail="This reset token has already been used. Please request a new recovery."
        )

    now = datetime.now(timezone.utc)
    exp_utc = (
        auth_record.expires_at.replace(tzinfo=timezone.utc)
        if auth_record.expires_at.tzinfo is None
        else auth_record.expires_at
    )
    if exp_utc < now:
        raise HTTPException(
            status_code=400, detail="Password reset token has expired. Please restart recovery."
        )

    # 3. Atomic update: Update Argon2id password hash + consume token + revoke ALL sessions
    contact = (
        db.query(UserContactInfo)
        .filter(UserContactInfo.user_id == auth_record.user_id)
        .first()
    )
    if not contact:
        raise HTTPException(status_code=404, detail="User contact information not found.")

    contact.password_hash = hash_password(payload.newPassword)
    auth_record.is_used = True
    auth_record.used_at = now

    # Revoke all active sessions for this user
    SessionService.revoke_all_user_sessions(db, auth_record.user_id)

    db.commit()

    return ResetPasswordResponse(
        success=True,
        message="Password has been reset successfully. Please log in with your new password.",
    )


# DEVICE TRANSFER FLOW
@router.post("/request-device-transfer", response_model=TransferInitResponse)
def request_device_transfer(
    payload: RequestDeviceTransferRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TransferInitResponse:
    client_ip = extract_client_ip(request)

    allowed, retry_sec, msg = RateLimitService.check_and_record_endpoint_rate_limit(
        db, "transfer_request", client_ip, settings.auth_transfer_request_ip_max_per_hour, 3600
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=msg or "Too many device transfer requests. Please wait.",
            headers={"Retry-After": str(retry_sec)},
        )

    user = user_repository.get_user(db, payload.userId)
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    contact = db.query(UserContactInfo).filter(UserContactInfo.user_id == user.id).first()
    if contact and contact.password_hash and payload.password:
        if not verify_password(payload.password, contact.password_hash):
            raise HTTPException(status_code=401, detail="Invalid password.")

    if settings.environment == "production" and not otp_delivery_provider.is_live_provider:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Live SMS verification is required for device transfer in production.",
        )

    now = datetime.now(timezone.utc)

    latest_otp = (
        db.query(OtpVerification)
        .filter(
            OtpVerification.user_id == user.id,
            OtpVerification.is_used == False,
            OtpVerification.purpose == "DEVICE_TRANSFER",
        )
        .order_by(OtpVerification.id.desc())
        .first()
    )
    if latest_otp:
        resend_time = (
            latest_otp.resend_available_at.replace(tzinfo=timezone.utc)
            if latest_otp.resend_available_at.tzinfo is None
            else latest_otp.resend_available_at
        )
        if now < resend_time:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait before requesting a new transfer verification code.",
            )

    db.query(OtpVerification).filter(
        OtpVerification.user_id == user.id,
        OtpVerification.is_used == False,
        OtpVerification.purpose == "DEVICE_TRANSFER",
    ).update({"is_used": True})

    saved_phone = decrypt_field(contact.phone_encrypted) if contact and contact.phone_encrypted else ""

    plain_otp = generate_secure_otp(6)
    transfer_otp_record = OtpVerification(
        user_id=user.id,
        otp_hash=hash_otp(plain_otp),
        purpose="DEVICE_TRANSFER",
        contact_target=saved_phone or "user_phone",
        attempts=0,
        max_attempts=5,
        expires_at=now + timedelta(minutes=5),
        resend_available_at=now + timedelta(seconds=30),
        is_used=False,
    )
    db.add(transfer_otp_record)
    db.commit()

    otp_delivery_provider.send_otp(
        target=saved_phone or "user_phone", otp=plain_otp, purpose="DEVICE_TRANSFER"
    )

    dev_code: Optional[str] = None
    if settings.environment != "production" and settings.enable_dev_otp_inspection:
        dev_code = plain_otp

    msg_out = (
        "Transfer verification code sent to your registered phone number."
        if otp_delivery_provider.is_live_provider
        else "Transfer verification code generated. Enter code to authorize this device."
    )

    return TransferInitResponse(
        success=True,
        requiresDeviceTransfer=True,
        userId=user.id,
        maskedContact=mask_contact(saved_phone),
        resendCooldownSeconds=30,
        isLiveDelivery=otp_delivery_provider.is_live_provider,
        message=msg_out,
        devTestCode=dev_code,
    )


@router.post("/verify-device-transfer", response_model=AuthResponse)
def verify_device_transfer(
    payload: VerifyDeviceTransferRequest,
    request: Request,
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    x_device_name: Optional[str] = Header(None, alias="X-Device-Name"),
    x_device_type: Optional[str] = Header(None, alias="X-Device-Type"),
    db: Session = Depends(get_db),
) -> AuthResponse:
    client_ip = extract_client_ip(request)

    allowed, retry_sec, msg = RateLimitService.check_and_record_endpoint_rate_limit(
        db, "transfer_verify", client_ip, settings.auth_otp_verify_ip_max_per_hour, 3600
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=msg or "Too many verification attempts. Please wait.",
            headers={"Retry-After": str(retry_sec)},
        )

    user = user_repository.get_user(db, payload.userId)
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    record = (
        db.query(OtpVerification)
        .filter(
            OtpVerification.user_id == user.id,
            OtpVerification.is_used == False,
            OtpVerification.purpose == "DEVICE_TRANSFER",
        )
        .order_by(OtpVerification.id.desc())
        .first()
    )

    if not record:
        raise HTTPException(
            status_code=400,
            detail="No active transfer verification code found. Please request a new code.",
        )

    if record.attempts >= record.max_attempts:
        raise HTTPException(
            status_code=400,
            detail="Maximum transfer verification attempts exceeded. Please request a new code.",
        )

    now = datetime.now(timezone.utc)
    record_expires = (
        record.expires_at.replace(tzinfo=timezone.utc)
        if record.expires_at.tzinfo is None
        else record.expires_at
    )
    if now > record_expires:
        raise HTTPException(
            status_code=400,
            detail="Transfer verification code has expired. Please request a new code.",
        )

    is_valid = verify_otp(payload.otp, record.otp_hash)
    if not is_valid:
        record.attempts += 1
        db.commit()
        if record.attempts >= record.max_attempts:
            raise HTTPException(
                status_code=400,
                detail="Maximum transfer verification attempts exceeded. Please request a new code.",
            )
        raise HTTPException(
            status_code=400, detail="Invalid transfer verification code. Please try again."
        )

    record.is_used = True
    db.commit()

    effective_dev_id = payload.deviceId or x_device_id or "default-mobile-device"
    effective_dev_name = payload.deviceName or x_device_name or "Avaran Client Device"
    effective_dev_type = payload.deviceType or x_device_type or "Mobile App"

    # Transfer single trusted device & revoke all old sessions
    SessionService.transfer_trusted_device(
        db=db,
        user_id=user.id,
        new_device_id=effective_dev_id,
        new_device_name=effective_dev_name,
        new_device_type=effective_dev_type,
    )

    # Issue fresh session token for new trusted device
    raw_token, _ = SessionService.create_session(
        db=db,
        user_id=user.id,
        device_id=effective_dev_id,
        device_name=effective_dev_name,
        device_type=effective_dev_type,
    )

    contact = db.query(UserContactInfo).filter(UserContactInfo.user_id == user.id).first()
    saved_email = decrypt_field(contact.email_encrypted) if contact and contact.email_encrypted else ""
    saved_phone = decrypt_field(contact.phone_encrypted) if contact and contact.phone_encrypted else ""

    return AuthResponse(
        success=True,
        token=raw_token,
        user=AuthUserPayload(
            id=user.id,
            name=user.name,
            phone=saved_phone or "+91 98765 43210",
            email=saved_email or f"{user.name.lower().replace(' ', '.')}@example.com",
        ),
    )


@router.post("/logout")
def logout(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> dict:
    raw_token = _extract_bearer_token(authorization)
    if raw_token:
        SessionService.revoke_session(db, raw_token)
    return {"success": True, "message": "Logged out and session revoked successfully."}


@router.get("/validate-session")
def validate_session(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
    db: Session = Depends(get_db),
) -> dict:
    raw_token = _extract_bearer_token(authorization)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token required.",
        )

    is_valid, session, err_msg = SessionService.validate_session_token(
        db=db,
        raw_token=raw_token,
        device_id=x_device_id,
    )

    if not is_valid or not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=err_msg or "Session is invalid, expired, or revoked.",
        )

    return {
        "success": True,
        "valid": True,
        "userId": session.user_id,
    }
