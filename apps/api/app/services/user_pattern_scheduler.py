"""
Opportunistic retraining sweep for the personalized transaction-pattern
engine — mirrors app/services/guardian_service.py's sweep_expired_requests
/ app/main.py's _guardian_expiry_worker lifespan-task pattern exactly (same
shape: sleep, query a small batch, act, repeat).

Deliberately NOT the primary trigger — see user_pattern_repository.
increment_pending_transactions and the model-sync endpoint
(app/api/routers/financial_profile.py) for the actual demand-driven
triggers (a confirmed transaction, an app foreground). This sweep is only
the backstop that eventually retrains a user who hit the volume gate but
hasn't opened the app since, running rarely (default 30 min) and touching
at most a handful of profiles per pass so it never competes for CPU with
live traffic.
"""

import asyncio
import logging

from app.core.config import settings
from app.core.database import SessionLocal
from app.repositories import user_pattern_repository
from app.services.user_pattern_trainer import retrain_user_pattern

logger = logging.getLogger(__name__)


async def sweep_once() -> int:
    """One sweep pass: retrain up to `user_pattern_sweep_batch_size`
    eligible profiles. Returns the count retrained. Split out from the
    infinite loop below so tests can call it directly without waiting on
    asyncio.sleep."""
    db = SessionLocal()
    try:
        eligible = user_pattern_repository.list_eligible_profiles(
            db,
            cooldown_hours=settings.user_pattern_retrain_cooldown_hours,
            active_within_days=settings.user_pattern_active_within_days,
            limit=settings.user_pattern_sweep_batch_size,
        )
    finally:
        db.close()

    retrained = 0
    for profile in eligible:
        db = SessionLocal()
        try:
            await retrain_user_pattern(db, profile.user_id)
            retrained += 1
        except Exception:
            logger.exception(
                "user pattern retrain failed for user_id=%s; will retry next sweep",
                profile.user_id,
            )
        finally:
            db.close()
        # Leave CPU headroom between fits for live payment processing —
        # same rationale as the spec's own "await asyncio.sleep(2)" note.
        await asyncio.sleep(2)

    return retrained


async def user_pattern_sweep_worker() -> None:
    """Registered in app/main.py's lifespan alongside the guardian expiry
    worker, gated by settings.enable_user_pattern_scheduler."""
    while True:
        try:
            await asyncio.sleep(settings.user_pattern_sweep_interval_seconds)
            await sweep_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("user pattern sweep failed; will retry next interval.")
