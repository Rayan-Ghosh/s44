"""Regression test for the SecurityAuditService.log_event DB-persistence bug
(AVARAN PAY spec §13): the DB write used to construct AuditLog with column
names (event_type, details) that don't exist on the model, and the broad
except silently swallowed the resulting TypeError — no row was ever
persisted. See app/services/security_audit_service.py."""

from app.models.audit_log import AuditLog
from app.services.security_audit_service import SecurityAuditService


def test_log_event_persists_a_readable_audit_row(db_session):
    SecurityAuditService.log_event(
        "PAYMENT_INITIATED",
        user_id=42,
        transaction_id=7,
        details={"source": "QR"},
        db=db_session,
    )

    rows = db_session.query(AuditLog).filter(AuditLog.action == "PAYMENT_INITIATED").all()
    assert len(rows) == 1
    row = rows[0]
    assert row.actor == "user:42"
    assert row.resource == "transaction:7"
    assert row.event_metadata.get("source") == "QR"


def test_log_event_without_ids_uses_system_actor_and_resource(db_session):
    SecurityAuditService.log_event("DEMO_RESET", details={"deleted_transactions": 3}, db=db_session)

    row = db_session.query(AuditLog).filter(AuditLog.action == "DEMO_RESET").first()
    assert row is not None
    assert row.actor == "system"
    assert row.resource == "system"
    assert row.event_metadata.get("deleted_transactions") == 3


def test_log_event_redacts_sensitive_keys(db_session):
    SecurityAuditService.log_event(
        "LOGIN_FAILURE", details={"otp": "123456", "note": "safe"}, db=db_session
    )
    row = db_session.query(AuditLog).filter(AuditLog.action == "LOGIN_FAILURE").first()
    assert row.event_metadata["otp"] == "[REDACTED]"
    assert row.event_metadata["note"] == "safe"
