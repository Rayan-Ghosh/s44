"""
Model-specific dataset preparation.

Encodes the dataset -> model mapping as *enforced code* rather than prose,
because the single most damaging thing that could happen to S40's ML work
is quietly pooling datasets whose labels mean different things (spec §36.2
warns about exactly this for PaySim vs IEEE-CIS).

`MODEL_DATASET_MAPPING` is the authority. `assert_pairing_allowed` refuses
combinations the mapping does not sanction, so a future training script
cannot casually concatenate ULB credit-card rows into the transaction
fraud model and produce a meaningless number.

WHAT THIS MODULE DOES NOT DO
    Train anything. Phase 3 stops at reproducible, validated, split
    datasets and the interfaces a model would consume. Building the fraud,
    anomaly and voice models is Phase 4/5 work
    (docs/DEVELOPMENT_PLAN.md).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import pandas as pd

from ml.data.canonical import CanonicalColumn as C, FeatureAvailability
from ml.data.generators import SyntheticConfig
from ml.data.splits import DEFAULT_RATIOS, SplitRatios, SplitResult, chronological_split
from ml.data.validation import ValidationReport, validate_canonical


class ModelTarget(str, Enum):
    """The independent detectors of spec §35.1. Never one combined model."""

    TRANSACTION_FRAUD = "TRANSACTION_FRAUD"
    BEHAVIOUR_ANOMALY = "BEHAVIOUR_ANOMALY"
    DEVICE_RISK = "DEVICE_RISK"
    VOICE_SOCIAL_ENGINEERING = "VOICE_SOCIAL_ENGINEERING"


@dataclass(frozen=True)
class ModelDataset:
    """Which datasets a given detector may use, and why."""

    target: ModelTarget
    #: Datasets whose labels may be used as this model's training target.
    training_datasets: tuple[str, ...]
    #: Datasets usable for evaluation/generalization checks only — their
    #: labels must NOT be pooled into the training target.
    evaluation_only: tuple[str, ...]
    rationale: str
    #: Datasets explicitly excluded, with the reason.
    excluded: dict[str, str]


MODEL_DATASET_MAPPING: dict[ModelTarget, ModelDataset] = {
    ModelTarget.TRANSACTION_FRAUD: ModelDataset(
        target=ModelTarget.TRANSACTION_FRAUD,
        training_datasets=("paysim", "s40_synthetic"),
        evaluation_only=("ieee_cis",),
        rationale=(
            "PaySim is mobile-money peer-to-peer transfer fraud, the closest "
            "public analogue to S40's UPI setting, and spec §36.1 names it as the "
            "starting point. S40 synthetic adds the India/UPI framing and the "
            "multi-signal scenarios no public set contains. IEEE-CIS is "
            "evaluation-only: spec §36.2 explicitly says not to assume a "
            "PaySim-trained model generalizes to it, and its chargeback-derived "
            "e-commerce label means something different from S40's fraud."
        ),
        excluded={
            "credit_card_ulb": (
                "PCA-anonymized features cannot support the explanations spec §14 "
                "requires, and it has no user/recipient/device identity, so none "
                "of S40's behavioural features can be computed on it."
            ),
            "teleantifraud": "Voice data. Belongs to a different detector entirely.",
        },
    ),
    ModelTarget.BEHAVIOUR_ANOMALY: ModelDataset(
        target=ModelTarget.BEHAVIOUR_ANOMALY,
        training_datasets=("s40_synthetic",),
        evaluation_only=("paysim", "credit_card_ulb"),
        rationale=(
            "The anomaly model answers 'is this unusual for THIS user' "
            "(spec §40), so it needs per-user histories. S40 synthetic is the "
            "only source that reliably provides them with known ground truth. "
            "PaySim provides real per-user sequences for sanity-checking. "
            "ULB is useful only as an independent check that the imbalance and "
            "anomaly-scoring technique behaves, since it has no user identity."
        ),
        excluded={
            "ieee_cis": (
                "Its user identity is a card-number proxy, not a verified user, "
                "so per-user 'normal behaviour' would be unreliable."
            ),
            "teleantifraud": "Voice data.",
        },
    ),
    ModelTarget.DEVICE_RISK: ModelDataset(
        target=ModelTarget.DEVICE_RISK,
        training_datasets=(),
        evaluation_only=("ieee_cis", "s40_synthetic"),
        rationale=(
            "Spec §41 is explicit that device risk starts as engineered features "
            "plus deterministic rules, NOT a trained model — hence no training "
            "datasets. IEEE-CIS is the only public source with real device/"
            "identity signal (spec §36.2) and is used to inform which features "
            "are worth computing."
        ),
        excluded={
            "paysim": "No device concept at all.",
            "credit_card_ulb": "No device concept at all.",
        },
    ),
    ModelTarget.VOICE_SOCIAL_ENGINEERING: ModelDataset(
        target=ModelTarget.VOICE_SOCIAL_ENGINEERING,
        training_datasets=("teleantifraud",),
        evaluation_only=(),
        rationale=(
            "TeleAntiFraud-28k is the dataset spec §36.3/§43 names. UNRESOLVED: "
            "it is Chinese-language while S40 is India-first, so a classifier "
            "trained on it cannot be evaluated on Indian audio without an "
            "Indian-language evaluation set that does not yet exist. See the open "
            "question in docs/DATA_STRATEGY.md — this pairing is provisional."
        ),
        excluded={
            "paysim": "No voice data.",
            "ieee_cis": "No voice data.",
            "credit_card_ulb": "No voice data.",
            "s40_synthetic": (
                "The transaction generator produces no transcripts. Scripted "
                "Indian-language voice scenarios are a separate Phase 5 artefact."
            ),
        },
    ),
}


def assert_pairing_allowed(target: ModelTarget, dataset: str) -> None:
    """Raise unless `dataset` may be used as a training source for `target`."""
    mapping = MODEL_DATASET_MAPPING[target]
    if dataset in mapping.training_datasets:
        return
    if dataset in mapping.evaluation_only:
        raise ValueError(
            f"'{dataset}' is evaluation-only for {target.value} and must not be "
            f"pooled into its training target. Reason: {mapping.rationale}"
        )
    reason = mapping.excluded.get(dataset, "not listed in the approved mapping")
    raise ValueError(f"'{dataset}' may not be used for {target.value}: {reason}")


@dataclass(frozen=True)
class PreparedDataset:
    """A reproducible, validated, split dataset ready for a future model."""

    target: ModelTarget
    dataset: str
    splits: SplitResult
    validation: ValidationReport
    availability: FeatureAvailability
    feature_columns: tuple[str, ...]

    def summary(self) -> dict:
        return {
            "target": self.target.value,
            "dataset": self.dataset,
            "sizes": self.splits.sizes(),
            "positive_rates": self.splits.positive_rates(),
            "split_strategy": self.splits.strategy,
            "order_column": self.splits.order_column,
            "feature_count": len(self.feature_columns),
            "validation_passed": self.validation.ok,
        }


def prepare_synthetic_dataset(
    target: ModelTarget = ModelTarget.TRANSACTION_FRAUD,
    *,
    config: SyntheticConfig | None = None,
    ratios: SplitRatios = DEFAULT_RATIOS,
) -> PreparedDataset:
    """End-to-end preparation on S40 synthetic data.

    The only dataset preparable today without a manual download step, which
    makes it the reference implementation of the full path:
    generate -> canonical -> validate -> features -> chronological split.
    """
    from ml.data.adapters import SyntheticAdapter  # local import avoids a cycle
    from ml.features import FEATURE_SPECS, compute_features

    assert_pairing_allowed(target, "s40_synthetic")

    result = SyntheticAdapter(config or SyntheticConfig()).generate()
    report = validate_canonical(result.frame, result.availability)
    if not report.ok:
        raise ValueError(f"Synthetic data failed validation:\n{report.render()}")

    featured = compute_features(result.frame, result.availability)
    feature_columns = tuple(
        spec.name for spec in FEATURE_SPECS if spec.name in featured.columns
    )

    # Chronological, because these are time-ordered transactions and a
    # random split would let a model see the future (spec §45).
    splits = chronological_split(featured, ratios)

    return PreparedDataset(
        target=target,
        dataset="s40_synthetic",
        splits=splits,
        validation=report,
        availability=result.availability,
        feature_columns=feature_columns,
    )


def feature_matrix(frame: pd.DataFrame, feature_columns: tuple[str, ...]) -> pd.DataFrame:
    """Extract just the model-input columns.

    The target is deliberately not returned alongside, so a caller has to
    ask for it explicitly rather than accidentally passing it as a feature.
    """
    missing = [c for c in feature_columns if c not in frame.columns]
    if missing:
        raise ValueError(f"Missing feature columns: {missing}")
    if C.IS_FRAUD.value in feature_columns:
        raise ValueError("The target must never appear in the feature matrix.")
    return frame[list(feature_columns)]
