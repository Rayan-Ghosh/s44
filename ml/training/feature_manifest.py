"""
Model feature manifest and leakage audit.

Critical Rule #2 requires a written, per-feature audit before training.
Encoding it as data rather than prose means the audit is *executable*: the
manifest is validated at training time and asserted in tests, so a feature
cannot quietly enter the model without a decision-time-availability
verdict attached.

The audit answers, for every candidate feature:
  - where it comes from and how it is computed  (inherited from the
    Phase 3 FeatureSpec, so there is one definition, not two)
  - whether it exists at the moment S40 decides   (DecisionTimeStatus)
  - what happens when it is missing               (MissingPolicy)
  - whether it may be shown to a user             (explainable)

REJECTED FEATURES ARE RECORDED, NOT DELETED. A future engineer asking
"why isn't the balance in here?" should find the answer in the manifest
rather than rediscovering the leak.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import pandas as pd

from ml.data.canonical import CanonicalColumn as C
from ml.features import FEATURE_SPECS
from ml.features.base import FeatureSpec

MANIFEST_VERSION = "1.0.0"


class DecisionTimeStatus(str, Enum):
    #: Computable from information the system holds when the user submits.
    AVAILABLE = "AVAILABLE"
    #: Exists in the data but not at decision time. Never a model input.
    UNAVAILABLE = "UNAVAILABLE"


class MissingPolicy(str, Enum):
    #: Passed to the model as NaN. XGBoost learns a default split
    #: direction, which is strictly better than inventing a value.
    NATIVE_NAN = "NATIVE_NAN"
    #: Imputed with a train-fitted statistic, paired with a missing
    #: indicator so the model can still tell it was absent. Used only for
    #: the linear baseline, which cannot accept NaN.
    IMPUTE_WITH_INDICATOR = "IMPUTE_WITH_INDICATOR"


@dataclass(frozen=True)
class ModelFeature:
    """One feature admitted to the model, with its full audit trail."""

    name: str
    dtype: str
    decision_time: DecisionTimeStatus
    missing_policy: MissingPolicy
    #: Why missingness is meaningful, if it is.
    missing_meaning: str
    #: Safe to surface in a user-facing explanation?
    explainable: bool
    #: The Phase 3 spec this inherits source/calculation/leakage from.
    spec: FeatureSpec

    @property
    def source(self) -> str:
        return self.spec.source

    @property
    def calculation(self) -> str:
        return self.spec.calculation

    def audit_row(self) -> dict:
        return {
            "feature": self.name,
            "dtype": self.dtype,
            "source": self.spec.source,
            "calculation": self.spec.calculation,
            "required_inputs": list(self.spec.required_inputs),
            "leakage_risk": self.spec.leakage.value,
            "decision_time": self.decision_time.value,
            "missing_policy": self.missing_policy.value,
            "missing_meaning": self.missing_meaning,
            "explainable": self.explainable,
        }


@dataclass(frozen=True)
class RejectedFeature:
    """A candidate deliberately kept out of the model."""

    name: str
    source: str
    reason: str
    category: str


#: Fields inspected and REJECTED. Recorded so the reasoning survives.
#:
#: These were derived by reading the actual dataset columns rather than
#: trusting documentation — Critical Rule #2 is explicit that dataset docs
#: are not to be taken on faith.
REJECTED_FEATURES: tuple[RejectedFeature, ...] = (
    RejectedFeature(
        name="isFlaggedFraud",
        source="PaySim raw column",
        reason=(
            "The simulator's own fraud flag — a post-decision outcome. Using it "
            "would be near-perfect target leakage. Dropped at the adapter so it "
            "cannot reach the model even accidentally."
        ),
        category="post_decision_flag",
    ),
    RejectedFeature(
        name="sender_balance_after",
        source="PaySim `newbalanceOrig`, canonical SENDER_BALANCE_AFTER",
        reason=(
            "Post-settlement balance. S40 decides BEFORE the payment settles "
            "(spec §1), so this value does not exist at decision time. It is "
            "retained in the canonical frame for offline analysis but is barred "
            "from the model."
        ),
        category="post_transaction_state",
    ),
    RejectedFeature(
        name="is_fraud",
        source="canonical IS_FRAUD",
        reason="The target itself. Asserted absent from the feature matrix.",
        category="target",
    ),
    RejectedFeature(
        name="scenario",
        source="S40 synthetic generator metadata",
        reason=(
            "The generator's scenario name determines the label by construction, "
            "so it is a perfect label proxy. It exists for analysis and test "
            "assertions only and must never be a model input."
        ),
        category="label_proxy",
    ),
    RejectedFeature(
        name="is_history",
        source="S40 synthetic generator metadata",
        reason=(
            "Marks generator baseline rows, which are all label 0. Another "
            "perfect label proxy — every positive is a non-history row."
        ),
        category="label_proxy",
    ),
    RejectedFeature(
        name="source_row_id",
        source="canonical SOURCE_ROW_ID",
        reason=(
            "A row identifier carries no signal, and in the synthetic data it is "
            "assigned in chronological order, so it would act as a time index and "
            "let the model memorise position."
        ),
        category="identifier",
    ),
    RejectedFeature(
        name="time_index",
        source="canonical TIME_INDEX",
        reason=(
            "Absolute position in the dataset. A model could exploit it to learn "
            "'later rows are riskier' from an artefact of data assembly rather "
            "than from behaviour."
        ),
        category="identifier",
    ),
    RejectedFeature(
        name="user_id / recipient_id / device_id",
        source="canonical identity columns",
        reason=(
            "Raw identifiers would let the model memorise specific users rather "
            "than learn generalisable behaviour, and would not transfer to unseen "
            "users at all. Their SIGNAL is already captured in derived form "
            "(recipient_seen_before, new_device, device_account_count)."
        ),
        category="identifier",
    ),
)

#: Human-readable justification for the missing-value policy per feature.
_MISSING_MEANING: dict[str, str] = {
    "amount_zscore": (
        "Missing means the user's baseline is not yet measurable (cold profile "
        "or zero spending variance) — NOT that the amount is typical."
    ),
    "amount_vs_average": (
        "Missing means no usable spending baseline exists yet, not a ratio of 1.0."
    ),
    "time_of_day_deviation": "Missing means no timing baseline yet.",
    "recipient_frequency": "Missing means the user has no prior transactions at all.",
    "seconds_since_last_transaction": (
        "Missing means this is the user's first observed transaction — genuinely "
        "different from 'a very long time since the last one'."
    ),
}


def _spec(name: str) -> FeatureSpec:
    for spec in FEATURE_SPECS:
        if spec.name == name:
            return spec
    raise KeyError(f"No Phase 3 FeatureSpec named '{name}'.")


def _feature(name: str, dtype: str, *, explainable: bool) -> ModelFeature:
    spec = _spec(name)
    return ModelFeature(
        name=name,
        dtype=dtype,
        decision_time=DecisionTimeStatus.AVAILABLE,
        missing_policy=MissingPolicy.NATIVE_NAN,
        missing_meaning=_MISSING_MEANING.get(name, "Not expected to be missing."),
        explainable=explainable,
        spec=spec,
    )


#: The baseline model feature set.
#:
#: Chosen deliberately rather than "every column XGBoost will accept".
#: Every entry is a behavioural deviation signal the specification asks for
#: (spec §6.1-§6.3) and can be explained to a non-technical user, which
#: matters because S40 owes the user a reason (spec §14).
BASELINE_FEATURES: tuple[ModelFeature, ...] = (
    # --- behavioural deviation -----------------------------------------
    _feature("amount_zscore", "float", explainable=True),
    _feature("amount_vs_average", "float", explainable=True),
    # --- recipient -------------------------------------------------------
    _feature("recipient_seen_before", "int", explainable=True),
    _feature("recipient_frequency", "float", explainable=True),
    # --- device ----------------------------------------------------------
    _feature("new_device", "int", explainable=True),
    _feature("device_account_count", "int", explainable=True),
    # --- temporal / velocity ---------------------------------------------
    _feature("transactions_last_10m", "int", explainable=True),
    _feature("transactions_last_1h", "int", explainable=True),
    _feature("time_of_day_deviation", "float", explainable=True),
    _feature("seconds_since_last_transaction", "float", explainable=True),
    # --- location --------------------------------------------------------
    _feature("location_deviation", "int", explainable=True),
    # --- context ---------------------------------------------------------
    # Not user-facing: "your profile is cold" is not an explanation a person
    # can act on. It is kept as a model input because it lets the model
    # distinguish "no deviation" from "deviation not measurable".
    _feature("user_transaction_count", "int", explainable=False),
    _feature("profile_is_cold", "int", explainable=False),
)

MODEL_FEATURE_NAMES: tuple[str, ...] = tuple(f.name for f in BASELINE_FEATURES)


def audit_table() -> pd.DataFrame:
    """The written feature audit, as a table."""
    return pd.DataFrame([f.audit_row() for f in BASELINE_FEATURES])


def rejected_table() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "feature": r.name,
                "source": r.source,
                "category": r.category,
                "reason": r.reason,
            }
            for r in REJECTED_FEATURES
        ]
    )


def manifest() -> dict:
    """Serializable manifest, stored alongside every model artifact."""
    return {
        "manifest_version": MANIFEST_VERSION,
        "feature_count": len(BASELINE_FEATURES),
        "features": [f.audit_row() for f in BASELINE_FEATURES],
        "rejected": [
            {"feature": r.name, "source": r.source, "category": r.category, "reason": r.reason}
            for r in REJECTED_FEATURES
        ],
    }


def validate_manifest() -> None:
    """Fail loudly if the manifest violates its own rules.

    Run at training time so a bad edit is caught before a model is built
    on it, not after the metrics look surprising.
    """
    names = [f.name for f in BASELINE_FEATURES]
    if len(names) != len(set(names)):
        raise ValueError("Duplicate feature names in the manifest.")

    for feature in BASELINE_FEATURES:
        if feature.decision_time is not DecisionTimeStatus.AVAILABLE:
            raise ValueError(
                f"'{feature.name}' is not available at decision time and must not "
                f"be a model feature."
            )
        if not feature.spec.is_safe:
            raise ValueError(
                f"'{feature.name}' has leakage risk {feature.spec.leakage.value}; "
                f"only SAFE features may enter the model."
            )

    banned = {C.IS_FRAUD.value, "scenario", "is_history", C.TIME_INDEX.value}
    overlap = banned & set(names)
    if overlap:
        raise ValueError(f"Banned columns present in the manifest: {sorted(overlap)}")


def select_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Extract the model matrix in a fixed, manifest-defined column order.

    Order is fixed deliberately: a model that receives columns in a
    different order than it was trained on will silently produce garbage
    rather than error, which is one of the easiest ways to ship a broken
    fraud model.
    """
    missing = [name for name in MODEL_FEATURE_NAMES if name not in frame.columns]
    if missing:
        raise ValueError(f"Frame is missing model features: {missing}")
    return frame.loc[:, list(MODEL_FEATURE_NAMES)].astype("float64")
