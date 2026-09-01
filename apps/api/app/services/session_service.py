"""
Session Service — Centralized management for single-device bindings,
high-entropy session tokens, server-side revocation, and activity expiration.
"""

from datetime import datetime, timedelta, timezone
import secrets
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_identifier
from app.models.trusted_device_binding import TrustedDeviceBinding
from app.models.user_session import UserSession


def _as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


class SessionService:
    @staticmethod
    def generate_session_token() -> str:
        """Generates an opaque, high-entropy CSPRNG session token."""
        return f"usr_sess_{secrets.token_urlsafe(48)}"

    @classmethod
    def create_session(
        cls,
        db: Session,
        user_id: int,
        device_id: str,
        device_name: Optional[str] = None,
        device_type: Optional[str] = None,
    ) -> Tuple[str, UserSession]:
        """
        Creates an active session for the user and device.
        Persists ONLY the SHA-256/peppered hash in the database.
        Returns the raw token (to deliver once to the client) and the session record.
        """
        raw_token = cls.generate_session_token()
        token_hash = hash_identifier(raw_token)
        device_hash = hash_identifier(device_id)

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=settings.session_absolute_expiry_days)

        session = UserSession(
            user_id=user_id,
            token_hash=token_hash,
            device_hash=device_hash,
            created_at=now,
            expires_at=expires_at,
            last_activity_at=now,
            is_revoked=False,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return raw_token, session

    @staticmethod
    def validate_session_token(
        db: Session,
        raw_token: str,
        device_id: Optional[str] = None,
    ) -> Tuple[bool, Optional[UserSession], Optional[str]]:
        """
        Validates the session token against database records, revocation state,
        absolute expiration, inactivity expiration, and device binding.
        """
        if not raw_token:
            return False, None, "Session token is required."

        token_hash = hash_identifier(raw_token)
        session = db.query(UserSession).filter_by(token_hash=token_hash).first()

        if not session:
            return False, None, "Invalid or unrecognized session token."

        if session.is_revoked:
            return False, None, "Session has been revoked. Please log in again."

        now = datetime.now(timezone.utc)
        exp_utc = _as_utc(session.expires_at)
        act_utc = _as_utc(session.last_activity_at)

        # Check absolute expiration
        if exp_utc < now:
            session.is_revoked = True
            session.revoked_at = now
            db.commit()
            return False, None, "Session has expired. Please log in again."

        # Check inactivity expiration
        inactivity_limit = timedelta(hours=settings.session_inactivity_expiry_hours)
        if (now - act_utc) > inactivity_limit:
            session.is_revoked = True
            session.revoked_at = now
            db.commit()
            return False, None, "Session expired due to inactivity. Please log in again."

        # Verify device header matches session device
        if device_id:
            request_dev_hash = hash_identifier(device_id)
            if session.device_hash != request_dev_hash:
                return False, None, "Session is not authorized from this device."

        # Verify against active single-device binding for the account
        binding = (
            db.query(TrustedDeviceBinding)
            .filter_by(user_id=session.user_id, is_active=True)
            .first()
        )
        if binding and binding.device_hash != session.device_hash:
            return False, None, "Account is currently bound to another device."

        # Session is valid — touch last_activity_at
        session.last_activity_at = now
        if binding:
            binding.last_active_at = now
        db.commit()

        return True, session, None

    @staticmethod
    def revoke_session(db: Session, raw_token: str) -> bool:
        """Revokes a specific session token."""
        if not raw_token:
            return False

        token_hash = hash_identifier(raw_token)
        session = db.query(UserSession).filter_by(token_hash=token_hash).first()
        if session and not session.is_revoked:
            session.is_revoked = True
            session.revoked_at = datetime.now(timezone.utc)
            db.commit()
            return True
        return False

    @staticmethod
    def revoke_all_user_sessions(db: Session, user_id: int) -> int:
        """Revokes all active sessions for a user (e.g. upon device transfer)."""
        now = datetime.now(timezone.utc)
        count = (
            db.query(UserSession)
            .filter(UserSession.user_id == user_id, UserSession.is_revoked == False)
            .update({UserSession.is_revoked: True, UserSession.revoked_at: now})
        )
        db.commit()
        return count

    @staticmethod
    def check_device_access(
        db: Session,
        user_id: int,
        device_id: str,
        device_name: Optional[str] = None,
        device_type: Optional[str] = None,
    ) -> Tuple[bool, bool, Optional[TrustedDeviceBinding]]:
        """
        Checks whether the device is authorized for the account.
        Returns: (is_allowed, requires_transfer, binding)
        - If no binding exists: binds this device as the initial trusted device.
        - If binding matches: updates timestamps and allows access.
        - If binding exists for another device: blocks direct access and requires transfer.
        """
        dev_hash = hash_identifier(device_id)
        binding = (
            db.query(TrustedDeviceBinding)
            .filter_by(user_id=user_id, is_active=True)
            .first()
        )

        now = datetime.now(timezone.utc)

        if not binding:
            # First device login — bind as trusted device
            binding = TrustedDeviceBinding(
                user_id=user_id,
                device_hash=dev_hash,
                device_name=device_name,
                device_type=device_type,
                bound_at=now,
                last_active_at=now,
                is_active=True,
            )
            db.add(binding)
            db.commit()
            db.refresh(binding)
            return True, False, binding

        if binding.device_hash == dev_hash:
            binding.last_active_at = now
            if device_name:
                binding.device_name = device_name
            if device_type:
                binding.device_type = device_type
            db.commit()
            return True, False, binding

        # Different device attempting access
        return False, True, binding

    @classmethod
    def transfer_trusted_device(
        cls,
        db: Session,
        user_id: int,
        new_device_id: str,
        new_device_name: Optional[str] = None,
        new_device_type: Optional[str] = None,
    ) -> TrustedDeviceBinding:
        """
        Transfers the single trusted device binding to a new device.
        Revokes all prior sessions on old devices.
        """
        cls.revoke_all_user_sessions(db, user_id)

        new_dev_hash = hash_identifier(new_device_id)
        now = datetime.now(timezone.utc)

        binding = db.query(TrustedDeviceBinding).filter_by(user_id=user_id).first()
        if binding:
            binding.device_hash = new_dev_hash
            binding.device_name = new_device_name
            binding.device_type = new_device_type
            binding.bound_at = now
            binding.last_active_at = now
            binding.is_active = True
        else:
            binding = TrustedDeviceBinding(
                user_id=user_id,
                device_hash=new_dev_hash,
                device_name=new_device_name,
                device_type=new_device_type,
                bound_at=now,
                last_active_at=now,
                is_active=True,
            )
            db.add(binding)

        db.commit()
        db.refresh(binding)
        return binding
