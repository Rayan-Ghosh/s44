"""
Live recipient-history feature computation, backing the real-data model
(ml/inference/recipient_predictor.py — s40_transaction_fraud_real /
s40_behaviour_anomaly_real).

WHY THIS QUERIES BY recipient_hash, NOT recipient_id:
    `Recipient` rows are scoped per (user_id, recipient_hash) — the same
    real-world UPI handle gets a DIFFERENT Recipient row for every sender
    who has paid it (see app/models/recipient.py). The model, however, was
    trained on datasets where the recipient/merchant identity is GLOBAL
    (PaySim's nameDest, the Indian dataset's merchant_id) — "has this
    handle received money before, from anyone." Filtering by recipient_id
    alone would only capture one sender's own history with that recipient,
    which is a narrower, different signal than what the model learned.
    Joining through recipient_hash instead approximates the trained
    signal: it aggregates across every Recipient row (i.e. every sender)
    that shares the same underlying handle.

Mirrors the math in ml/profiles/user_risk_profile.py (mean/std amount,
hour histogram, windowed counts) exactly, computed via a DB query instead
of an in-memory streaming pass — same statistics, different execution
context (a live request, not an offline chronological batch).
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.recipient import Recipient
from app.models.transaction import Transaction

#: Matches ml/profiles/user_risk_profile.py's ProfileConfig.min_history default.
MIN_HISTORY = 5


def compute_recipient_features(
    db: Session,
    *,
    recipient_hash: str,
    amount: float,
    as_of: Optional[datetime] = None,
    exclude_transaction_id: Optional[int] = None,
) -> dict:
    """Live equivalent of ml/features/recipient_features.py's chronological
    computation, for one transaction, queried against real app data."""
    as_of_naive = (as_of or datetime.now(timezone.utc)).replace(tzinfo=None)
    as_of = _aware(as_of) if as_of is not None else datetime.now(timezone.utc)

    # Filter with a naive value — Transaction.timestamp is stored naive
    # (SQLite has no timezone-aware column type), and comparing a
    # tz-aware Python value against it would silently compare on string
    # representation instead of instant, which is unreliable.
    prior = (
        db.query(Transaction.amount, Transaction.timestamp)
        .join(Recipient, Transaction.recipient_id == Recipient.id)
        .filter(Recipient.recipient_hash == recipient_hash, Transaction.timestamp < as_of_naive)
    )
    if exclude_transaction_id is not None:
        prior = prior.filter(Transaction.id != exclude_transaction_id)
    rows = prior.all()

    count = len(rows)
    features: dict = {
        "amount": amount,
        "amount_log": math.log1p(max(amount, 0.0)),
        "recipient_prior_count": count,
        "new_recipient": int(count == 0),
    }

    if count < MIN_HISTORY:
        features["recipient_amount_zscore"] = None
        features["recipient_amount_vs_average"] = None
    else:
        amounts = [float(r.amount) for r in rows]
        mean = sum(amounts) / count
        variance = max(sum((a - mean) ** 2 for a in amounts) / count, 0.0)
        std = math.sqrt(variance)
        features["recipient_amount_vs_average"] = (amount / mean) if mean > 1e-9 else None
        features["recipient_amount_zscore"] = ((amount - mean) / std) if std > 1e-9 else None

    ts_list = [r.timestamp for r in rows if r.timestamp is not None]
    features["recipient_transactions_last_10m"] = sum(
        1 for ts in ts_list if (as_of - _aware(ts)).total_seconds() <= 600
    )
    features["recipient_transactions_last_1h"] = sum(
        1 for ts in ts_list if (as_of - _aware(ts)).total_seconds() <= 3600
    )

    if count < MIN_HISTORY or not ts_list:
        features["recipient_time_of_day_deviation"] = None
    else:
        hour_counts = [0] * 24
        for ts in ts_list:
            hour_counts[_aware(ts).hour] += 1
        total = sum(hour_counts)
        share = hour_counts[as_of.hour] / total if total else None
        features["recipient_time_of_day_deviation"] = None if share is None else 1.0 - share

    return features


def _aware(ts: datetime) -> datetime:
    return ts if ts.tzinfo is not None else ts.replace(tzinfo=timezone.utc)
