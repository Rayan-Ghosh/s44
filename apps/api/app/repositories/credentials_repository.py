"""
Database operations for user_credentials table.
Handles password storage, verification state, failed attempt counters, and lockout expiration.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user_credentials import UserCredentials


def get_credentials_by_user_id(db: Session, user_id: int) -> Optional[UserCredentials]:
    """Retrieve credentials row for a given user ID."""
    return db.query(UserCredentials).filter(UserCredentials.user_id == user_id).first()


def create_credentials(
    db: Session, user_id: int, password_hash: str
) -> UserCredentials:
    """Create credentials record for a newly registered user."""
    creds = UserCredentials(
        user_id=user_id,
        password_hash=password_hash,
        failed_login_attempts=0,
        lockout_until=None,
        last_password_change=datetime.now(timezone.utc),
    )
    db.add(creds)
    db.commit()
    db.refresh(creds)
    return creds


def update_password(
    db: Session, user_id: int, new_password_hash: str
) -> Optional[UserCredentials]:
    """Update password hash and reset failed counters/lockout."""
    creds = get_credentials_by_user_id(db, user_id)
    if creds is None:
        return None
    creds.password_hash = new_password_hash
    creds.failed_login_attempts = 0
    creds.lockout_until = None
    creds.last_password_change = datetime.now(timezone.utc)
    db.commit()
    db.refresh(creds)
    return creds


def is_locked_out(creds: UserCredentials) -> Tuple[bool, Optional[datetime]]:
    """Check if account is temporarily locked out due to excessive failed attempts."""
    if creds.lockout_until is None:
        return False, None
    
    # Normalize comparison for naive/aware datetimes
    now = datetime.now(timezone.utc)
    lockout = creds.lockout_until
    if lockout.tzinfo is None:
        lockout = lockout.replace(tzinfo=timezone.utc)

    if now < lockout:
        return True, lockout
    return False, None


def record_failed_login(db: Session, creds: UserCredentials) -> None:
    """Increment failed login attempts counter. If limit reached, engage lockout."""
    creds.failed_login_attempts += 1
    if creds.failed_login_attempts >= settings.max_failed_login_attempts:
        creds.lockout_until = datetime.now(timezone.utc) + timedelta(
            minutes=settings.account_lockout_minutes
        )
    db.commit()
    db.refresh(creds)


def reset_failed_login(db: Session, creds: UserCredentials) -> None:
    """Reset failed login attempts counter and clear lockout upon successful authentication."""
    if creds.failed_login_attempts > 0 or creds.lockout_until is not None:
        creds.failed_login_attempts = 0
        creds.lockout_until = None
        db.commit()
        db.refresh(creds)
