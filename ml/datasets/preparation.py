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
        training_datasets=("s40_synthetic", "paysim", "indian_online_scam"),
        evaluation_only=("ieee_cis",),
        rationale=(
            "REVISED 2026-09-04 (real-data retraining pass). Phase 4 originally "
            "demoted PaySim to evaluation-only because it cannot support S40's "
            "*original* per-user (USER_ID-keyed) behavioural features — only "
            "~0.15% of originating accounts (nameOrig) repeat. That measurement "
            "still holds and is not being relitigated. What changed: the model "
            "trained in this pass uses a separate, RECIPIENT-centric feature "
            "set (ml/features/recipient_features.py: recipient_amount_zscore, "
            "recipient_frequency, new_recipient, etc., keyed on RECIPIENT_ID "
            "not USER_ID) instead of replacing the original design. PaySim's "
            "*recipients* (nameDest) repeat in ~83% of rows — the opposite of "
            "its sender-side problem — so this feature set is genuinely "
            "computable on it. The same reframing applies to the Indian Online "
            "Scam dataset, whose customers do not repeat (see "
            "docs/EDA_REPORT.md — an earlier EDA pass mistakenly reported "
            "repeat customers, which was an artefact of a ~4x-duplicated raw "
            "file) but whose 100 merchants do (~12 transactions/merchant). "
            "IEEE-CIS stays evaluation-only: it has no recipient/payee concept "
            "at all (card-not-present e-commerce), so even the recipient-"
            "centric feature set is not computable on it, on top of its "
            "separate label-semantics and licence issues (spec §36.2)."
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
        training_datasets=("s40_synthetic", "paysim", "indian_online_scam"),
        evaluation_only=("credit_card_ulb",),
        rationale=(
            "REVISED 2026-09-04, same reasoning as TRANSACTION_FRAUD above: the "
            "anomaly model in this pass answers 'is this unusual for THIS "
            "RECIPIENT' rather than 'this user', which PaySim and the Indian "
            "dataset both support (recipient/merchant repeat activity) even "
            "though neither supports per-user history. S40 synthetic still "
            "provides the per-user-keyed ground truth used for the original "
            "design's own validation. ULB remains useful only as an "
            "independent imbalance/technique check, since it has no recipient "
            "identity either."
        ),
        excluded={
            "ieee_cis": (
                "No recipient/payee concept at all (card-not-present "
                "e-commerce) — neither the original per-user nor the "
                "recipient-centric feature set is computable on it. Its user "
                "identity is also a card-number proxy, not a verified user."
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
