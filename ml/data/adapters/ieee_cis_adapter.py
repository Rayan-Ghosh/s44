"""
IEEE-CIS Fraud Detection adapter (spec §36.2).

Native form is two files joined on TransactionID:
  - transaction: TransactionID, TransactionDT, TransactionAmt, ProductCD,
    card1..card6, addr1/addr2, dist1/dist2, P_/R_emaildomain, C1..C14,
    D1..D15, M1..M9, V1..V339, isFraud
  - identity:    id_01..id_38, DeviceType, DeviceInfo

Only a small, semantically meaningful subset is mapped. The V/C/D/M blocks
are anonymized engineered features from Vesta with no published meaning;
they are legitimate model inputs but cannot support the human-readable
explanations S40 requires (spec §14), so they are deliberately not forced
into named canonical columns.

`TransactionDT` is documented by the competition as a seconds offset from
an unstated reference point, not a real timestamp. It maps to TIME_INDEX;
TIMESTAMP stays ABSENT rather than inventing a fake epoch.

Device signal is the reason the specification wants this dataset at all
(spec §36.2, §54: "device changes"), so DeviceInfo/DeviceType map to
DEVICE_ID where the identity file is joined in.
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


class IeeeCisAdapter(DatasetAdapter):
    name = "ieee_cis"

    def read_raw(self, path: Path) -> pd.DataFrame:
        return pd.read_csv(path)

    def to_canonical(self, raw: pd.DataFrame) -> AdapterResult:
        missing = {"TransactionID", "TransactionDT", "TransactionAmt"} - set(raw.columns)
        if missing:
            raise ValueError(f"ieee_cis: missing expected columns {sorted(missing)}")

        frame = pd.DataFrame(index=pd.RangeIndex(len(raw)))
        frame[C.SOURCE_DATASET.value] = self.name
        frame[C.SOURCE_ROW_ID.value] = raw["TransactionID"].astype("string")
        frame[C.AMOUNT.value] = pd.to_numeric(raw["TransactionAmt"], errors="coerce")
        frame[C.TIME_INDEX.value] = pd.to_numeric(raw["TransactionDT"], errors="coerce")

        if "ProductCD" in raw.columns:
            frame[C.TRANSACTION_TYPE.value] = raw["ProductCD"].astype("string")

        # No stable per-user identifier exists. `card1` is a card
        # identifier, widely used as a *proxy* for a user in public
        # solutions — mapped as DERIVED and flagged, never presented as a
        # true user ID.
        if "card1" in raw.columns:
            frame[C.USER_ID.value] = "card1:" + raw["card1"].astype("string")

        # Device signal from the identity join, when present.
        device_parts = [c for c in ("DeviceType", "DeviceInfo") if c in raw.columns]
        if device_parts:
            device = raw[device_parts].astype("string").fillna("unknown")
            frame[C.DEVICE_ID.value] = device.agg("|".join, axis=1).astype("string")

        # addr1 is a coarse, anonymized billing region code — the closest
        # thing to geography, and not a place name.
        if "addr1" in raw.columns:
            frame[C.LOCATION.value] = "addr1:" + raw["addr1"].astype("string")

        if "isFraud" in raw.columns:
            frame[C.IS_FRAUD.value] = pd.to_numeric(raw["isFraud"], errors="coerce")

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
                C.USER_ID.value: Availability.DERIVED,
                C.RECIPIENT_ID.value: Availability.ABSENT,
                C.DEVICE_ID.value: Availability.DERIVED,
                C.AMOUNT.value: Availability.OBSERVED,
                C.TRANSACTION_TYPE.value: Availability.OBSERVED,
                C.TIMESTAMP.value: Availability.ABSENT,
                C.TIME_INDEX.value: Availability.OBSERVED,
                C.SENDER_BALANCE_BEFORE.value: Availability.ABSENT,
                C.SENDER_BALANCE_AFTER.value: Availability.ABSENT,
                C.LOCATION.value: Availability.ANONYMIZED,
                C.IS_FRAUD.value: Availability.OBSERVED,
            },
            notes={
                C.USER_ID.value: (
                    "Proxy only: derived from `card1`, a card identifier. Not a "
                    "verified user identity — per-user behavioural features built "
                    "on it are approximations and must be described as such."
                ),
                C.DEVICE_ID.value: (
                    "Concatenated DeviceType|DeviceInfo from the identity file. "
                    "Coarse and frequently missing (identity joins to only part "
                    "of the transaction file)."
                ),
                C.RECIPIENT_ID.value: (
                    "E-commerce transactions have no payee account. Never imputed."
                ),
                C.TIME_INDEX.value: (
                    "TransactionDT is a seconds offset from an undisclosed "
                    "reference point, not wall-clock time."
                ),
                C.LOCATION.value: "addr1 is an anonymized region code, not a place.",
            },
        )

    def label_definition(self) -> LabelDefinition:
        return LabelDefinition(
            source_field="isFraud",
            positive_meaning=(
                "Vesta-labelled fraudulent e-commerce transaction. Per the "
                "competition host, a reported chargeback on a card; subsequent "
                "transactions on that card/account were also labelled fraudulent."
            ),
            negative_meaning="Transactions not associated with a reported chargeback.",
            s40_compatible=False,
            limitations=(
                "CARD-NOT-PRESENT E-COMMERCE FRAUD, not peer-to-peer payment fraud. "
                "S40 targets a user being socially engineered into sending a payment "
                "they initiate themselves; this dataset captures a card being used "
                "without the owner. The label is also chargeback-derived, so it is "
                "delayed and under-reports fraud never disputed. Use for device/"
                "identity feature research and generalization testing (spec §36.2), "
                "NOT for pooling into a single label with PaySim."
            ),
        )
