"""
TransactionStateMachine — central authority for valid Transaction status
transitions (AVARAN PAY spec §5).

Existing routers (transactions.py, guardian.py, risk.py) predate this
module and enforce their own ad hoc terminal-state checks inline; those are
left as-is to avoid destabilizing already-passing flows. This module is the
single source of truth for:

  - what counts as a terminal status (spec §5's "Terminal: Yes" column),
    reused by the ad hoc checks above via TERMINAL_STATUSES so they can't
    drift from the new spec-driven statuses (PAYMENT_PENDING/COMPLETED/
    GUARDIAN_TIMEOUT/BLOCKED added alongside the pre-existing vocabulary),
  - the new payment_lifecycle_service / guardian_service flows added for
    the AVARAN PAY spec (launch-upi, confirm-to-completed, the guardian
    expiry worker), which route every status change through `transition()`.
"""

from app.models.enums import TransactionStatus as S


TERMINAL_STATUSES: frozenset[S] = frozenset(
    {
        S.GUARDIAN_REJECTED,
        S.GUARDIAN_TIMEOUT,
        # CONFIRMED is deliberately NOT terminal: confirm() always advances
        # it straight to COMPLETED in the same call (see
        # payment_lifecycle_service.confirm), so CONFIRMED is a transient
        # mid-request state, not a resting one — COMPLETED is the real
        # terminal replacement for what used to be CONFIRMED's role.
        S.COMPLETED,
        S.CANCELLED,
        S.REPORTED,
        S.BLOCKED,
    }
)

# Allowed next-statuses per current status. Deliberately permissive on the
# pre-existing (pre-AVARAN-PAY) states, since those transitions are already
# governed by inline checks in transactions.py/risk.py/guardian.py — this
# graph exists to gate the *new* transitions those routers don't already
# enforce (reaching PAYMENT_PENDING/CONFIRMED/COMPLETED/GUARDIAN_TIMEOUT/
# BLOCKED), not to relitigate the pre-existing ones.
ALLOWED_TRANSITIONS: dict[S, frozenset[S]] = {
    # A transaction can also be confirmed straight from PENDING — existing
    # behavior for callers that skip risk evaluation entirely (authorization
    # is only required when a later risk evaluation sets
    # authorization_required=True; until then PENDING is functionally like
    # ALLOWED for confirm/cancel purposes).
    S.PENDING: frozenset(
        {
            S.ALLOWED,
            S.AWAITING_CONFIRMATION,
            S.PENDING_AUTHORIZATION,
            S.PENDING_GUARDIAN_APPROVAL,
            S.PAYMENT_PENDING,
            S.CONFIRMED,
            S.CANCELLED,
            S.REPORTED,
            S.BLOCKED,
        }
    ),
    # ALLOWED/AWAITING_CONFIRMATION/AUTHORIZED/GUARDIAN_APPROVED can reach
    # CONFIRMED either via the new PAYMENT_PENDING (launch-upi) step, or
    # directly — the existing mobile client already launches the UPI app
    # itself (payment-app-launcher-service.ts) before calling
    # /transactions/{id}/confirm without going through /payments/launch-upi.
    S.ALLOWED: frozenset({S.PAYMENT_PENDING, S.CONFIRMED, S.CANCELLED, S.REPORTED, S.BLOCKED}),
    S.AWAITING_CONFIRMATION: frozenset({S.PAYMENT_PENDING, S.CONFIRMED, S.CANCELLED, S.REPORTED, S.BLOCKED}),
    S.PENDING_AUTHORIZATION: frozenset(
        {S.AUTHORIZED, S.PENDING_GUARDIAN_APPROVAL, S.CANCELLED, S.REPORTED, S.BLOCKED}
    ),
    S.AUTHORIZED: frozenset(
        {S.PAYMENT_PENDING, S.CONFIRMED, S.PENDING_GUARDIAN_APPROVAL, S.CANCELLED, S.REPORTED, S.BLOCKED}
    ),
    S.PENDING_GUARDIAN_APPROVAL: frozenset({S.GUARDIAN_APPROVED, S.GUARDIAN_REJECTED, S.GUARDIAN_TIMEOUT, S.CANCELLED}),
    S.GUARDIAN_APPROVED: frozenset(
        {S.AUTHORIZED, S.PAYMENT_PENDING, S.CONFIRMED, S.PENDING_GUARDIAN_APPROVAL, S.CANCELLED, S.REPORTED}
    ),
    S.PAYMENT_PENDING: frozenset({S.CONFIRMED, S.CANCELLED}),
    S.CONFIRMED: frozenset({S.COMPLETED}),
    # Terminal states: no outgoing transitions.
    S.GUARDIAN_REJECTED: frozenset(),
    S.GUARDIAN_TIMEOUT: frozenset(),
    S.COMPLETED: frozenset(),
    S.CANCELLED: frozenset(),
    S.REPORTED: frozenset(),
    S.BLOCKED: frozenset(),
}


class InvalidTransactionTransition(Exception):
    """Raised when a transition is not allowed from the transaction's current status."""

    def __init__(self, current: S, target: S):
        self.current = current
        self.target = target
        super().__init__(f"Cannot transition transaction from {current.value} to {target.value}.")


def is_terminal(status: S) -> bool:
    return status in TERMINAL_STATUSES


def transition(db, txn, target: S, *, idempotent_ok: bool = False) -> "Transaction":  # noqa: F821
    """Move `txn` to `target`, validating against ALLOWED_TRANSITIONS.

    When `idempotent_ok` is True and the transaction is already at `target`,
    this is a no-op that returns the transaction unchanged instead of
    raising — the mechanism spec §12's "repeated requests return current
    state" rule relies on everywhere it's used.
    """
    current = txn.status
    if current == target:
        if idempotent_ok:
            return txn
        raise InvalidTransactionTransition(current, target)

    allowed = ALLOWED_TRANSITIONS.get(current, frozenset())
    if target not in allowed:
        raise InvalidTransactionTransition(current, target)

    txn.status = target
    db.commit()
    db.refresh(txn)
    return txn
