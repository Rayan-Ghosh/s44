"""Split correctness (leakage prevention) and dataset validation reporting."""

from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd
import pytest

from ml.data.adapters import PaySimAdapter, SyntheticAdapter
from ml.data.canonical import Availability, CanonicalColumn as C, FeatureAvailability
from ml.data.generators import SyntheticConfig
from ml.data.splits import (
    SplitRatios,
    chronological_split,
    grouped_split,
)
from ml.data.validation import (
    Severity,
    validate_canonical,
    validate_no_split_contamination,
)


def _frame(rows: list[dict]) -> pd.DataFrame:
    return PaySimAdapter.finalize(pd.DataFrame(rows))


def _rows(count: int, *, user_cycle: int = 1) -> list[dict]:
    base = datetime(2026, 1, 1, 10)
    return [
        {
            C.SOURCE_DATASET.value: "t",
            C.SOURCE_ROW_ID.value: f"r{i}",
            C.USER_ID.value: f"u{i % user_cycle}",
            C.RECIPIENT_ID.value: "p1",
            C.DEVICE_ID.value: "d1",
            C.AMOUNT.value: 100.0 + i,
            C.TIMESTAMP.value: base + timedelta(hours=i),
            C.TIME_INDEX.value: i,
            C.LOCATION.value: "Pune",
            C.IS_FRAUD.value: i % 5 == 0,
        }
        for i in range(count)
    ]


# --- split ratios ---------------------------------------------------------


def test_ratios_must_sum_to_one():
    with pytest.raises(ValueError, match="sum to 1.0"):
        SplitRatios(train=0.8, validation=0.3, test=0.2)


def test_ratios_must_be_positive():
    with pytest.raises(ValueError, match="positive"):
        SplitRatios(train=0.9, validation=0.1, test=0.0)


def test_default_ratios_match_spec_targets():
    """Spec §45 states 70/15/15."""
    ratios = SplitRatios()
    assert (ratios.train, ratios.validation, ratios.test) == (0.70, 0.15, 0.15)


# --- chronological split --------------------------------------------------


def test_chronological_split_preserves_time_order():
    result = chronological_split(_frame(_rows(100)))
    assert result.strategy == "chronological"

    train_max = result.train[C.TIMESTAMP.value].max()
    val_min = result.validation[C.TIMESTAMP.value].min()
    val_max = result.validation[C.TIMESTAMP.value].max()
    test_min = result.test[C.TIMESTAMP.value].min()

    assert train_max <= val_min
    assert val_max <= test_min


def test_chronological_split_covers_every_row_exactly_once():
    frame = _frame(_rows(100))
    result = chronological_split(frame)
    assert sum(result.sizes().values()) == len(frame)

    all_ids = pd.concat(
        [result.train, result.validation, result.test]
    )[C.SOURCE_ROW_ID.value]
    assert all_ids.is_unique
    assert set(all_ids) == set(frame[C.SOURCE_ROW_ID.value])


def test_chronological_split_has_no_contamination():
    result = chronological_split(_frame(_rows(100)))
    report = validate_no_split_contamination(result.as_dict())
    assert report.ok, report.render()


def test_chronological_split_keeps_tied_timestamps_together():
    """Two transactions at the same instant must not straddle a boundary."""
    base = datetime(2026, 1, 1, 10)
    rows = []
    for i in range(30):
        # Ten distinct timestamps, three rows each.
        rows.append(
            {
                C.SOURCE_DATASET.value: "t",
                C.SOURCE_ROW_ID.value: f"r{i}",
                C.USER_ID.value: "u1",
                C.RECIPIENT_ID.value: "p1",
                C.DEVICE_ID.value: "d1",
                C.AMOUNT.value: 100.0,
                C.TIMESTAMP.value: base + timedelta(hours=i // 3),
                C.TIME_INDEX.value: i // 3,
                C.LOCATION.value: "Pune",
                C.IS_FRAUD.value: 0,
            }
        )
    result = chronological_split(_frame(rows))
    for left, right in (
        (result.train, result.validation),
        (result.validation, result.test),
    ):
        if len(left) and len(right):
            assert left[C.TIMESTAMP.value].max() < right[C.TIMESTAMP.value].min()


def test_chronological_split_falls_back_to_time_index():
    """PaySim has an ordinal but no wall-clock time."""
    rows = _rows(60)
    for row in rows:
        row[C.TIMESTAMP.value] = None
    result = chronological_split(_frame(rows))
    assert result.order_column == C.TIME_INDEX.value
    assert result.train[C.TIME_INDEX.value].max() <= result.test[C.TIME_INDEX.value].min()


def test_chronological_split_refuses_without_any_ordering():
    rows = _rows(30)
    for row in rows:
        row[C.TIMESTAMP.value] = None
        row[C.TIME_INDEX.value] = None
    with pytest.raises(ValueError, match="No usable ordering"):
        chronological_split(_frame(rows))


def test_chronological_split_rejects_tiny_frames():
    with pytest.raises(ValueError, match="at least 3 rows"):
        chronological_split(_frame(_rows(2)))


def test_validation_and_test_keep_natural_class_distribution():
    """Imbalance handling belongs to train only (spec §46).

    The splitter must not resample anything; this proves it doesn't.
    """
    frame = _frame(_rows(200))
    result = chronological_split(frame)
    overall = float((frame[C.IS_FRAUD.value] == 1).mean())
    rates = result.positive_rates()
    assert rates["validation"] == pytest.approx(overall, abs=0.08)
    assert rates["test"] == pytest.approx(overall, abs=0.08)


# --- grouped split --------------------------------------------------------


def test_grouped_split_keeps_users_within_one_partition():
    result = grouped_split(_frame(_rows(120, user_cycle=12)))
    train_users = set(result.train[C.USER_ID.value])
    val_users = set(result.validation[C.USER_ID.value])
    test_users = set(result.test[C.USER_ID.value])

    assert not train_users & val_users
    assert not train_users & test_users
    assert not val_users & test_users


def test_grouped_split_is_deterministic():
    frame = _frame(_rows(120, user_cycle=12))
    first = grouped_split(frame, seed=7)
    second = grouped_split(frame, seed=7)
    assert set(first.train[C.SOURCE_ROW_ID.value]) == set(second.train[C.SOURCE_ROW_ID.value])


def test_grouped_split_requires_enough_groups():
    with pytest.raises(ValueError, match="at least 3 distinct"):
        grouped_split(_frame(_rows(30, user_cycle=2)))


def test_entity_leakage_is_detected_when_requested():
    """A row-level split shares users across partitions — flagged, not silent."""
    frame = _frame(_rows(90, user_cycle=3))
    result = chronological_split(frame)
    report = validate_no_split_contamination(
        result.as_dict(), entity_column=C.USER_ID.value
    )
    assert any(i.check == "entity_leakage" for i in report.warnings)


# --- validation reporting -------------------------------------------------


def test_valid_frame_passes():
    result = SyntheticAdapter(SyntheticConfig(users=12, history_per_user=8)).generate()
    report = validate_canonical(result.frame, result.availability)
    assert report.ok, report.render()


def test_report_collects_multiple_issues_rather_than_failing_fast():
    rows = _rows(10)
    rows[0][C.AMOUNT.value] = -5.0
    rows[1][C.AMOUNT.value] = -9.0
    rows[2][C.SOURCE_ROW_ID.value] = rows[3][C.SOURCE_ROW_ID.value]
    report = validate_canonical(_frame(rows), SyntheticAdapter().availability())
    checks = {issue.check for issue in report.issues}
    assert "invalid_amount" in checks
    assert "duplicate_ids" in checks
    assert not report.ok


def test_fabricated_data_in_an_absent_column_is_an_error():
    """The core honesty check: a column the dataset lacks must stay empty."""
    availability = FeatureAvailability(
        dataset="fake",
        availability={
            C.SOURCE_DATASET.value: Availability.DERIVED,
            C.SOURCE_ROW_ID.value: Availability.DERIVED,
            C.AMOUNT.value: Availability.OBSERVED,
            C.DEVICE_ID.value: Availability.ABSENT,  # claims no device data
        },
    )
    report = validate_canonical(_frame(_rows(5)), availability)  # but rows have devices
    assert not report.ok
    assert any(i.check == "fabricated_data" for i in report.errors)


def test_empty_frame_is_an_error():
    report = validate_canonical(
        PaySimAdapter.empty_canonical_frame(0), SyntheticAdapter().availability()
    )
    assert not report.ok


def test_missing_canonical_columns_reported():
    report = validate_canonical(
        pd.DataFrame({"nonsense": [1]}), SyntheticAdapter().availability()
    )
    assert any(i.check == "schema" for i in report.errors)


def test_negative_amount_is_an_error():
    rows = _rows(6)
    rows[0][C.AMOUNT.value] = -100.0
    report = validate_canonical(_frame(rows), SyntheticAdapter().availability())
    assert any(i.check == "invalid_amount" for i in report.errors)


def test_single_class_target_is_an_error():
    rows = _rows(10)
    for row in rows:
        row[C.IS_FRAUD.value] = 0
    report = validate_canonical(_frame(rows), SyntheticAdapter().availability())
    assert any(i.check == "single_class" for i in report.errors)


def test_class_balance_is_reported_as_info():
    report = validate_canonical(_frame(_rows(50)), SyntheticAdapter().availability())
    assert any(
        i.check == "class_balance" and i.severity is Severity.INFO for i in report.issues
    )


def test_paysim_fixture_validates(paysim_path):
    result = PaySimAdapter().load(paysim_path)
    report = validate_canonical(result.frame, result.availability)
    assert report.ok, report.render()


def test_report_renders_readably():
    report = validate_canonical(_frame(_rows(20)), SyntheticAdapter().availability())
    rendered = report.render()
    assert "Validation report" in rendered
    assert "PASS" in rendered
