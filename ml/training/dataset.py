"""
Training dataset assembly.

Thin layer over the Phase 3 preparation pipeline. It does NOT re-implement
feature engineering — Phase 3 owns that, and duplicating it would let the
two definitions drift, which is how a model ends up trained on different
features than it is served with.

What this adds on top of Phase 3:
  - target extraction and validation
  - manifest validation and fixed-order feature selection
  - a recorded, auditable split report (timestamps, counts, overlap)

Ordering is load -> validate -> SPLIT -> (preprocessing downstream, fitted
on train only). No learned transformation happens here, which is what makes
Critical Rule #3 structurally true rather than merely intended.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from ml.data.canonical import CanonicalColumn as C
from ml.data.validation import validate_no_split_contamination
from ml.datasets import prepare_synthetic_dataset
from ml.datasets.preparation import ModelTarget
from ml.training.config import TrainingConfig
from ml.training.feature_manifest import (
    MODEL_FEATURE_NAMES,
    select_features,
    validate_manifest,
)
from ml.training.target import (
    assert_label_compatible,
    class_distribution,
    extract_target,
)


@dataclass(frozen=True)
class SplitData:
    name: str
    X: pd.DataFrame
    y: pd.Series
    frame: pd.DataFrame

    def distribution(self) -> dict:
        return class_distribution(self.y)


@dataclass(frozen=True)
class TrainingData:
    train: SplitData
    validation: SplitData
    test: SplitData
    feature_names: tuple[str, ...]
    split_report: dict

    def as_dict(self) -> dict[str, SplitData]:
        return {"train": self.train, "validation": self.validation, "test": self.test}


def _split_data(name: str, frame: pd.DataFrame) -> SplitData:
    return SplitData(
        name=name,
        X=select_features(frame),
        y=extract_target(frame),
        frame=frame,
    )


def _period(frame: pd.DataFrame) -> dict:
    timestamps = pd.to_datetime(frame[C.TIMESTAMP.value], errors="coerce").dropna()
    if timestamps.empty:
        return {"start": None, "end": None}
    return {"start": str(timestamps.min()), "end": str(timestamps.max())}


def build_training_data(config: TrainingConfig | None = None) -> TrainingData:
    """Produce train/validation/test matrices for the fraud model."""
    config = config or TrainingConfig()

    validate_manifest()
    assert_label_compatible(config.dataset)

    if config.dataset != "s40_synthetic":
        # Governance gate. Other datasets are registered but not present
        # locally, and IEEE-CIS is licence-blocked outright. Rather than
        # failing obscurely deep in a loader, refuse here with the reason.
        raise NotImplementedError(
            f"Dataset '{config.dataset}' is registered but not available locally. "
            f"Phase 3 downloaded nothing: IEEE-CIS is PENDING licence "
            f"verification and must not be fetched, and the remaining public "
            f"sets require an authenticated manual download. See "
            f"docs/DATA_STRATEGY.md §2."
        )

    prepared = prepare_synthetic_dataset(
        ModelTarget.TRANSACTION_FRAUD,
        config=config.synthetic,
        ratios=config.ratios,
    )

    splits = {
        name: _split_data(name, frame) for name, frame in prepared.splits.as_dict().items()
    }

    contamination = validate_no_split_contamination(
        prepared.splits.as_dict(), entity_column=C.USER_ID.value
    )

    report = {
        "dataset": prepared.dataset,
        "split_strategy": prepared.splits.strategy,
        "order_column": prepared.splits.order_column,
        "ratios": {
            "train": config.ratios.train,
            "validation": config.ratios.validation,
            "test": config.ratios.test,
        },
        "splits": {
            name: {
                **split.distribution(),
                "period": _period(split.frame),
                "users": int(split.frame[C.USER_ID.value].nunique()),
            }
            for name, split in splits.items()
        },
        "row_overlap_errors": [i.message for i in contamination.errors],
        # A chronological split intentionally lets a user appear in more
        # than one period — that is what per-user behavioural modelling
        # requires. Recorded as a fact rather than suppressed, because it
        # DOES mean these metrics do not measure generalisation to
        # completely unseen users.
        "entity_overlap_warnings": [i.message for i in contamination.warnings],
        "embargo": (
            "None. Chronological boundaries advance past tied timestamps so no "
            "single instant spans two partitions; no additional gap is applied."
        ),
    }

    if contamination.errors:
        raise ValueError(f"Split contamination detected:\n{contamination.render()}")

    return TrainingData(
        train=splits["train"],
        validation=splits["validation"],
        test=splits["test"],
        feature_names=MODEL_FEATURE_NAMES,
        split_report=report,
    )
