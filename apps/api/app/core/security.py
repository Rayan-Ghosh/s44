"""
Sensitive-identifier hashing — PROTOTYPE SCHEME, not a finalized security
design.

docs/SECURITY.md explicitly marks the hashing/salting scheme and key
management as UNDECIDED pending a real security review. Per CLAUDE.md's
rule against inventing production-grade cryptography for undecided items,
this module implements the *simplest* approach that satisfies the
specification's literal requirement (spec §21: "hash(device_id)",
"hash(phone_number)") without pretending it is bank-grade:

    SHA-256(pepper + value)

Limitations, deliberately not solved here:
- A single application-wide pepper (not a per-record salt) means two
  users with the same raw phone number hash identically. Acceptable for a
  synthetic-data hackathon prototype; NOT acceptable for production.
- The pepper is read from configuration, not a KMS/secrets manager.
- No key rotation.

Replacing this with a production-grade scheme (per-record salts, a
managed secret store, and a documented rotation policy) is future work,
not something to silently upgrade without a decision — see
docs/SECURITY.md "Summary of open security items".
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(
    schemes=["argon2", "bcrypt"],
    deprecated="auto",
    argon2__time_cost=3,
    argon2__memory_cost=65536,
    argon2__parallelism=4,
)


def hash_password(password: str) -> str:
    """Hash a plaintext password using Argon2id."""
    if not password:
        raise ValueError("Cannot hash an empty password.")
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored Argon2id/bcrypt hash."""
    if not plain_password or not hashed_password:
        return False
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT access token containing user claims."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode.update({"iat": now, "exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token() -> Tuple[str, str, datetime]:
    """Generate a secure, random refresh token for client storage and return:
    (raw_token, sha256_hash_for_db, expiration_datetime).
    """
    raw_token = f"rt_{secrets.token_urlsafe(48)}"
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    return raw_token, token_hash, expires_at


def hash_token(raw_token: str) -> str:
    """Hash a raw token string for database storage or lookup."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT access token. Raises JWTError on invalid or expired token."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def hash_identifier(value: str) -> str:
    """Hash a sensitive identifier (phone number, device ID, recipient
    handle, voice transcript) before it is ever written to the database.

    Raises ValueError on empty input rather than silently hashing an empty
    string, since that would collide across every caller that failed to
    supply a real value.
    """
    if not value:
        raise ValueError("Cannot hash an empty identifier.")
    payload = f"{settings.hash_pepper}{value}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def mask_phone(phone: str) -> str:
    """Mask a phone number for user interface display (e.g. +91-98765-XXXXX)."""
    if not phone:
        return "XXXX"
    cleaned = str(phone).strip()
    if len(cleaned) <= 5:
        return "XXXXX"
    return cleaned[:-5] + "XXXXX"

