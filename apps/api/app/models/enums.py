"""
Shared enum types for S40 database models.

Values use the vocabulary the specification itself uses (spec §12, §13,
§19) so API responses read the same way the spec describes them, rather
than inventing a parallel naming scheme.
"""

import enum


class TransactionStatus(str, enum.Enum):
    """Lifecycle of a transaction through the decision flow (spec §13, §15).

    Not a literal spec table column list — derived from the Allow/Warn/
    Confirm-or-Cancel decision flow and the confirm/cancel/report APIs
    (spec §19). Documented as a PROPOSED addition in the Phase 2 report.
    """

    PENDING = "PENDING"
    ALLOWED = "ALLOWED"
    AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    REPORTED = "REPORTED"


class RiskLevel(str, enum.Enum):
    """LOW/MEDIUM/HIGH thresholds, spec §13 — used by both risk_scores and alerts."""

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class RiskDecision(str, enum.Enum):
    """Decision-engine output vocabulary, spec §12/§13."""

    ALLOW = "ALLOW"
    WARN = "WARN"
    CONFIRM_OR_CANCEL = "CONFIRM_OR_CANCEL"


class UserDecision(str, enum.Enum):
    """Mirrors the /confirm, /cancel, /report user-decision APIs (spec §19)."""

    CONFIRM = "CONFIRM"
    CANCEL = "CANCEL"
    REPORT = "REPORT"


class AlertStatus(str, enum.Enum):
    """Institution false-positive review workflow states (spec §17)."""

    OPEN = "OPEN"
    UNDER_REVIEW = "UNDER_REVIEW"
    RESOLVED = "RESOLVED"
    DISMISSED = "DISMISSED"


class FraudCaseStatus(str, enum.Enum):
    """Investigation states for the institution fraud-case workflow (spec §17)."""

    OPEN = "OPEN"
    UNDER_REVIEW = "UNDER_REVIEW"
    CONFIRMED_FRAUD = "CONFIRMED_FRAUD"
    FALSE_POSITIVE = "FALSE_POSITIVE"
    CLOSED = "CLOSED"
