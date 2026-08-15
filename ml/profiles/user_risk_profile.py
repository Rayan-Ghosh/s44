"""
User Risk Profile (spec §7).

A compact, *interpretable* summary of how a user normally transacts, used
as the baseline that deviation features compare against.

TWO CONSTRAINTS SHAPE THIS DESIGN:

1. "The profile must NOT itself become a hidden second ML model"
   (Phase 3 brief). Everything here is a plain descriptive statistic —
   counts, means, standard deviations, sets of known entities. No fitting,
   no learned weights, no opaque state. A human reviewing an alert can
   read the profile and understand exactly what "unusual" meant.

2. It must be privacy-minimised (spec §7, §21). The profile stores
   aggregates and hashed-entity membership, not a copy of the user's
   transaction history.

TEMPORAL SAFETY: `update()` is called in chronological order and a profile
only ever reflects transactions strictly *before* the one being scored.
That ordering is what makes deviation features leakage-free, so the
profile deliberately offers no way to rebuild itself from a whole frame at
once.

COLD START: a profile with fewer than `min_history` observations is
`is_cold`. Deviation features return None for cold profiles rather than a
misleading number — one prior transaction cannot establish what "normal"
is, and pretending otherwise would flag every new user. Cold-start policy
(what the risk engine should do with an unscorable user) is a Phase 6
decision and is NOT decided here.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class ProfileConfig:
    #: Observations required before deviation features are considered
    #: meaningful. 5 is a deliberate placeholder — PROPOSED, not tuned.
    min_history: int = 5
    #: Rolling window for "recent" behaviour, in days. PROPOSED.
    window_days: int = 30
    #: Cap on remembered entities, keeping the profile compact per spec §7.
    max_tracked_entities: int = 200


@dataclass
class UserRiskProfile:
    """Descriptive baseline for one user. Updated strictly forward in time."""

    user_id: str
    config: ProfileConfig = field(default_factory=ProfileConfig)

    count: int = 0
    _amount_sum: float = 0.0
    _amount_sq_sum: float = 0.0
    max_amount: float = 0.0
    known_recipients: set[str] = field(default_factory=set)
    known_devices: set[str] = field(default_factory=set)
    known_locations: set[str] = field(default_factory=set)
    #: Hour-of-day histogram (24 buckets) for time-of-day deviation.
    hour_counts: list[int] = field(default_factory=lambda: [0] * 24)
    last_timestamp: datetime | None = None
    #: Recent transaction timestamps, for velocity. Bounded, not full history.
    recent_timestamps: list[datetime] = field(default_factory=list)

    # -- derived statistics ----------------------------------------------

    @property
    def is_cold(self) -> bool:
        return self.count < self.config.min_history

    @property
    def mean_amount(self) -> float | None:
        return self._amount_sum / self.count if self.count else None

    @property
    def std_amount(self) -> float | None:
        """Population standard deviation; None until it is meaningful."""
        if self.count < 2:
            return None
        mean = self._amount_sum / self.count
        variance = max(self._amount_sq_sum / self.count - mean * mean, 0.0)
        return math.sqrt(variance)

    # -- queries used by the feature layer --------------------------------

    def has_seen_recipient(self, recipient: str | None) -> bool | None:
        if recipient is None:
            return None
        return recipient in self.known_recipients

    def has_seen_device(self, device: str | None) -> bool | None:
        if device is None:
            return None
        return device in self.known_devices

    def has_seen_location(self, location: str | None) -> bool | None:
        if location is None:
            return None
        return location in self.known_locations

    def amount_zscore(self, amount: float) -> float | None:
        """Standard deviations from this user's mean.

        None when the profile is cold or the user's spending has no
        variance yet — a z-score against a zero standard deviation is
        infinite, not informative.
        """
        if self.is_cold:
            return None
        std = self.std_amount
        mean = self.mean_amount
        if std is None or mean is None or std <= 1e-9:
            return None
        return (amount - mean) / std

    def amount_ratio(self, amount: float) -> float | None:
        """Multiple of this user's typical spend (spec §14's '7.2x' framing)."""
        if self.is_cold:
            return None
        mean = self.mean_amount
        if not mean or mean <= 1e-9:
            return None
        return amount / mean

    def hour_frequency(self, hour: int) -> float | None:
        """Share of this user's prior activity in a given hour of day."""
        if self.is_cold:
            return None
        total = sum(self.hour_counts)
        return self.hour_counts[hour] / total if total else None

    def transactions_within(self, now: datetime, seconds: int) -> int:
        """Count of prior transactions in the trailing window."""
        cutoff = now.timestamp() - seconds
        return sum(1 for ts in self.recent_timestamps if ts.timestamp() >= cutoff)

    # -- mutation ---------------------------------------------------------

    def update(
        self,
        *,
        amount: float | None,
        recipient: str | None,
        device: str | None,
        location: str | None,
        timestamp: datetime | None,
    ) -> None:
        """Fold one *already-scored* transaction into the baseline.

        Must be called only after features for that transaction have been
        computed, otherwise the transaction would be part of the baseline
        it is measured against.
        """
        if amount is not None and not math.isnan(amount):
            self.count += 1
            self._amount_sum += amount
            self._amount_sq_sum += amount * amount
            self.max_amount = max(self.max_amount, amount)

        if recipient and len(self.known_recipients) < self.config.max_tracked_entities:
            self.known_recipients.add(recipient)
        if device and len(self.known_devices) < self.config.max_tracked_entities:
            self.known_devices.add(device)
        if location and len(self.known_locations) < self.config.max_tracked_entities:
            self.known_locations.add(location)

        if timestamp is not None:
            self.hour_counts[timestamp.hour] += 1
            self.last_timestamp = timestamp
            self.recent_timestamps.append(timestamp)
            # Bound memory: keep only the trailing window.
            cutoff = timestamp.timestamp() - self.config.window_days * 86400
            self.recent_timestamps = [
                ts for ts in self.recent_timestamps if ts.timestamp() >= cutoff
            ]

    def summary(self) -> dict:
        """Auditable snapshot — safe to show an analyst or store as JSON.

        Emits counts and aggregates, never the underlying entity values, so
        it stays privacy-minimised (spec §7, §21).
        """
        return {
            "user_id": self.user_id,
            "transactions_observed": self.count,
            "is_cold": self.is_cold,
            "mean_amount": self.mean_amount,
            "std_amount": self.std_amount,
            "max_amount": self.max_amount or None,
            "known_recipient_count": len(self.known_recipients),
            "known_device_count": len(self.known_devices),
            "known_location_count": len(self.known_locations),
            "window_days": self.config.window_days,
            "min_history": self.config.min_history,
        }
