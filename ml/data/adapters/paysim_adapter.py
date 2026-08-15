"""
PaySim adapter (spec §36.1).

Native schema:
    step, type, amount, nameOrig, oldbalanceOrg, newbalanceOrig,
    nameDest, oldbalanceDest, newbalanceDest, isFraud, isFlaggedFraud

Two leakage hazards live in this dataset and are handled here so they can
never reach the feature layer:

1. `isFlaggedFraud` is the *simulator's own* fraud flag — a post-decision
   outcome. Using it as an input would be textbook target leakage
   (spec §52). It is dropped, not mapped.

2. `newbalanceOrig` is the sender's balance *after* the transaction
   settles. S40's whole premise is intervening *before* a payment
   completes (spec §1), so this value does not exist at decision time.
   It is mapped (it is genuinely observed in the data) but marked in
   `notes` as decision-time-unavailable, and the transaction feature layer
   excludes it. Recording it rather than dropping it keeps the option open
   for offline analysis without letting it leak into a real-time model.

`step` is an hour ordinal (1..744 across a 30-day simulation), not a
wall-clock timestamp. It maps to TIME_INDEX, and TIMESTAMP stays ABSENT
rather than being invented from an arbitrary epoch.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from ml.data.adapters.base import AdapterResult, DatasetAdapter
from ml.data.canonical import (
    Availability,
    CanonicalColumn as C,
    FeatureAvailability,
    LabelDefinition,
)

#: Never mapped into the canonical frame. See module docstring.
LEAKAGE_COLUMNS: frozenset[str] = frozenset({"isFlaggedFraud"})


class PaySimAdapter(DatasetAdapter):
    name = "paysim"

    def read_raw(self, path: Path) -> pd.DataFrame:
        return pd.read_csv(path)

    def to_canonical(self, raw: pd.DataFrame) -> AdapterResult:
        missing = {"step", "type", "amount", "nameOrig", "nameDest", "isFraud"} - set(raw.columns)
        if missing:
            raise ValueError(f"paysim: missing expected columns {sorted(missing)}")

        frame = pd.DataFrame(index=pd.RangeIndex(len(raw)))
        frame[C.SOURCE_DATASET.value] = self.name
        frame[C.SOURCE_ROW_ID.value] = [f"paysim-{i}" for i in range(len(raw))]
        frame[C.USER_ID.value] = raw["nameOrig"].astype("string")
        frame[C.RECIPIENT_ID.value] = raw["nameDest"].astype("string")
        frame[C.AMOUNT.value] = pd.to_numeric(raw["amount"], errors="coerce")
        frame[C.TRANSACTION_TYPE.value] = raw["type"].astype("string")
        frame[C.TIME_INDEX.value] = pd.to_numeric(raw["step"], errors="coerce")
        frame[C.IS_FRAUD.value] = pd.to_numeric(raw["isFraud"], errors="coerce")

        if "oldbalanceOrg" in raw.columns:
            frame[C.SENDER_BALANCE_BEFORE.value] = pd.to_numeric(
                raw["oldbalanceOrg"], errors="coerce"
            )
        if "newbalanceOrig" in raw.columns:
            frame[C.SENDER_BALANCE_AFTER.value] = pd.to_numeric(
                raw["newbalanceOrig"], errors="coerce"
            )

        # DEVICE_ID, LOCATION, TIMESTAMP intentionally left null: PaySim has
        # no device or geography, and no wall-clock time.
        return AdapterResult(
            frame=self.finalize(frame),
            availability=self.availability(),
            label=self.label_definition(),
        )

    def availability(self) -> FeatureAvailability:
        return FeatureAvailability(
            dataset=self.name,
            availability={
                C.SOURCE_DATASET.value: Availability.DERIVED,
                C.SOURCE_ROW_ID.value: Availability.DERIVED,
                C.USER_ID.value: Availability.OBSERVED,
                C.RECIPIENT_ID.value: Availability.OBSERVED,
                C.DEVICE_ID.value: Availability.ABSENT,
                C.AMOUNT.value: Availability.OBSERVED,
                C.TRANSACTION_TYPE.value: Availability.OBSERVED,
                C.TIMESTAMP.value: Availability.ABSENT,
                C.TIME_INDEX.value: Availability.OBSERVED,
                C.SENDER_BALANCE_BEFORE.value: Availability.OBSERVED,
                C.SENDER_BALANCE_AFTER.value: Availability.OBSERVED,
                C.LOCATION.value: Availability.ABSENT,
                C.IS_FRAUD.value: Availability.OBSERVED,
            },
            notes={
                C.TIME_INDEX.value: (
                    "PaySim `step` is an hour ordinal over a 744-hour simulation, "
                    "not wall-clock time. Chronological splits use this ordinal."
                ),
                C.SENDER_BALANCE_AFTER.value: (
                    "Post-settlement balance — NOT available at S40 decision time. "
                    "Excluded from real-time transaction features; retained for "
                    "offline analysis only."
                ),
                C.DEVICE_ID.value: "PaySim has no device concept. Never imputed.",
                C.LOCATION.value: "PaySim has no geography. Never imputed.",
            },
        )

    def label_definition(self) -> LabelDefinition:
        return LabelDefinition(
            source_field="isFraud",
            positive_meaning=(
                "Simulated fraudulent transaction: an agent taking control of an "
                "account and attempting to empty it via TRANSFER then CASH_OUT."
            ),
            negative_meaning="All other simulated transactions.",
            s40_compatible=True,
            limitations=(
                "Synthetic (agent-based simulation seeded from aggregated African "
                "mobile-money logs), so fraud follows the simulator's injected "
                "patterns rather than observed real-world fraud diversity. Fraud "
                "occurs only in TRANSFER and CASH_OUT types. Roughly 0.13% positive."
            ),
        )
