"""Adapter interface conformance + per-dataset mapping correctness."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from ml.data.adapters import (
    CreditCardAdapter,
    DatasetAdapter,
    IeeeCisAdapter,
    PaySimAdapter,
    SyntheticAdapter,
)
from ml.data.adapters.paysim_adapter import LEAKAGE_COLUMNS
from ml.data.adapters.teleantifraud_adapter import TeleAntiFraudAdapter
from ml.data.canonical import (
    CANONICAL_COLUMNS,
    VOICE_CANONICAL_COLUMNS,
    Availability,
    CanonicalColumn as C,
    VoiceCanonicalColumn as V,
)

TRANSACTION_ADAPTERS = [PaySimAdapter, IeeeCisAdapter, CreditCardAdapter, SyntheticAdapter]


# --- interface conformance -------------------------------------------------


@pytest.mark.parametrize("adapter_cls", TRANSACTION_ADAPTERS)
def test_adapter_implements_interface(adapter_cls):
    adapter = adapter_cls()
    assert isinstance(adapter, DatasetAdapter)
    assert isinstance(adapter.name, str) and adapter.name
    assert adapter.availability().dataset == adapter.name


@pytest.mark.parametrize("adapter_cls", TRANSACTION_ADAPTERS)
def test_availability_covers_every_canonical_column(adapter_cls):
    """An adapter must take a position on every canonical concept.

    Silence would default to ABSENT via .of(), which is a safe fallback but
    a bad habit — an unlisted column is usually an oversight, not a claim.
    """
    availability = adapter_cls().availability()
    missing = set(CANONICAL_COLUMNS) - set(availability.availability)
    assert not missing, f"{adapter_cls.__name__} does not declare: {sorted(missing)}"


@pytest.mark.parametrize("adapter_cls", TRANSACTION_ADAPTERS)
def test_missing_file_raises_actionable_error(adapter_cls, tmp_path):
    adapter = adapter_cls()
    if isinstance(adapter, SyntheticAdapter):
        pytest.skip("Synthetic data is generated, not loaded from disk.")
    with pytest.raises(FileNotFoundError, match="DATA_STRATEGY"):
        adapter.load(tmp_path / "does_not_exist.csv")


# --- PaySim ---------------------------------------------------------------


def test_paysim_maps_to_canonical(paysim_path):
    result = PaySimAdapter().load(paysim_path)
    frame = result.frame

    assert list(frame.columns) == list(CANONICAL_COLUMNS)
    assert len(frame) == 10
    assert (frame[C.SOURCE_DATASET.value] == "paysim").all()
    assert frame[C.AMOUNT.value].iloc[0] == pytest.approx(9839.64)
    assert frame[C.USER_ID.value].iloc[0] == "C1231006815"
    assert frame[C.RECIPIENT_ID.value].iloc[0] == "M1979787155"
    assert frame[C.TRANSACTION_TYPE.value].iloc[0] == "PAYMENT"
    assert frame[C.TIME_INDEX.value].iloc[0] == 1
    assert int(frame[C.IS_FRAUD.value].sum()) == 3


def test_paysim_never_maps_the_leakage_column(paysim_path):
    """`isFlaggedFraud` is a post-decision outcome — must not survive mapping."""
    assert "isFlaggedFraud" in LEAKAGE_COLUMNS
    result = PaySimAdapter().load(paysim_path)
    assert "isFlaggedFraud" not in result.frame.columns
    for column in result.frame.columns:
        assert "flag" not in column.lower()


def test_paysim_declares_absent_concepts_and_leaves_them_null(paysim_path):
    result = PaySimAdapter().load(paysim_path)
    availability = result.availability
    for column in (C.DEVICE_ID.value, C.LOCATION.value, C.TIMESTAMP.value):
        assert availability.of(column) is Availability.ABSENT
        assert result.frame[column].isna().all(), f"{column} was fabricated"


def test_paysim_flags_post_settlement_balance_as_decision_time_unavailable(paysim_path):
    note = PaySimAdapter().availability().notes[C.SENDER_BALANCE_AFTER.value]
    assert "NOT available at S40 decision time" in note


def test_paysim_missing_columns_raise():
    with pytest.raises(ValueError, match="missing expected columns"):
        PaySimAdapter().to_canonical(pd.DataFrame({"step": [1]}))


# --- IEEE-CIS -------------------------------------------------------------


def test_ieee_cis_maps_to_canonical(ieee_cis_path):
    result = IeeeCisAdapter().load(ieee_cis_path)
    frame = result.frame

    assert list(frame.columns) == list(CANONICAL_COLUMNS)
    assert len(frame) == 8
    assert frame[C.SOURCE_ROW_ID.value].iloc[0] == "2987000"
    assert frame[C.AMOUNT.value].iloc[0] == pytest.approx(68.5)
    assert frame[C.USER_ID.value].iloc[0].startswith("card1:")
    assert "desktop" in frame[C.DEVICE_ID.value].iloc[0]
    assert int(frame[C.IS_FRAUD.value].sum()) == 2


def test_ieee_cis_has_no_recipient_and_does_not_invent_one(ieee_cis_path):
    result = IeeeCisAdapter().load(ieee_cis_path)
    assert result.availability.of(C.RECIPIENT_ID.value) is Availability.ABSENT
    assert result.frame[C.RECIPIENT_ID.value].isna().all()


def test_ieee_cis_label_is_marked_incompatible_with_s40():
    """Card-not-present fraud is a different problem from S40's.

    The flag is what stops a later phase from pooling this label with
    PaySim's into one training target.
    """
    label = IeeeCisAdapter().label_definition()
    assert label.s40_compatible is False
    assert "e-commerce" in label.limitations.lower()


def test_ieee_cis_user_id_is_documented_as_a_proxy():
    note = IeeeCisAdapter().availability().notes[C.USER_ID.value]
    assert "proxy" in note.lower()


# --- ULB credit card ------------------------------------------------------


def test_credit_card_keeps_pca_out_of_canonical_columns(credit_card_path):
    result = CreditCardAdapter().load(credit_card_path)

    assert list(result.frame.columns) == list(CANONICAL_COLUMNS)
    for column in result.frame.columns:
        assert not column.startswith("V")

    assert result.anonymized_features is not None
    assert list(result.anonymized_features.columns) == [f"V{i}" for i in range(1, 29)]
    assert len(result.anonymized_features) == len(result.frame)


def test_credit_card_has_no_behavioural_identifiers(credit_card_path):
    """Structural guarantee against 'blindly combining' this dataset."""
    result = CreditCardAdapter().load(credit_card_path)
    for column in (C.USER_ID.value, C.RECIPIENT_ID.value, C.DEVICE_ID.value):
        assert result.availability.of(column) is Availability.ABSENT
        assert result.frame[column].isna().all()


def test_credit_card_label_is_marked_incompatible_with_s40():
    label = CreditCardAdapter().label_definition()
    assert label.s40_compatible is False


# --- TeleAntiFraud (voice) ------------------------------------------------


def test_teleantifraud_maps_to_voice_canonical(teleantifraud_path):
    result = TeleAntiFraudAdapter().load(teleantifraud_path)
    frame = result.frame

    assert list(frame.columns) == list(VOICE_CANONICAL_COLUMNS)
    assert len(frame) == 6
    assert int(frame[V.IS_FRAUD.value].sum()) == 3
    assert frame[V.FRAUD_TYPE.value].iloc[1] == "authority_impersonation"


def test_teleantifraud_tags_every_row_as_chinese(teleantifraud_path):
    """The language tag is what stops Chinese training data being silently
    mixed with Indian evaluation data and scored as one number."""
    result = TeleAntiFraudAdapter().load(teleantifraud_path)
    assert (result.frame[V.LANGUAGE.value] == "zh").all()


def test_teleantifraud_limitations_flag_the_language_mismatch():
    label = TeleAntiFraudAdapter().label_definition()
    assert "CHINESE" in label.limitations
    assert "Indian" in label.limitations


def test_voice_schema_is_separate_from_transaction_schema():
    """Voice and transactions are different objects; they meet only at fusion."""
    assert set(VOICE_CANONICAL_COLUMNS) != set(CANONICAL_COLUMNS)
    assert C.AMOUNT.value not in VOICE_CANONICAL_COLUMNS
    assert V.TRANSCRIPT.value not in CANONICAL_COLUMNS


# --- synthetic ------------------------------------------------------------


def test_synthetic_adapter_generates_without_filesystem():
    result = SyntheticAdapter().load(Path("ignored"))
    assert len(result) > 0
    assert (result.frame[C.SOURCE_DATASET.value] == "s40_synthetic").all()


def test_synthetic_label_is_marked_as_not_evidence():
    label = SyntheticAdapter().label_definition()
    assert "SYNTHETIC" in label.limitations.upper()
    assert "never" in label.limitations.lower()
