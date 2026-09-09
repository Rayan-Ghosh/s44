"""app/services/user_pattern_trainer.py + ml/profiles/user_pattern.py —
eligibility gates, Bayesian shrinkage math, and artifact versioning for the
personalized transaction-pattern engine."""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.models.enums import UserPersonaArchetype
from app.models.user import User
from app.models.user_financial_profile import UserFinancialProfile
from app.repositories import user_pattern_repository
from app.services.user_pattern_trainer import is_eligible_for_retrain, retrain_user_pattern
from ml.profiles.user_pattern import ARCHETYPE_PRIORS, SHRINKAGE_VIRTUAL_N, compute_baseline


# ---------------------------------------------------------------------------
# Eligibility gate — pure function, no DB needed
# ---------------------------------------------------------------------------

def _profile(**overrides) -> UserFinancialProfile:
    now = datetime.now(timezone.utc)
    defaults = dict(
        user_id=1,
        archetype=UserPersonaArchetype.GENERAL,
        last_active_at=now,
        last_retrained_at=None,
        pending_transactions_count=settings.user_pattern_min_new_transactions,
    )
    defaults.update(overrides)
    return UserFinancialProfile(**defaults)


def test_eligible_when_all_three_gates_pass():
    assert is_eligible_for_retrain(_profile()) is True


def test_ineligible_below_volume_gate():
    p = _profile(pending_transactions_count=settings.user_pattern_min_new_transactions - 1)
    assert is_eligible_for_retrain(p) is False


def test_ineligible_when_dormant_past_active_window():
    stale = datetime.now(timezone.utc) - timedelta(days=settings.user_pattern_active_within_days + 1)
    p = _profile(last_active_at=stale)
    assert is_eligible_for_retrain(p) is False


def test_ineligible_when_never_active():
    p = _profile(last_active_at=None)
    assert is_eligible_for_retrain(p) is False


def test_ineligible_within_cooldown_of_last_retrain():
    recent = datetime.now(timezone.utc) - timedelta(hours=1)
    p = _profile(last_retrained_at=recent)
    assert is_eligible_for_retrain(p) is False


def test_eligible_once_cooldown_has_elapsed():
    long_ago = datetime.now(timezone.utc) - timedelta(hours=settings.user_pattern_retrain_cooldown_hours + 1)
    p = _profile(last_retrained_at=long_ago)
    assert is_eligible_for_retrain(p) is True


def test_first_ever_training_skips_cooldown_gate():
    """No prior training -> nothing to cool down from; only volume + activity matter."""
    p = _profile(last_retrained_at=None)
    assert is_eligible_for_retrain(p) is True


# ---------------------------------------------------------------------------
# Bayesian shrinkage math
# ---------------------------------------------------------------------------

def test_shrinkage_pulls_small_sample_toward_archetype_prior():
    prior_mean, _ = ARCHETYPE_PRIORS["GENERAL"]
    # Three wildly-high amounts, all identical to each other, so the
    # *user's own* std is 0 — the shrunk mean should sit well below the raw
    # user mean, pulled toward the (much lower) GENERAL prior.
    amounts = [50000.0, 50000.0, 50000.0]
    baseline = compute_baseline(amounts, "GENERAL")
    assert baseline is not None
    assert baseline.shrunk_mean < 50000.0
    assert baseline.shrunk_mean > prior_mean  # pulled toward, not fully replaced by, the prior

    expected = (3 * 50000.0 + SHRINKAGE_VIRTUAL_N * prior_mean) / (3 + SHRINKAGE_VIRTUAL_N)
    assert baseline.shrunk_mean == pytest.approx(expected)


def test_shrinkage_fades_as_history_grows():
    """A large, consistent history should end up close to the user's own
    mean — the prior's influence must shrink as N grows, not stay fixed."""
    amounts = [2000.0] * 500
    baseline = compute_baseline(amounts, "GENERAL")
    assert baseline is not None
    assert baseline.shrunk_mean == pytest.approx(2000.0, rel=0.05)


def test_unknown_archetype_falls_back_to_general():
    baseline = compute_baseline([1000.0] * 40, "SOME_UNKNOWN_ARCHETYPE")
    general_baseline = compute_baseline([1000.0] * 40, "GENERAL")
    assert baseline is not None and general_baseline is not None
    assert baseline.shrunk_mean == pytest.approx(general_baseline.shrunk_mean)


def test_compute_baseline_returns_none_for_empty_history():
    assert compute_baseline([], "GENERAL") is None


def test_percentiles_are_monotonic_and_within_range():
    amounts = [100.0, 200.0, 300.0, 400.0, 100000.0]
    baseline = compute_baseline(amounts, "GENERAL")
    assert baseline is not None
    assert baseline.p50 <= baseline.p90 <= baseline.p99
    assert min(amounts) <= baseline.p50 <= max(amounts)


def test_shrunk_std_is_never_zero():
    """Guards against downstream division-by-zero (amount_zscore in
    ml/training/train_user_pattern.py)."""
    baseline = compute_baseline([500.0, 500.0, 500.0], "GENERAL")
    assert baseline is not None
    assert baseline.shrunk_std > 0


# ---------------------------------------------------------------------------
# retrain_user_pattern — artifact versioning, end to end against a real DB
# ---------------------------------------------------------------------------

def _make_user(db_session) -> User:
    user = User(name="Pattern Test User", phone_hash=f"hash-{datetime.now().timestamp()}")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_retrain_cold_start_produces_quantile_artifact(db_session):
    user = _make_user(db_session)
    profile = user_pattern_repository.get_or_create_profile(db_session, user.id)
    profile.last_active_at = datetime.now(timezone.utc)
    db_session.commit()

    result = await retrain_user_pattern(db_session, user.id)

    assert result.last_retrained_at is not None
    assert result.pending_transactions_count == 0
    assert result.needs_retrain is False

    artifact = user_pattern_repository.get_active_artifact(db_session, user.id)
    # Empty history (no live/statement transactions seeded) -> nothing to
    # summarize -> no artifact, but the profile still records the attempt.
    assert artifact is None


@pytest.mark.asyncio
async def test_retrain_with_statement_history_creates_quantile_json_artifact(db_session):
    user = _make_user(db_session)
    for i in range(12):
        user_pattern_repository.insert_statement_transaction(
            db_session,
            user_id=user.id,
            amount=500.0 + i * 10,
            transaction_timestamp=datetime.now(timezone.utc) - timedelta(days=i),
            transaction_type="DEBIT",
            dedup_hash=f"dedup-{user.id}-{i}",
        )

    result = await retrain_user_pattern(db_session, user.id)
    artifact = user_pattern_repository.get_active_artifact(db_session, user.id)

    assert artifact is not None
    assert artifact.kind == "quantile-json"  # 12 < user_pattern_min_transactions_for_model (30)
    assert artifact.is_active is True
    assert result.p50_amount is not None


@pytest.mark.asyncio
async def test_retrain_deactivates_prior_artifact_on_new_version(db_session):
    user = _make_user(db_session)
    for i in range(12):
        user_pattern_repository.insert_statement_transaction(
            db_session,
            user_id=user.id,
            amount=100.0 + i,
            transaction_timestamp=datetime.now(timezone.utc) - timedelta(days=i),
            transaction_type="DEBIT",
            dedup_hash=f"v1-{user.id}-{i}",
        )
    await retrain_user_pattern(db_session, user.id)
    first_artifact = user_pattern_repository.get_active_artifact(db_session, user.id)
    assert first_artifact is not None

    for i in range(12, 24):
        user_pattern_repository.insert_statement_transaction(
            db_session,
            user_id=user.id,
            amount=200.0 + i,
            transaction_timestamp=datetime.now(timezone.utc) - timedelta(days=i),
            transaction_type="DEBIT",
            dedup_hash=f"v2-{user.id}-{i}",
        )
    await retrain_user_pattern(db_session, user.id)
    second_artifact = user_pattern_repository.get_active_artifact(db_session, user.id)

    assert second_artifact is not None
    assert second_artifact.id != first_artifact.id
    db_session.refresh(first_artifact)
    assert first_artifact.is_active is False
    assert second_artifact.is_active is True
