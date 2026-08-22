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

from app.core.config import settings


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

