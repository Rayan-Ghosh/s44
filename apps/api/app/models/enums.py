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
    PENDING_AUTHORIZATION = "PENDING_AUTHORIZATION"
    AUTHORIZED = "AUTHORIZED"
    PENDING_GUARDIAN_APPROVAL = "PENDING_GUARDIAN_APPROVAL"
    GUARDIAN_APPROVED = "GUARDIAN_APPROVED"
    GUARDIAN_REJECTED = "GUARDIAN_REJECTED"
    # AVARAN PAY spec addition: proactive 120s Guardian expiry (spec §6) is a
    # hard terminal stop, distinct from an explicit rejection. Replaces the
    # former GUARDIAN_TIMEOUT_USER_OVERRODE, which let a user PIN-bypass a
    # timed-out Guardian hold — removed because the spec requires expiry to
    # stop the payment unconditionally, with no override path.
    GUARDIAN_TIMEOUT = "GUARDIAN_TIMEOUT"
    # AVARAN PAY spec addition (spec §8): transaction has launched the
    # selected UPI app and is awaiting return/confirmation.
    PAYMENT_PENDING = "PAYMENT_PENDING"
    CONFIRMED = "CONFIRMED"
    # AVARAN PAY spec addition (spec §5, §8): final immutable completed
    # record, persisted one step after CONFIRMED.
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    REPORTED = "REPORTED"
    # AVARAN PAY spec addition (spec §5): payment stopped by a separately
    # configured security policy (not by user choice or Guardian outcome).
    BLOCKED = "BLOCKED"


class ConsentStatus(str, enum.Enum):
    """Two-way consent status for trusted guardian contacts (spec §6)."""

    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REVOKED = "REVOKED"


class GuardianOutcome(str, enum.Enum):
    """Outcome of a guardian hold approval request (spec §6)."""

    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    TIMEOUT = "TIMEOUT"
    INVALIDATED = "INVALIDATED"



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


class PaymentWorkflowStage(str, enum.Enum):
    """Canonical payment workflow stages matching mobile contract (Part 4R)."""

    EVALUATION_COMPLETED = "EVALUATION_COMPLETED"
    PAYMENT_AUTHORIZED = "PAYMENT_AUTHORIZED"
    PAYMENT_SUBMITTED = "PAYMENT_SUBMITTED"
    PAYMENT_COMPLETED = "PAYMENT_COMPLETED"


class UserPersonaArchetype(str, enum.Enum):
    """Coarse spending-pattern prior for a user's personalized baseline
    (ml/profiles/user_pattern.py). PLACEHOLDER taxonomy: no dataset in this
    repo segments users this way yet, so this exists only to give the
    Bayesian-shrinkage prior somewhere sane to start before a user has
    enough history of their own — not a calibrated segmentation model."""

    STUDENT = "STUDENT"
    SALARIED = "SALARIED"
    HOMEMAKER = "HOMEMAKER"
    BUSINESS = "BUSINESS"
    RETIRED_ELDERLY = "RETIRED_ELDERLY"
    GIG_WORKER = "GIG_WORKER"
    FARMER_RURAL = "FARMER_RURAL"
    GENERAL = "GENERAL"

