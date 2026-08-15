"""Canonical schema guarantees, label normalization, and the dataset registry."""

from __future__ import annotations

import json

import pandas as pd
import pytest

from ml.data import registry
from ml.data.adapters import CreditCardAdapter, IeeeCisAdapter, PaySimAdapter
from ml.data.adapters.base import DatasetAdapter
from ml.data.adapters.teleantifraud_adapter import TeleAntiFraudAdapter
from ml.data.canonical import (
    CANONICAL_COLUMNS,
    CANONICAL_DTYPES,
    REQUIRED_COLUMNS,
    Availability,
    CanonicalColumn as C,
    FeatureAvailability,
)
from ml.data.registry import DownloadStatus, Task, VerificationStatus


# --- canonical schema -----------------------------------------------------


def test_every_canonical_column_has_a_declared_dtype():
    assert set(CANONICAL_DTYPES) == set(CANONICAL_COLUMNS)


def test_required_columns_are_canonical():
    assert set(REQUIRED_COLUMNS).issubset(set(CANONICAL_COLUMNS))


def test_empty_canonical_frame_is_null_not_zero_filled():
    """A concept a dataset lacks must be null, never a plausible-looking 0."""
    frame = DatasetAdapter.empty_canonical_frame(rows=3)
    assert list(frame.columns) == list(CANONICAL_COLUMNS)
    assert len(frame) == 3
    assert frame.isna().all().all()


def test_finalize_adds_missing_columns_as_null():
    partial = pd.DataFrame({C.AMOUNT.value: [1.0, 2.0]})
    frame = DatasetAdapter.finalize(partial)
    assert list(frame.columns) == list(CANONICAL_COLUMNS)
    assert frame[C.DEVICE_ID.value].isna().all()


def test_feature_availability_queries():
    availability = FeatureAvailability(
        dataset="x",
        availability={
            C.AMOUNT.value: Availability.OBSERVED,
            C.DEVICE_ID.value: Availability.ABSENT,
            C.LOCATION.value: Availability.ANONYMIZED,
            C.USER_ID.value: Availability.DERIVED,
        },
    )
    assert availability.is_usable(C.AMOUNT.value)
    assert availability.is_usable(C.LOCATION.value)
    assert availability.is_usable(C.USER_ID.value)
    assert not availability.is_usable(C.DEVICE_ID.value)
    # Undeclared columns default to ABSENT rather than silently usable.
    assert availability.of(C.RECIPIENT_ID.value) is Availability.ABSENT
    assert availability.observed_columns() == [C.AMOUNT.value]
    assert availability.absent_columns() == [C.DEVICE_ID.value]


# --- label normalization --------------------------------------------------


def test_each_adapter_documents_its_label_semantics():
    for adapter in (PaySimAdapter(), IeeeCisAdapter(), CreditCardAdapter()):
        label = adapter.label_definition()
        assert label is not None
        assert label.source_field
        assert label.positive_meaning and label.negative_meaning
        assert label.limitations, f"{adapter.name} must state label limitations"


def test_only_s40_compatible_labels_are_marked_compatible():
    """The compatibility flag is the guard against pooling unlike targets.

    PaySim (mobile-money P2P) matches S40's problem; e-commerce card fraud
    and 2013 credit-card fraud do not.
    """
    assert PaySimAdapter().label_definition().s40_compatible is True
    assert IeeeCisAdapter().label_definition().s40_compatible is False
    assert CreditCardAdapter().label_definition().s40_compatible is False
    assert TeleAntiFraudAdapter().label_definition().s40_compatible is True


# --- registry -------------------------------------------------------------


def test_registry_contains_every_expected_dataset():
    assert set(registry.REGISTRY) == {
        "paysim",
        "ieee_cis",
        "credit_card_ulb",
        "teleantifraud",
        "s40_synthetic",
    }


def test_registry_entries_are_fully_documented():
    for name, entry in registry.REGISTRY.items():
        assert entry.name == name
        assert entry.source_url, f"{name} needs an authoritative source"
        assert entry.provenance, f"{name} needs provenance"
        assert entry.licence, f"{name} needs a licence field"
        assert entry.licence_notes, f"{name} needs licence notes"
        assert entry.limitations, f"{name} needs stated limitations"
        assert entry.tasks, f"{name} needs at least one task"


def test_no_dataset_is_marked_downloaded_without_verification():
    for entry in registry.REGISTRY.values():
        if entry.download is DownloadStatus.PRESENT:
            assert entry.verification is not VerificationStatus.PENDING


def test_unverified_datasets_are_excluded_from_downloadable():
    """The Phase 3 rule: unclear licensing means do not download."""
    downloadable_names = {e.name for e in registry.downloadable()}
    for entry in registry.REGISTRY.values():
        if entry.verification is VerificationStatus.PENDING:
            assert entry.name not in downloadable_names


def test_ieee_cis_is_pending_and_therefore_not_downloadable():
    entry = registry.get("ieee_cis")
    assert entry.verification is VerificationStatus.PENDING
    assert entry.download is DownloadStatus.NOT_DOWNLOADED
    assert entry.name not in {e.name for e in registry.downloadable()}


def test_real_world_flag_is_accurate():
    """Never claim a dataset is real banking data unless its source supports it."""
    assert registry.get("paysim").is_real_world_data is False
    assert registry.get("s40_synthetic").is_real_world_data is False
    assert registry.get("credit_card_ulb").is_real_world_data is True
    assert registry.get("ieee_cis").is_real_world_data is True


def test_registry_paths_are_relative_not_personal_absolute_paths():
    for entry in registry.REGISTRY.values():
        assert not entry.relative_path.startswith(("/", "C:", "\\"))
        assert "Users" not in entry.relative_path


def test_local_path_honours_configured_data_dir(tmp_path):
    entry = registry.get("paysim")
    assert entry.local_path(tmp_path) == tmp_path / entry.relative_path


def test_for_task_filters_correctly():
    voice = {e.name for e in registry.for_task(Task.VOICE_SOCIAL_ENGINEERING)}
    assert voice == {"teleantifraud"}
    anomaly = {e.name for e in registry.for_task(Task.ANOMALY_VALIDATION)}
    assert anomaly == {"credit_card_ulb"}


def test_unknown_dataset_raises():
    with pytest.raises(KeyError, match="Unknown dataset"):
        registry.get("nope")


def test_manifest_is_serializable_and_contains_no_secrets(tmp_path):
    path = registry.write_manifest(tmp_path / "manifest.json")
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert set(payload["datasets"]) == set(registry.REGISTRY)
    blob = path.read_text(encoding="utf-8").lower()
    for forbidden in ("password", "api_key", "token", "secret", "kaggle.json"):
        assert forbidden not in blob
