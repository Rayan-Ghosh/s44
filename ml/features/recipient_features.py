"""
Recipient-centric feature set (2026-09-04 real-data retraining pass).

S40's original feature design (ml/features/engine.py) keys every deviation
feature on USER_ID: "is this unusual for THIS SENDER". That's the right
question for S40's actual product, but none of the real datasets available
to this project can support it — measured directly (docs/EDA_REPORT.md):
PaySim senders repeat in ~0.15% of rows, and the Indian Online Scam
dataset's customers do not repeat at all once its raw file's duplication
is removed. Every row would be a cold start.

What DOES repeat in both of those datasets is the RECIPIENT: PaySim's
`nameDest` repeats in ~83% of rows, and the Indian dataset's `merchant_id`
repeats ~12x on average (100 merchants / 1,200 rows). So this module asks
a related, still-meaningful question instead: "is this unusual for what
THIS RECIPIENT normally receives" — a standard, well-established fraud
signal (recipient/merchant-level aggregation), not a novel technique.

Reuses `UserRiskProfile` (ml/profiles/user_risk_profile.py) directly —
that class is already entity-generic (a string key, amount statistics,
known-entity sets, an hour histogram, windowed timestamps); it does not
know or care whether the key is a user or a recipient. Same chronological,
score-then-update ordering as ml/features/engine.py for the same leakage
reason: a profile must only ever reflect transactions strictly before the
one being scored.

IEEE-CIS has no recipient/payee concept at all (card-not-present
e-commerce — the "recipient" is Vesta itself), so this feature set is not
computable on it. IEEE-CIS's role stays what it already was: an
evaluation-only check for the parts of the architecture it CAN inform
(device/identity signal) — it is not used to evaluate this model.
"""

from __future__ import annotations

from collections import defaultdict

import pandas as pd

from ml.data.canonical import CanonicalColumn as C, FeatureAvailability
from ml.features.base import FeatureGroup as G, FeatureSpec, LeakageRisk
from ml.profiles.user_risk_profile import ProfileConfig, UserRiskProfile

RECIPIENT_FEATURE_SPECS: tuple[FeatureSpec, ...] = (
    FeatureSpec(
        name="amount",
        group=G.TRANSACTION,
        source="real-data retraining pass, 2026-09-04",
        calculation="Raw transaction amount.",
        required_inputs=(C.AMOUNT.value,),
        missing_behaviour="Never missing — required to even have a row.",
        leakage=LeakageRisk.SAFE,
    ),
    FeatureSpec(
        name="amount_log",
        group=G.TRANSACTION,
        source="real-data retraining pass, 2026-09-04",
        calculation="log1p(amount) — compresses the long right tail typical "
        "of transaction amounts so the model doesn't over-weight raw scale.",
        required_inputs=(C.AMOUNT.value,),
        missing_behaviour="Never missing.",
        leakage=LeakageRisk.SAFE,
    ),
    FeatureSpec(
        name="recipient_amount_zscore",
        group=G.RECIPIENT,
        source="real-data retraining pass, 2026-09-04",
        calculation="(amount - this recipient's prior mean) / this recipient's prior std",
        required_inputs=(C.RECIPIENT_ID.value, C.AMOUNT.value),
        missing_behaviour="None when the recipient profile is cold (<5 prior "
        "transactions) or has no variance yet — never defaulted to 0.",
        leakage=LeakageRisk.SAFE,
        leakage_note="Mean/std computed from strictly prior transactions to this recipient only.",
    ),
    FeatureSpec(
        name="recipient_amount_vs_average",
        group=G.RECIPIENT,
        source="real-data retraining pass, 2026-09-04",
        calculation="amount / this recipient's prior mean amount",
        required_inputs=(C.RECIPIENT_ID.value, C.AMOUNT.value),
        missing_behaviour="None when cold — not defaulted to 1.0.",
        leakage=LeakageRisk.SAFE,
    ),
    FeatureSpec(
        name="recipient_prior_count",
        group=G.RECIPIENT,
        source="real-data retraining pass, 2026-09-04",
        calculation="Count of transactions this recipient has received strictly before this one.",
        required_inputs=(C.RECIPIENT_ID.value,),
        missing_behaviour="0 for a recipient's first-ever transaction — a genuine count, not missing.",
        leakage=LeakageRisk.SAFE,
    ),
    FeatureSpec(
        name="new_recipient",
        group=G.RECIPIENT,
        source="real-data retraining pass, 2026-09-04",
        calculation="1 if this is the first transaction this recipient has ever received, else 0.",
        required_inputs=(C.RECIPIENT_ID.value,),
        missing_behaviour="Never missing given a recipient id.",
        leakage=LeakageRisk.SAFE,
    ),
    FeatureSpec(
        name="recipient_transactions_last_10m",
        group=G.RECIPIENT,
        source="real-data retraining pass, 2026-09-04",
        calculation="Count of transactions to this recipient in the trailing 10 minutes.",
        required_inputs=(C.RECIPIENT_ID.value, C.TIMESTAMP.value),
        missing_behaviour="None when no timestamp is available for this dataset.",
        leakage=LeakageRisk.SAFE,
    ),
    FeatureSpec(
        name="recipient_transactions_last_1h",
        group=G.RECIPIENT,
        source="real-data retraining pass, 2026-09-04",
        calculation="Count of transactions to this recipient in the trailing hour.",
        required_inputs=(C.RECIPIENT_ID.value, C.TIMESTAMP.value),
        missing_behaviour="None when no timestamp is available for this dataset.",
        leakage=LeakageRisk.SAFE,
    ),
    FeatureSpec(
        name="recipient_time_of_day_deviation",
        group=G.RECIPIENT,
        source="real-data retraining pass, 2026-09-04",
        calculation="1 - (share of this recipient's prior activity in this hour of day).",
        required_inputs=(C.RECIPIENT_ID.value, C.TIMESTAMP.value),
        missing_behaviour="None when the recipient profile is cold or no timestamp exists.",
        leakage=LeakageRisk.SAFE,
    ),
)

RECIPIENT_MODEL_FEATURE_NAMES: tuple[str, ...] = tuple(s.name for s in RECIPIENT_FEATURE_SPECS)


def compute_recipient_features(
    frame: pd.DataFrame,
    availability: FeatureAvailability,
    config: ProfileConfig | None = None,
) -> pd.DataFrame:
    """Chronological, recipient-keyed, leakage-safe feature computation.

    Mirrors ml/features/engine.py's compute_features loop exactly, except
    the per-entity state is keyed on RECIPIENT_ID instead of USER_ID.
    """
    config = config or ProfileConfig()
    has_recipient = availability.is_usable(C.RECIPIENT_ID.value)
    has_time = availability.is_usable(C.TIMESTAMP.value)

    if not has_recipient:
        empty_names = [n for n in RECIPIENT_MODEL_FEATURE_NAMES if n != C.AMOUNT.value]
        empty = pd.DataFrame(
            {name: pd.array([pd.NA] * len(frame), dtype="Float64") for name in empty_names},
            index=frame.index,
        )
        return pd.concat([frame, empty], axis=1)

    order_col = C.TIMESTAMP.value if has_time else C.SOURCE_ROW_ID.value
    ordered = frame.sort_values(by=order_col, kind="stable")

    profiles: dict[str, UserRiskProfile] = {}
    rows: list[dict] = []

    for record in ordered.to_dict(orient="records"):
        recipient = record[C.RECIPIENT_ID.value]
        recipient_key = str(recipient) if not pd.isna(recipient) else None
        amount = _as_float(record[C.AMOUNT.value])
        timestamp = _as_datetime(record[C.TIMESTAMP.value]) if has_time else None

        if recipient_key is None or amount is None:
            rows.append({})
            continue

        profile = profiles.get(recipient_key)
        if profile is None:
            profile = UserRiskProfile(user_id=recipient_key, config=config)
            profiles[recipient_key] = profile

        # NOTE: "amount" itself is not recomputed here — it's already the
        # canonical AMOUNT column carried through unchanged in `ordered`,
        # and CanonicalColumn.AMOUNT.value == "amount" collides with it.
        computed: dict[str, object] = {
            "amount_log": _log1p(amount),
            "recipient_amount_zscore": profile.amount_zscore(amount),
            "recipient_amount_vs_average": profile.amount_ratio(amount),
            "recipient_prior_count": profile.count,
            "new_recipient": int(profile.count == 0),
        }

        if has_time and timestamp is not None:
            computed["recipient_transactions_last_10m"] = profile.transactions_within(timestamp, 600)
            computed["recipient_transactions_last_1h"] = profile.transactions_within(timestamp, 3600)
            hour_share = profile.hour_frequency(timestamp.hour)
            computed["recipient_time_of_day_deviation"] = (
                None if hour_share is None else 1.0 - hour_share
            )

        rows.append(computed)

        # --- fold this transaction in, AFTER scoring it -------------------
        profile.update(amount=amount, recipient=None, device=None, location=None, timestamp=timestamp)

    computed_names = tuple(n for n in RECIPIENT_MODEL_FEATURE_NAMES if n != C.AMOUNT.value)
    features = pd.DataFrame(rows, index=ordered.index)
    for name in computed_names:
        if name not in features.columns:
            features[name] = pd.array([pd.NA] * len(features), dtype="Float64")
        else:
            features[name] = pd.to_numeric(features[name], errors="coerce").astype("Float64")

    return pd.concat([ordered, features[list(computed_names)]], axis=1)


def select_recipient_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Fixed-order model matrix extraction, mirroring
    ml/training/feature_manifest.py's select_features."""
    missing = [name for name in RECIPIENT_MODEL_FEATURE_NAMES if name not in frame.columns]
    if missing:
        raise ValueError(f"Frame is missing recipient-model features: {missing}")
    return frame.loc[:, list(RECIPIENT_MODEL_FEATURE_NAMES)].astype("float64")


def _as_float(value) -> float | None:
    if value is None or pd.isna(value):
        return None
    return float(value)


def _as_datetime(value):
    if value is None or pd.isna(value):
        return None
    return pd.Timestamp(value).to_pydatetime()


def _log1p(amount: float) -> float:
    import math

    return math.log1p(max(amount, 0.0))
