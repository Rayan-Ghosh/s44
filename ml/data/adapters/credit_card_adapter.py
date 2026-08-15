"""
ULB / Worldline credit-card fraud adapter.

NOTE ON PROVENANCE OF THIS REQUIREMENT: this dataset is NOT named in
S40_End_to_End_Project_Plan_FINAL.md. It was added by the project owner in
the Phase 3 brief, in the same way the product directives extend the
specification. It is therefore an approved addition, recorded as such in
docs/DATA_STRATEGY.md rather than presented as an original requirement.

Native schema: Time, V1..V28, Amount, Class.

Almost the entire feature space (V1..V28) is PCA-transformed for
confidentiality, so it carries no semantic meaning. Those columns go into
`anonymized_features`, never into named canonical columns — S40 must be
able to explain *why* it flagged something (spec §14), and "V14 was low"
is not an explanation a user can act on.

The brief is explicit that this dataset must not be blindly combined with
unrelated datasets. The adapter enforces that structurally: it emits no
user, recipient, device, or location, so any attempt to build behavioural
features from it will find those concepts ABSENT rather than fabricated.
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

PCA_COLUMNS: tuple[str, ...] = tuple(f"V{i}" for i in range(1, 29))


class CreditCardAdapter(DatasetAdapter):
    name = "credit_card_ulb"

    def read_raw(self, path: Path) -> pd.DataFrame:
        return pd.read_csv(path)

    def to_canonical(self, raw: pd.DataFrame) -> AdapterResult:
        missing = {"Time", "Amount", "Class"} - set(raw.columns)
        if missing:
            raise ValueError(f"credit_card_ulb: missing expected columns {sorted(missing)}")

        frame = pd.DataFrame(index=pd.RangeIndex(len(raw)))
        frame[C.SOURCE_DATASET.value] = self.name
        frame[C.SOURCE_ROW_ID.value] = [f"ulb-{i}" for i in range(len(raw))]
        frame[C.AMOUNT.value] = pd.to_numeric(raw["Amount"], errors="coerce")
        # `Time` is seconds elapsed since the first transaction in the
        # 2-day capture window — an ordinal, not a timestamp.
        frame[C.TIME_INDEX.value] = pd.to_numeric(raw["Time"], errors="coerce")
        frame[C.IS_FRAUD.value] = pd.to_numeric(raw["Class"], errors="coerce")

        present_pca = [c for c in PCA_COLUMNS if c in raw.columns]
        anonymized = raw[present_pca].copy() if present_pca else None

        return AdapterResult(
            frame=self.finalize(frame),
            availability=self.availability(),
            label=self.label_definition(),
            anonymized_features=anonymized,
        )

    def availability(self) -> FeatureAvailability:
        absent = (
            C.USER_ID.value,
            C.RECIPIENT_ID.value,
            C.DEVICE_ID.value,
            C.TRANSACTION_TYPE.value,
            C.TIMESTAMP.value,
            C.SENDER_BALANCE_BEFORE.value,
            C.SENDER_BALANCE_AFTER.value,
            C.LOCATION.value,
        )
        availability = {column: Availability.ABSENT for column in absent}
        availability.update(
            {
                C.SOURCE_DATASET.value: Availability.DERIVED,
                C.SOURCE_ROW_ID.value: Availability.DERIVED,
                C.AMOUNT.value: Availability.OBSERVED,
                C.TIME_INDEX.value: Availability.OBSERVED,
                C.IS_FRAUD.value: Availability.OBSERVED,
            }
        )
        return FeatureAvailability(
            dataset=self.name,
            availability=availability,
            notes={
                C.USER_ID.value: (
                    "No cardholder identifier is published. Per-user behavioural "
                    "features are therefore impossible on this dataset — which is "
                    "why it is scoped to anomaly/imbalance validation only."
                ),
                C.TIME_INDEX.value: (
                    "Seconds since the first transaction in a ~48-hour European "
                    "capture window. Supports ordering, not calendar features."
                ),
                C.AMOUNT.value: (
                    "Euro amounts. Not directly comparable to PaySim or S40 "
                    "synthetic INR amounts — do not pool amount distributions."
                ),
            },
        )

    def label_definition(self) -> LabelDefinition:
        return LabelDefinition(
            source_field="Class",
            positive_meaning="Confirmed fraudulent credit-card transaction.",
            negative_meaning="Genuine transaction.",
            s40_compatible=False,
            limitations=(
                "Card-present/card-not-present credit-card fraud from a 2013 "
                "European capture — a different fraud mechanism from S40's "
                "socially-engineered UPI payments, and a different era, currency "
                "and regulatory regime. Extremely imbalanced (~0.172% positive). "
                "Features are PCA components, so nothing learned here is "
                "explainable in S40's terms. Use ONLY as an independent check on "
                "imbalance handling and anomaly-detection technique, never pooled "
                "with other datasets' labels."
            ),
        )
