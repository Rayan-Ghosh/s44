"""
Database operations for user_sessions table.
Manages refresh tokens, device attribution, active session validation, and revocation.
"""

from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.models.user_session import UserSession


def create_session(
    db: Session,
    user_id: int,
    refresh_token_hash: str,
    expires_at: datetime,
    device_id: Optional[str] = None,
    user_agent: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> UserSession:
    """Register a new active refresh token session."""
    session = UserSession(
        user_id=user_id,
        refresh_token_hash=refresh_token_hash,
        expires_at=expires_at,
        device_id=device_id,
        user_agent=user_agent,
        ip_address=ip_address,
        is_revoked=False,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_active_session_by_token_hash(
    db: Session, token_hash: str
) -> Optional[UserSession]:
    """Retrieve an active, unexpired, non-revoked session by refresh token hash."""
    now = datetime.now(timezone.utc)
    session = (
        db.query(UserSession)
        .filter(
            UserSession.refresh_token_hash == token_hash,
            UserSession.is_revoked.is_(False),
        )
        .first()
    )
    if session is None:
        return None

    # Check expiration
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now > expires_at:
        # Mark expired session as revoked
        session.is_revoked = True
        db.commit()
        return None

    return session


def revoke_session(db: Session, session: UserSession) -> None:
    """Revoke a specific session."""
    session.is_revoked = True
    db.commit()
    db.refresh(session)


def revoke_session_by_token_hash(db: Session, token_hash: str) -> bool:
    """Revoke session identified by refresh token hash."""
    session = (
        db.query(UserSession)
        .filter(UserSession.refresh_token_hash == token_hash)
        .first()
    )
    if session:
        session.is_revoked = True
        db.commit()
        return True
    return False


def revoke_all_user_sessions(db: Session, user_id: int) -> int:
    """Revoke all active sessions for a user (e.g. upon password reset or security breach)."""
    count = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == user_id,
            UserSession.is_revoked.is_(False),
        )
        .update({"is_revoked": True})
    )
    db.commit()
    return count
