"""
TransactionIntegrityService — Authoritative cryptographic transaction binding
and tamper protection for Avaran.

Ensures that security authorizations (Guardian approval and Biometric authorization)
are bound to the exact immutable snapshot of financial and security parameters.
"""

from decimal import Decimal
import hashlib
import hmac
import json
from typing import Any, Dict, Optional

from app.core.config import settings


class TransactionIntegrityService:
    @staticmethod
    def build_canonical_snapshot(txn: Any) -> Dict[str, Any]:
        """
        Builds a normalized, deterministic transaction snapshot containing
        financially and security-relevant transaction parameters.
        Device security is enforced separately through the session/device-binding system.
        """
        recipient_hash = ""
        if hasattr(txn, "recipient") and txn.recipient:
            recipient_hash = str(txn.recipient.recipient_hash or "")

        amt_str = f"{Decimal(str(txn.amount)):.2f}"

        return {
            "transaction_id": int(txn.id),
            "user_id": int(txn.user_id),
            "recipient_id": int(txn.recipient_id),
            "recipient_hash": recipient_hash,
            "amount": amt_str,
            "currency": "INR",
            "payment_method": str(txn.payment_method or "UPI").strip(),
            "location": str(txn.location or "").strip(),
        }

    @classmethod
    def compute_integrity_hash(cls, txn: Any) -> str:
        """
        Generates deterministic HMAC-SHA256 hash using backend secret key.
        """
        snapshot = cls.build_canonical_snapshot(txn)
        canonical_json = json.dumps(snapshot, sort_keys=True, separators=(",", ":"))
        secret = settings.transaction_integrity_key.encode("utf-8")
        return hmac.new(secret, canonical_json.encode("utf-8"), hashlib.sha256).hexdigest()

    @classmethod
    def verify_integrity(cls, txn: Any, expected_hash: Optional[str]) -> bool:
        """
        Verifies that current transaction details match the expected integrity hash.
        Uses constant-time comparison to prevent timing attacks.
        """
        if not expected_hash:
            return False
        current_hash = cls.compute_integrity_hash(txn)
        return hmac.compare_digest(current_hash, expected_hash)
