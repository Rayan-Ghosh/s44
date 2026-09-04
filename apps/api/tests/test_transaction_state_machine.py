"""Unit tests for app/services/transaction_state_machine.py (AVARAN PAY spec §5)."""

import pytest

from app.models.enums import TransactionStatus as S
from app.services.transaction_state_machine import InvalidTransactionTransition, is_terminal, transition


class _FakeTxn:
    """Minimal stand-in with just the attributes transition() touches, so
    these tests don't need a full DB-backed Transaction row."""

    def __init__(self, status: S):
        self.status = status


class _FakeSession:
    def commit(self):
        pass

    def refresh(self, obj):
        pass


def test_valid_transition_updates_status():
    db = _FakeSession()
    txn = _FakeTxn(S.ALLOWED)
    result = transition(db, txn, S.PAYMENT_PENDING)
    assert result.status == S.PAYMENT_PENDING


def test_invalid_transition_raises():
    db = _FakeSession()
    txn = _FakeTxn(S.COMPLETED)  # terminal, no outgoing edges
    with pytest.raises(InvalidTransactionTransition):
        transition(db, txn, S.CONFIRMED)


def test_same_status_without_idempotent_ok_raises():
    db = _FakeSession()
    txn = _FakeTxn(S.CONFIRMED)
    with pytest.raises(InvalidTransactionTransition):
        transition(db, txn, S.CONFIRMED)


def test_same_status_with_idempotent_ok_is_noop():
    db = _FakeSession()
    txn = _FakeTxn(S.COMPLETED)
    result = transition(db, txn, S.COMPLETED, idempotent_ok=True)
    assert result is txn
    assert result.status == S.COMPLETED


@pytest.mark.parametrize(
    "status,expected",
    [
        (S.PENDING, False),
        (S.ALLOWED, False),
        (S.PAYMENT_PENDING, False),
        (S.CONFIRMED, False),
        (S.COMPLETED, True),
        (S.CANCELLED, True),
        (S.REPORTED, True),
        (S.GUARDIAN_REJECTED, True),
        (S.GUARDIAN_TIMEOUT, True),
        (S.BLOCKED, True),
    ],
)
def test_is_terminal(status, expected):
    assert is_terminal(status) is expected


def test_payment_pending_to_confirmed_to_completed_chain():
    db = _FakeSession()
    txn = _FakeTxn(S.PAYMENT_PENDING)
    txn = transition(db, txn, S.CONFIRMED)
    assert txn.status == S.CONFIRMED
    txn = transition(db, txn, S.COMPLETED)
    assert txn.status == S.COMPLETED
    # Terminal: nothing else is reachable from here.
    with pytest.raises(InvalidTransactionTransition):
        transition(db, txn, S.CANCELLED)


def test_guardian_pending_cannot_skip_to_completed():
    db = _FakeSession()
    txn = _FakeTxn(S.PENDING_GUARDIAN_APPROVAL)
    with pytest.raises(InvalidTransactionTransition):
        transition(db, txn, S.COMPLETED)
