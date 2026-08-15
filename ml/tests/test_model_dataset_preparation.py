"""Dataset -> model mapping enforcement and end-to-end dataset preparation."""

from __future__ import annotations

import pytest

from ml.data.canonical import CanonicalColumn as C
from ml.data.generators import SyntheticConfig
from ml.data.registry import REGISTRY
from ml.datasets import MODEL_DATASET_MAPPING, ModelTarget, prepare_synthetic_dataset
from ml.datasets.preparation import assert_pairing_allowed, feature_matrix


def test_every_model_target_has_a_documented_mapping():
    assert set(MODEL_DATASET_MAPPING) == set(ModelTarget)
    for target, mapping in MODEL_DATASET_MAPPING.items():
        assert mapping.target is target
        assert mapping.rationale, f"{target} needs a rationale"


def test_mapping_only_references_registered_datasets():
    known = set(REGISTRY)
    for mapping in MODEL_DATASET_MAPPING.values():
        referenced = (
            set(mapping.training_datasets)
            | set(mapping.evaluation_only)
            | set(mapping.excluded)
        )
        assert referenced <= known, f"unknown dataset(s): {referenced - known}"


def test_a_dataset_is_never_both_training_and_evaluation_only():
    for mapping in MODEL_DATASET_MAPPING.values():
        assert not set(mapping.training_datasets) & set(mapping.evaluation_only)


def test_ieee_cis_is_evaluation_only_for_transaction_fraud():
    """Spec §36.2: do not assume a PaySim model generalizes to IEEE-CIS."""
    mapping = MODEL_DATASET_MAPPING[ModelTarget.TRANSACTION_FRAUD]
    assert "ieee_cis" in mapping.evaluation_only
    assert "ieee_cis" not in mapping.training_datasets


def test_credit_card_is_excluded_from_transaction_fraud_with_a_reason():
    """The Phase 3 brief: do not blindly combine ULB with unrelated data."""
    mapping = MODEL_DATASET_MAPPING[ModelTarget.TRANSACTION_FRAUD]
    assert "credit_card_ulb" in mapping.excluded
    assert mapping.excluded["credit_card_ulb"]


def test_device_risk_has_no_training_datasets():
    """Spec §41: device risk starts as rules, not a trained model."""
    mapping = MODEL_DATASET_MAPPING[ModelTarget.DEVICE_RISK]
    assert mapping.training_datasets == ()


def test_voice_pairing_records_the_unresolved_language_question():
    mapping = MODEL_DATASET_MAPPING[ModelTarget.VOICE_SOCIAL_ENGINEERING]
    assert "teleantifraud" in mapping.training_datasets
    assert "UNRESOLVED" in mapping.rationale
    assert "Chinese" in mapping.rationale


def test_no_single_model_consumes_every_dataset():
    """Spec §35.1: never one giant model over transaction+device+voice."""
    all_datasets = set(REGISTRY)
    for mapping in MODEL_DATASET_MAPPING.values():
        assert set(mapping.training_datasets) != all_datasets


def test_voice_and_transaction_models_share_no_training_data():
    voice = set(MODEL_DATASET_MAPPING[ModelTarget.VOICE_SOCIAL_ENGINEERING].training_datasets)
    transaction = set(
        MODEL_DATASET_MAPPING[ModelTarget.TRANSACTION_FRAUD].training_datasets
    )
    assert not voice & transaction


# --- pairing enforcement --------------------------------------------------


def test_allowed_pairing_passes():
    assert_pairing_allowed(ModelTarget.TRANSACTION_FRAUD, "s40_synthetic") is None


def test_evaluation_only_dataset_is_rejected_as_training_source():
    with pytest.raises(ValueError, match="evaluation-only"):
        assert_pairing_allowed(ModelTarget.TRANSACTION_FRAUD, "ieee_cis")


def test_excluded_dataset_is_rejected_with_its_reason():
    with pytest.raises(ValueError, match="may not be used"):
        assert_pairing_allowed(ModelTarget.TRANSACTION_FRAUD, "credit_card_ulb")


def test_voice_dataset_cannot_train_the_transaction_model():
    with pytest.raises(ValueError):
        assert_pairing_allowed(ModelTarget.TRANSACTION_FRAUD, "teleantifraud")


# --- end-to-end preparation -----------------------------------------------


def test_prepare_synthetic_dataset_runs_end_to_end():
    prepared = prepare_synthetic_dataset(
        config=SyntheticConfig(users=30, history_per_user=15)
    )
    assert prepared.validation.ok
    assert prepared.splits.strategy == "chronological"
    assert prepared.feature_columns

    sizes = prepared.splits.sizes()
    assert all(size > 0 for size in sizes.values())


def test_prepared_splits_are_chronological_and_disjoint():
    prepared = prepare_synthetic_dataset(
        config=SyntheticConfig(users=30, history_per_user=15)
    )
    train, validation, test = (
        prepared.splits.train,
        prepared.splits.validation,
        prepared.splits.test,
    )
    assert train[C.TIMESTAMP.value].max() <= validation[C.TIMESTAMP.value].min()
    assert validation[C.TIMESTAMP.value].max() <= test[C.TIMESTAMP.value].min()
    assert not set(train[C.SOURCE_ROW_ID.value]) & set(test[C.SOURCE_ROW_ID.value])


def test_prepared_dataset_is_deterministic():
    config = SyntheticConfig(users=25, history_per_user=12, seed=99)
    first = prepare_synthetic_dataset(config=config)
    second = prepare_synthetic_dataset(config=config)
    assert first.splits.sizes() == second.splits.sizes()
    assert first.feature_columns == second.feature_columns


def test_summary_reports_real_numbers_not_placeholders():
    prepared = prepare_synthetic_dataset(
        config=SyntheticConfig(users=30, history_per_user=15)
    )
    summary = prepared.summary()
    assert summary["dataset"] == "s40_synthetic"
    assert sum(summary["sizes"].values()) > 0
    assert summary["validation_passed"] is True


def test_feature_matrix_refuses_to_include_the_target():
    prepared = prepare_synthetic_dataset(
        config=SyntheticConfig(users=20, history_per_user=10)
    )
    with pytest.raises(ValueError, match="target must never appear"):
        feature_matrix(prepared.splits.train, (C.IS_FRAUD.value,))


def test_feature_matrix_excludes_the_target_by_construction():
    prepared = prepare_synthetic_dataset(
        config=SyntheticConfig(users=20, history_per_user=10)
    )
    matrix = feature_matrix(prepared.splits.train, prepared.feature_columns)
    assert C.IS_FRAUD.value not in matrix.columns
    assert len(matrix) == len(prepared.splits.train)
