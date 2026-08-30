"""
Field-level encryption for reversible contact info (email, phone number).

This is deliberately separate from app/core/security.py's hash_identifier():
hashing is one-way and used for lookup/uniqueness/anonymized analytics
(phone_hash, device_hash, recipient_hash — never reversed). Contact info is
different — a profile screen needs to display and edit the user's *actual*
email/phone, which a one-way hash can never provide. Fernet gives
authenticated (tamper-evident) symmetric encryption so this is the one
place in the schema raw contact info is allowed to exist, and it stays
recoverable only with CONTACT_INFO_ENCRYPTION_KEY.

See docs/PROFILE_CONTACT_INFO_DECISION.md for the full rationale.
"""

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_fernet = Fernet(settings.contact_info_encryption_key.encode())


def encrypt_field(value: str) -> str:
    """Encrypts a plaintext string for storage. Empty string in, empty string out —
    callers shouldn't need a null-check just to round-trip an empty field."""
    if not value:
        return ""
    return _fernet.encrypt(value.encode()).decode()


def decrypt_field(token: str) -> str:
    """Decrypts a value previously produced by encrypt_field(). Returns an
    empty string for empty/corrupt input rather than raising — a display
    field failing open to blank is safer than a profile page crashing."""
    if not token:
        return ""
    try:
        return _fernet.decrypt(token.encode()).decode()
    except InvalidToken:
        return ""
