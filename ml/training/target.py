"""
The S40 transaction-fraud target definition.

Written before any training so that "what is this model predicting?" has a
single auditable answer, rather than being implicitly defined by whichever
column a script happened to read.

WHAT THE MODEL PREDICTS
    P(this payment is fraudulent | information available at the moment the
    user submits it)

    "Fraudulent" for S40 means: a payment the account holder would not
    have wanted to complete — whether because their account/device was
    taken over, or because they were socially engineered into sending it
    (spec §1). This is deliberately broader than "unauthorised access",
    since spec §1 and §11 treat a coerced-but-user-initiated payment as
    fraud too.

WHAT IT DOES NOT PREDICT
    The S40 risk score. This model emits ONE signal that later joins
    behaviour anomaly, device risk, voice risk and rules at the fusion
    layer (spec §12, §35.1, §48). A fraud_probability of 0.87 is not
    "risk 87" and must never be presented as one.

LABEL COMPATIBILITY ACROSS DATASETS
    Phase 3 established that "fraud" is not defined identically across
    sources, and recorded an `s40_compatible` flag per dataset
    (docs/DATA_STRATEGY.md §5). This module restates the consequence for
    training: only labels flagged compatible may become this model's
    target, and even then only when the dataset's mapping in
    ml/datasets/preparation.py sanctions it as a training source.

    Practically, that admits PaySim, the Indian Online Scam dataset, and S40
    synthetic, and excludes IEEE-CIS (card-not-present e-commerce,
    chargeback-derived) and ULB (2013 credit-card fraud, PCA features) —
    both of which describe a different fraud mechanism from S40's.

    NOTE (2026-09-04 real-data retraining pass): `s40_compatible=True` says
    a dataset's *label* means the same thing as S40's target. It says
    nothing about whether the dataset can support S40's *feature* space —
    PaySim and the Indian dataset both pass the label check but fail the
    per-user-history requirement of the original 13-feature design (see
    docs/EDA_REPORT.md). `ml/datasets/preparation.py`'s
    `MODEL_DATASET_MAPPING` is where that second, separate question is
    decided.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from ml.data.canonical import CanonicalColumn as C
from ml.data.registry import REGISTRY

#: The canonical column carrying the label.
TARGET_COLUMN: str = C.IS_FRAUD.value

#: Positive class encoding.
POSITIVE_LABEL: int = 1
NEGATIVE_LABEL: int = 0


@dataclass(frozen=True)
class TargetDefinition:
    column: str
    positive_meaning: str
    negative_meaning: str
    decision_time_statement: str

    def describe(self) -> dict:
        return {
            "column": self.column,
            "positive_meaning": self.positive_meaning,
            "negative_meaning": self.negative_meaning,
            "decision_time": self.decision_time_statement,
        }


S40_FRAUD_TARGET = TargetDefinition(
    column=TARGET_COLUMN,
    positive_meaning=(
        "A payment the account holder would not have wanted to complete — "
        "account/device takeover, or a payment the user was socially "
        "engineered into initiating."
    ),
    negative_meaning=(
        "A payment the account holder genuinely intended, INCLUDING large, "
        "unusual or first-time payments that merely look suspicious."
    ),
    decision_time_statement=(
        "Predicted at payment submission, before the transaction settles. "
        "Any signal unavailable at that instant is leakage."
    ),
)


def assert_label_compatible(dataset: str) -> None:
    """Refuse to train on a dataset whose fraud label means something else.

    Guards the single most damaging mistake available here: pooling
    e-commerce chargeback labels or 2013 credit-card fraud labels into
    S40's target and reporting one meaningless number.
    """
    if dataset not in REGISTRY:
        raise KeyError(f"Unknown dataset '{dataset}'.")
    from ml.data.adapters import (
        CreditCardAdapter,
        IeeeCisAdapter,
        IndianScamAdapter,
        PaySimAdapter,
        SyntheticAdapter,
    )

    adapters = {
        "paysim": PaySimAdapter,
        "ieee_cis": IeeeCisAdapter,
        "credit_card_ulb": CreditCardAdapter,
        "s40_synthetic": SyntheticAdapter,
        "indian_online_scam": IndianScamAdapter,
    }
    adapter_cls = adapters.get(dataset)
    if adapter_cls is None:
        raise ValueError(f"'{dataset}' has no transaction adapter; cannot supply a target.")

    label = adapter_cls().label_definition()
    if label is None or not label.s40_compatible:
        raise ValueError(
            f"'{dataset}' label is not compatible with the S40 fraud target and "
            f"must not be used as a training label. Limitations: "
            f"{label.limitations if label else 'no label definition'}"
        )


def extract_target(frame: pd.DataFrame) -> pd.Series:
    """Pull the target out of a prepared frame, validating its encoding."""
    if TARGET_COLUMN not in frame.columns:
        raise ValueError(f"Frame has no '{TARGET_COLUMN}' column.")

    target = frame[TARGET_COLUMN]
    if target.isna().any():
        raise ValueError(
            f"'{TARGET_COLUMN}' contains nulls. A row with an unknown label must "
            f"be excluded before training, never coerced to 0."
        )

    values = set(pd.unique(target.astype("Int64").dropna()))
    if not values <= {NEGATIVE_LABEL, POSITIVE_LABEL}:
        raise ValueError(f"Target must be in {{0, 1}}; found {sorted(values)}.")

    return target.astype("int64")


def class_distribution(target: pd.Series) -> dict:
    """Measured class balance. Reported, never assumed."""
    total = int(len(target))
    positives = int((target == POSITIVE_LABEL).sum())
    negatives = total - positives
    return {
        "rows": total,
        "positives": positives,
        "negatives": negatives,
        "positive_rate": (positives / total) if total else None,
        # XGBoost's scale_pos_weight convention: negatives / positives.
        "scale_pos_weight": (negatives / positives) if positives else None,
    }
