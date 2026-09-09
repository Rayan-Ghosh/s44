"""
Orchestrates one user's personalized-pattern retrain: pulls their amount
history, fits (or just summarizes, for cold-start users) via
ml/training/train_user_pattern.py under app/core/concurrency.py's
TRAINING_SEMAPHORE + asyncio.to_thread, writes the artifact to local disk,
and records it. Called from two places: the opportunistic scheduler
(app/services/user_pattern_scheduler.py) and, inline, a user's first-ever
statement upload (app/services/statement_parser_service.py) — see that
module's docstring for why the very first training run doesn't wait for
the next sweep.

The DB reads/writes here run as plain sync calls, not threaded — same
choice app/services/guardian_service.py's sweep worker already makes for
its own (much cheaper) queries. Only the CPU-bound fit itself
(ml.training.train_user_pattern.fit_user_pattern) goes through the
semaphore/thread-pool; a handful of small ORM queries around it are not
worth adding indirection for.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.concurrency import TRAINING_SEMAPHORE, run_cpu_bound
from app.core.config import settings, BASE_DIR
from app.models.user_financial_profile import UserFinancialProfile
from app.repositories import transaction_repository, user_pattern_repository
from ml.training.train_user_pattern import OnnxArtifact, QuantileArtifact, fit_user_pattern

STORAGE_ROOT = BASE_DIR / "storage" / "models" / "users"


def is_eligible_for_retrain(profile: UserFinancialProfile, now: datetime | None = None) -> bool:
    """All three gates must pass — see docs/ML_ARCHITECTURE.md's note on
    this engine and the spec doc's "Retraining Eligibility Gates" section.
    A profile that has never been trained skips the cooldown gate (nothing
    to cool down from) but still needs the volume + activity gates."""
    now = now or datetime.now(timezone.utc)

    if profile.last_active_at is None:
        return False
    last_active = _aware(profile.last_active_at)
    if now - last_active > timedelta(days=settings.user_pattern_active_within_days):
        return False

    if profile.pending_transactions_count < settings.user_pattern_min_new_transactions:
        return False

    if profile.last_retrained_at is not None:
        last_retrained = _aware(profile.last_retrained_at)
        if now - last_retrained < timedelta(hours=settings.user_pattern_retrain_cooldown_hours):
            return False

    return True


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


async def retrain_user_pattern(db: Session, user_id: int) -> UserFinancialProfile:
    """Fits (or summarizes) this user's pattern and records the result.
    Safe to call directly (bypassing is_eligible_for_retrain) for a
    first-ever bootstrap training — see statement_parser_service.py."""
    profile = user_pattern_repository.get_or_create_profile(db, user_id)

    live_amounts, live_hours = _amounts_and_hours_from_live_transactions(db, user_id)
    statement_amounts, statement_hours = user_pattern_repository.get_statement_amounts_and_hours(
        db, user_id
    )
    amounts = live_amounts + statement_amounts
    hours = live_hours + statement_hours
    total_count = len(amounts)

    async with TRAINING_SEMAPHORE:
        artifact = await run_cpu_bound(
            fit_user_pattern, amounts, hours, profile.archetype.value
        )

    if artifact is not None:
        profile.p50_amount = artifact.baseline.p50
        profile.p90_amount = artifact.baseline.p90
        profile.p99_amount = artifact.baseline.p99
        _write_and_record_artifact(db, profile=profile, user_id=user_id, artifact=artifact)

    profile.total_transactions_at_last_train = total_count
    profile.pending_transactions_count = 0
    profile.needs_retrain = False
    profile.last_retrained_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(profile)
    return profile


def _amounts_and_hours_from_live_transactions(
    db: Session, user_id: int
) -> tuple[list[float], list[int]]:
    txns = transaction_repository.get_confirmed_transactions(db, user_id)
    amounts = [float(t.amount) for t in txns]
    hours = [t.timestamp.hour for t in txns]
    return amounts, hours


def _write_and_record_artifact(
    db: Session,
    *,
    profile: UserFinancialProfile,
    user_id: int,
    artifact: OnnxArtifact | QuantileArtifact,
) -> None:
    version = f"v{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
    user_dir = STORAGE_ROOT / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    if isinstance(artifact, OnnxArtifact):
        payload = artifact.onnx_bytes
        filename = f"{version}.onnx"
        extra_metadata = {
            "elevated_threshold": artifact.elevated_threshold,
            "feature_names": list(artifact.feature_names),
            "fit_seconds": artifact.fit_seconds,
        }
    else:
        payload = json.dumps(
            {
                "p50": artifact.baseline.p50,
                "p90": artifact.baseline.p90,
                "p99": artifact.baseline.p99,
                "shrunk_mean": artifact.baseline.shrunk_mean,
                "shrunk_std": artifact.baseline.shrunk_std,
            }
        ).encode("utf-8")
        filename = f"{version}.json"
        extra_metadata = {}

    file_path = user_dir / filename
    file_path.write_bytes(payload)
    checksum = hashlib.sha256(payload).hexdigest()

    # Sidecar metadata (baseline percentiles + threshold, if any) — the
    # model-sync endpoint reads this to fill out the sync response without
    # re-parsing the artifact file itself.
    metadata_path = user_dir / f"{version}.metadata.json"
    metadata_path.write_text(
        json.dumps(
            {
                "count": artifact.baseline.count,
                "p50": artifact.baseline.p50,
                "p90": artifact.baseline.p90,
                "p99": artifact.baseline.p99,
                **extra_metadata,
            }
        ),
        encoding="utf-8",
    )

    user_pattern_repository.save_artifact(
        db,
        profile=profile,
        version=version,
        kind=artifact.kind,
        sha256_checksum=checksum,
        file_size_bytes=len(payload),
        artifact_path=str(file_path.relative_to(BASE_DIR)),
    )
