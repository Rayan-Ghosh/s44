"""
Feature metadata.

The Phase 3 brief requires every feature to declare its source,
calculation, required inputs, missing-data behaviour, and whether it is
leakage-safe. Encoding that as data rather than prose means the claims can
be *tested* (see ml/tests/test_features.py), which is the difference
between a documented guarantee and an aspirational comment.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class FeatureGroup(str, Enum):
    TRANSACTION = "transaction"
    BEHAVIOUR = "behaviour"
    DEVICE = "device"
    RECIPIENT = "recipient"
    TEMPORAL = "temporal"


class LeakageRisk(str, Enum):
    #: Uses only information available strictly before the transaction.
    SAFE = "SAFE"
    #: Uses information not available at decision time. Must never be fed
    #: to a real-time model; retained only for offline analysis.
    UNSAFE = "UNSAFE"
    #: Safety depends on how it is used; the note explains the condition.
    CONDITIONAL = "CONDITIONAL"


@dataclass(frozen=True)
class FeatureSpec:
    name: str
    group: FeatureGroup
    #: Where the specification asks for this, e.g. "spec §6.1".
    source: str
    calculation: str
    #: Canonical columns required to compute it.
    required_inputs: tuple[str, ...]
    #: What happens when inputs are missing or the profile is cold.
    missing_behaviour: str
    leakage: LeakageRisk
    leakage_note: str = ""

    @property
    def is_safe(self) -> bool:
        return self.leakage is LeakageRisk.SAFE


@dataclass(frozen=True)
class UnavailableFeature:
    """A feature the specification names that canonical data cannot support.

    Recorded explicitly rather than silently skipped, so the gap between
    what the spec asks for and what the data allows stays visible instead
    of being quietly filled with a fabricated value.
    """

    name: str
    source: str
    reason: str
    would_require: str
