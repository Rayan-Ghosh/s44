"""
Indian Online Scam Dataset adapter.

Provided directly by the project owner (not a public download), sourced
locally at ml/data/raw/indian_scam/transactions.csv. See
docs/EDA_REPORT.md for the full measurement this adapter's design is based
on — summarized here because it changes how the data must be handled:

1. The raw file is a ~4x self-concatenation: 6,753 of 7,953 rows are exact
   full-row duplicates. `read_raw` drops them before anything downstream
   ever sees them — this is NOT optional cleanup, training on the
   duplicated file would massively overweight ~1,200 real rows and also
   fabricate an appearance of repeat-customer history that isn't real
   (an earlier EDA pass measured 1,126/1,132 "repeat customers" before
   catching that the duplication was the cause).

2. Once deduplicated, customers do NOT repeat (1,132 unique customers /
   1,200 rows). Per-user behavioural features (S40's original 13-feature
   design) are therefore NOT computable from this dataset — same
   structural problem PaySim has. This dataset is used with a separate,
   RECIPIENT-centric feature set (ml/features/recipient_features.py)
   instead, which merchants DO support (100 merchants across 1,200 rows).

No device signal exists in this dataset — DEVICE_ID stays ABSENT.
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


class IndianScamAdapter(DatasetAdapter):
    name = "indian_online_scam"

    def read_raw(self, path: Path) -> pd.DataFrame:
        raw = pd.read_csv(path)
        # See module docstring point 1 — the file is a ~4x self-duplication.
        return raw.drop_duplicates().reset_index(drop=True)

    def to_canonical(self, raw: pd.DataFrame) -> AdapterResult:
        missing = {"customer_id", "merchant_id", "amount", "is_fraudulent"} - set(raw.columns)
        if missing:
            raise ValueError(f"indian_online_scam: missing expected columns {sorted(missing)}")

        frame = pd.DataFrame(index=pd.RangeIndex(len(raw)))
        frame[C.SOURCE_DATASET.value] = self.name
        frame[C.SOURCE_ROW_ID.value] = (
            raw["transaction_id"].astype("string")
            if "transaction_id" in raw.columns
            else pd.Series([f"indian-{i}" for i in range(len(raw))], dtype="string")
        )
        frame[C.USER_ID.value] = raw["customer_id"].astype("string")
        frame[C.RECIPIENT_ID.value] = raw["merchant_id"].astype("string")
        frame[C.AMOUNT.value] = pd.to_numeric(raw["amount"], errors="coerce")
        frame[C.TIMESTAMP.value] = pd.to_datetime(raw.get("transaction_time"), errors="coerce")
        if "purchase_category" in raw.columns:
            frame[C.TRANSACTION_TYPE.value] = raw["purchase_category"].astype("string")
        if "location" in raw.columns:
            frame[C.LOCATION.value] = raw["location"].astype("string")
        frame[C.IS_FRAUD.value] = pd.to_numeric(raw["is_fraudulent"], errors="coerce")

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
                C.SOURCE_ROW_ID.value: Availability.OBSERVED,
                C.USER_ID.value: Availability.OBSERVED,
                C.RECIPIENT_ID.value: Availability.OBSERVED,
                C.DEVICE_ID.value: Availability.ABSENT,
                C.AMOUNT.value: Availability.OBSERVED,
                C.TRANSACTION_TYPE.value: Availability.OBSERVED,
                C.TIMESTAMP.value: Availability.OBSERVED,
                C.TIME_INDEX.value: Availability.ABSENT,
                C.SENDER_BALANCE_BEFORE.value: Availability.ABSENT,
                C.SENDER_BALANCE_AFTER.value: Availability.ABSENT,
                C.LOCATION.value: Availability.OBSERVED,
                C.IS_FRAUD.value: Availability.OBSERVED,
            },
            notes={
                C.USER_ID.value: (
                    "Customers do NOT repeat once the raw file's ~4x duplication "
                    "is removed (1,132 unique customers / 1,200 rows) — per-user "
                    "behavioural features are not computable on this dataset. See "
                    "docs/EDA_REPORT.md."
                ),
                C.RECIPIENT_ID.value: (
                    "Merchants DO repeat (100 merchants / 1,200 rows, ~12 "
                    "transactions/merchant) — this is what makes the "
                    "recipient-centric feature set usable here."
                ),
                C.DEVICE_ID.value: "No device concept in this dataset. Never imputed.",
                C.TIME_INDEX.value: "Wall-clock timestamp is observed directly; no separate ordinal needed.",
            },
        )

    def label_definition(self) -> LabelDefinition:
        return LabelDefinition(
            source_field="is_fraudulent",
            positive_meaning=(
                "Row-level fraud flag with an accompanying fraud_type "
                "(phishing / scam / identity theft / malware / payment card "
                "fraud) — categories that map onto S40's own threat model "
                "closely (Indian online/payment scams)."
            ),
            negative_meaning="Not flagged as fraud in the source file.",
            s40_compatible=True,
            limitations=(
                "Provided directly by the project owner, not a verified public "
                "source. The raw file is a ~4x self-concatenation of a smaller "
                "export (deduplicated by this adapter) and its fraud_type "
                "categories are nearly evenly split at an overall 31% fraud "
                "rate — far from any organically-observed fraud rate. This is "
                "the signature of a constructed/practice dataset, not raw "
                "observed transaction logs, and must be described as such (see "
                "docs/EDA_REPORT.md). Customers do not repeat, so it cannot "
                "support S40's original per-user behavioural feature design — "
                "used instead with the recipient-centric feature set."
            ),
        )
