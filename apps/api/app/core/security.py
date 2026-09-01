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

import base64
import hashlib
import hmac
import os
import re
from typing import Tuple

from cryptography.hazmat.primitives.kdf.argon2 import Argon2id

from app.core.config import settings


def validate_password_strength(password: str) -> Tuple[bool, str]:
    """Validate password requirements:
    - Minimum 10 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one number
    - At least one special character
    """
    if not password or len(password) < 10:
        return False, "Password must be at least 10 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one number."
    if not re.search(r"[^A-Za-z0-9]", password):
        return False, "Password must contain at least one special character."
    return True, ""


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


def hash_password(password: str) -> str:
    """Hash a password using modern Argon2id with random 16-byte salt and OWASP-recommended parameters.
    Returns standard serialized format: $argon2id$v=19$m=65536,t=2,p=4$<b64_salt>$<b64_hash>
    """
    if not password:
        raise ValueError("Cannot hash an empty password.")
    salt = os.urandom(16)
    kdf = Argon2id(salt=salt, length=32, iterations=2, memory_cost=65536, lanes=4)
    derived = kdf.derive(password.encode("utf-8"))
    b64_salt = base64.urlsafe_b64encode(salt).decode("ascii").rstrip("=")
    b64_hash = base64.urlsafe_b64encode(derived).decode("ascii").rstrip("=")
    return f"$argon2id$v=19$m=65536,t=2,p=4${b64_salt}${b64_hash}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored hashed password.
    Supports Argon2id format and backward-compatible legacy salted hashes.
    """
    if not plain_password or not hashed_password:
        return False

    if hashed_password.startswith("$argon2id$"):
        try:
            parts = hashed_password.split("$")
            if len(parts) != 6:
                return False
            params = dict(item.split("=") for item in parts[3].split(","))
            m = int(params["m"])
            t = int(params["t"])
            p = int(params["p"])
            salt_str = parts[4] + "=" * (-len(parts[4]) % 4)
            salt = base64.urlsafe_b64decode(salt_str)
            expected_hash_str = parts[5] + "=" * (-len(parts[5]) % 4)
            expected_hash = base64.urlsafe_b64decode(expected_hash_str)
            kdf = Argon2id(salt=salt, length=len(expected_hash), iterations=t, memory_cost=m, lanes=p)
            kdf.verify(plain_password.encode("utf-8"), expected_hash)
            return True
        except Exception:
            return False

    # Legacy fallback: SHA-256 peppered hash
    if len(hashed_password) == 64:
        legacy_payload = f"{settings.hash_pepper}_pwd_{plain_password}".encode("utf-8")
        legacy_hash = hashlib.sha256(legacy_payload).hexdigest()
        return hmac.compare_digest(legacy_hash, hashed_password)

    return False


def mask_phone(phone: str) -> str:
    """Mask a phone number for user interface display (e.g. +91-98765-XXXXX)."""
    if not phone:
        return "XXXX"
    cleaned = str(phone).strip()
    if len(cleaned) <= 5:
        return "XXXXX"
    return cleaned[:-5] + "XXXXX"


