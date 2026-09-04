"""
SecurityAuditService — Centralized structured security event logging for Avaran.

Guarantees privacy-compliant, structured security event auditing across
authentication, device binding, password recovery, guardian review, and transaction integrity.
"""

from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session

logger = logging.getLogger("avaran.security_audit")

SENSITIVE_KEYS = {
    "password",
    "password_hash",
    "raw_password",
    "otp",
    "otp_code",
    "token",
    "raw_token",
    "token_hash",
    "reset_token",
    "auth_token",
    "secret",
    "secret_key",
    "pin",
    "app_pin",
    "device_id",
    "phone_encrypted",
    "email_encrypted",
}


class SecurityAuditService:
    @staticmethod
    def _sanitize_details(details: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not details:
            return {}
        sanitized = {}
        for k, v in details.items():
            k_lower = k.lower()
            if any(s in k_lower for s in SENSITIVE_KEYS):
                sanitized[k] = "[REDACTED]"
            elif isinstance(v, dict):
                sanitized[k] = SecurityAuditService._sanitize_details(v)
            else:
                sanitized[k] = v
        return sanitized

    @classmethod
    def log_event(
        cls,
        event_type: str,
        user_id: Optional[int] = None,
        transaction_id: Optional[int] = None,
        device_hash: Optional[str] = None,
        ip_address: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Records a structured security event in application logs and database audit_logs if available.
        """
        now = datetime.now(timezone.utc)
        safe_details = cls._sanitize_details(details)

        audit_entry = {
            "timestamp": now.isoformat(),
            "event_type": event_type,
            "user_id": user_id,
            "transaction_id": transaction_id,
            "device_hash": device_hash[:16] + "..." if device_hash else None,
            "ip_address": ip_address,
            "details": safe_details,
        }

        # Structured application logging
        logger.info(json.dumps(audit_entry))

        # DB persistence, mapped onto the real AuditLog columns
        # (actor/action/resource/timestamp/metadata — see app/models/audit_log.py).
        # Previously this constructed AuditLog with fields (event_type, user_id,
        # details) that don't exist on the model; the broad except below silently
        # swallowed the resulting TypeError, so no row was ever persisted. Fixed
        # to use the real columns and to surface unexpected failures instead of
        # hiding them.
        if db:
            try:
                from app.models.audit_log import AuditLog
                actor = f"user:{user_id}" if user_id is not None else "system"
                resource = f"transaction:{transaction_id}" if transaction_id is not None else "system"
                log_row = AuditLog(
                    actor=actor,
                    action=event_type,
                    resource=resource,
                    timestamp=now,
                    event_metadata={
                        **safe_details,
                        "device_hash": audit_entry["device_hash"],
                        "ip_address": ip_address,
                    },
                )
                db.add(log_row)
                db.commit()
            except Exception:
                db.rollback()
                logger.exception("Failed to persist audit log entry for event_type=%s", event_type)

        return audit_entry
