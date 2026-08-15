"""Feature engineering: correctness, missing-data honesty, and leakage safety."""

from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd

from ml.data.adapters import CreditCardAdapter, PaySimAdapter, SyntheticAdapter
from ml.data.canonical import (
    CanonicalColumn as C,
    FeatureAvailability,
)
from ml.data.generators import SyntheticConfig
from ml.features import FEATURE_SPECS, UNAVAILABLE_SPEC_FEATURES, compute_features
from ml.features.base import LeakageRisk
from ml.features.engine import supported_feature_names
from ml.profiles import ProfileConfig, UserRiskProfile


def _frame(rows: list[dict]) -> pd.DataFrame:
    frame = pd.DataFrame(rows)
    return PaySimAdapter.finalize(frame)


def _full_availability() -> FeatureAvailability:
    return SyntheticAdapter().availability()


# --- feature metadata -----------------------------------------------------


def test_every_feature_declares_complete_metadata():
    for spec in FEATURE_SPECS:
        assert spec.name and spec.source and spec.calculation
        assert spec.required_inputs, f"{spec.name} must declare its inputs"
        assert spec.missing_behaviour, f"{spec.name} must declare missing behaviour"
        assert isinstance(spec.leakage, LeakageRisk)


def test_feature_names_are_unique():
    names = [spec.name for spec in FEATURE_SPECS]
    assert len(names) == len(set(names))


def test_all_declared_features_are_leakage_safe():
    """Anything not SAFE must not be in the default feature set."""
    for spec in FEATURE_SPECS:
        assert spec.is_safe, f"{spec.name} is {spec.leakage}, not SAFE"


def test_unavailable_spec_features_are_documented_not_fabricated():
    """Features the spec names but the data cannot support stay visible."""
    assert UNAVAILABLE_SPEC_FEATURES
    computed = {spec.name for spec in FEATURE_SPECS}
    for unavailable in UNAVAILABLE_SPEC_FEATURES:
        assert unavailable.name not in computed
        assert unavailable.reason and unavailable.would_require


def test_impossible_travel_is_not_silently_computed():
    """Canonical LOCATION is a place name, so distance is not derivable."""
    names = {u.name for u in UNAVAILABLE_SPEC_FEATURES}
    assert {"impossible_travel", "location_distance", "ip_novelty"} <= names


# --- availability gating --------------------------------------------------


def test_supported_features_respect_dataset_availability():
    paysim_supported = set(supported_feature_names(PaySimAdapter().availability()))
    # PaySim has no device concept.
    assert "new_device" not in paysim_supported
    assert "device_account_count" not in paysim_supported
    # But it does have users, amounts and recipients.
    assert "amount_zscore" in paysim_supported
    assert "recipient_seen_before" in paysim_supported


def test_dataset_without_users_gets_no_behavioural_features():
    """ULB has no cardholder id, so 'normal for this user' is undefined."""
    adapter = CreditCardAdapter()
    availability = adapter.availability()
    assert supported_feature_names(availability) == []

    frame = adapter.finalize(pd.DataFrame({C.AMOUNT.value: [1.0, 2.0, 3.0]}))
    result = compute_features(frame, availability)
    for spec in FEATURE_SPECS:
        assert spec.name not in result.columns


def test_absent_columns_produce_no_feature_columns():
    result = compute_features(
        SyntheticAdapter().generate().frame, PaySimAdapter().availability()
    )
    assert "new_device" not in result.columns


# --- correctness ----------------------------------------------------------


def test_first_transaction_has_no_history():
    frame = _frame(
        [
            {
                C.SOURCE_DATASET.value: "t",
                C.SOURCE_ROW_ID.value: "r1",
                C.USER_ID.value: "u1",
                C.RECIPIENT_ID.value: "p1",
                C.DEVICE_ID.value: "d1",
                C.AMOUNT.value: 500.0,
                C.TIMESTAMP.value: datetime(2026, 1, 1, 10),
                C.TIME_INDEX.value: 0,
                C.LOCATION.value: "Pune",
                C.IS_FRAUD.value: 0,
            }
        ]
    )
    result = compute_features(frame, _full_availability())
    row = result.iloc[0]

    assert row["user_transaction_count"] == 0
    assert row["profile_is_cold"] == 1
    assert row["new_device"] == 1
    assert row["recipient_seen_before"] == 0
    # No baseline yet, so deviation must be None — never 0, which would
    # read as "perfectly normal".
    assert pd.isna(row["amount_zscore"])
    assert pd.isna(row["amount_vs_average"])


def test_known_recipient_and_device_are_recognised_on_repeat():
    base = datetime(2026, 1, 1, 10)
    rows = [
        {
            C.SOURCE_DATASET.value: "t",
            C.SOURCE_ROW_ID.value: f"r{i}",
            C.USER_ID.value: "u1",
            C.RECIPIENT_ID.value: "p1",
            C.DEVICE_ID.value: "d1",
            C.AMOUNT.value: 500.0,
            C.TIMESTAMP.value: base + timedelta(days=i),
            C.TIME_INDEX.value: i,
            C.LOCATION.value: "Pune",
            C.IS_FRAUD.value: 0,
        }
        for i in range(3)
    ]
    result = compute_features(_frame(rows), _full_availability())

    assert result["new_device"].tolist() == [1, 0, 0]
    assert result["recipient_seen_before"].tolist() == [0, 1, 1]
    assert result["user_transaction_count"].tolist() == [0, 1, 2]


def test_amount_deviation_reflects_user_specific_baseline():
    """The same amount is normal for one user and extreme for another."""
    base = datetime(2026, 1, 1, 10)
    rows = []
    for i in range(8):
        rows.append(
            {
                C.SOURCE_DATASET.value: "t",
                C.SOURCE_ROW_ID.value: f"a{i}",
                C.USER_ID.value: "small_spender",
                C.RECIPIENT_ID.value: "p1",
                C.DEVICE_ID.value: "d1",
                C.AMOUNT.value: 500.0 + i,
                C.TIMESTAMP.value: base + timedelta(days=i),
                C.TIME_INDEX.value: i,
                C.LOCATION.value: "Pune",
                C.IS_FRAUD.value: 0,
            }
        )
    rows.append(
        {
            C.SOURCE_DATASET.value: "t",
            C.SOURCE_ROW_ID.value: "a_big",
            C.USER_ID.value: "small_spender",
            C.RECIPIENT_ID.value: "p1",
            C.DEVICE_ID.value: "d1",
            C.AMOUNT.value: 25000.0,
            C.TIMESTAMP.value: base + timedelta(days=20),
            C.TIME_INDEX.value: 20,
            C.LOCATION.value: "Pune",
            C.IS_FRAUD.value: 1,
        }
    )
    result = compute_features(_frame(rows), _full_availability())
    final = result.iloc[-1]
    assert final["amount_vs_average"] > 40
    assert final["amount_zscore"] > 5


def test_velocity_counts_only_prior_transactions_in_window():
    base = datetime(2026, 1, 1, 10)
    rows = [
        {
            C.SOURCE_DATASET.value: "t",
            C.SOURCE_ROW_ID.value: f"v{i}",
            C.USER_ID.value: "u1",
            C.RECIPIENT_ID.value: "p1",
            C.DEVICE_ID.value: "d1",
            C.AMOUNT.value: 100.0,
            C.TIMESTAMP.value: base + timedelta(minutes=2 * i),
            C.TIME_INDEX.value: i,
            C.LOCATION.value: "Pune",
            C.IS_FRAUD.value: 0,
        }
        for i in range(4)
    ]
    result = compute_features(_frame(rows), _full_availability())
    # 0, then 1, 2, 3 prior transactions inside the trailing 10 minutes.
    assert result["transactions_last_10m"].tolist() == [0, 1, 2, 3]


def test_device_account_count_grows_as_users_share_a_device():
    base = datetime(2026, 1, 1, 10)
    rows = [
        {
            C.SOURCE_DATASET.value: "t",
            C.SOURCE_ROW_ID.value: "s1",
            C.USER_ID.value: "u1",
            C.RECIPIENT_ID.value: "p1",
            C.DEVICE_ID.value: "shared",
            C.AMOUNT.value: 100.0,
            C.TIMESTAMP.value: base,
            C.TIME_INDEX.value: 0,
            C.LOCATION.value: "Pune",
            C.IS_FRAUD.value: 0,
        },
        {
            C.SOURCE_DATASET.value: "t",
            C.SOURCE_ROW_ID.value: "s2",
            C.USER_ID.value: "u2",
            C.RECIPIENT_ID.value: "p2",
            C.DEVICE_ID.value: "shared",
            C.AMOUNT.value: 100.0,
            C.TIMESTAMP.value: base + timedelta(hours=1),
            C.TIME_INDEX.value: 1,
            C.LOCATION.value: "Pune",
            C.IS_FRAUD.value: 0,
        },
    ]
    result = compute_features(_frame(rows), _full_availability())
    assert result["device_account_count"].tolist() == [0, 1]


# --- leakage --------------------------------------------------------------


def test_features_do_not_change_when_future_rows_are_appended():
    """The definitive temporal-leakage test.

    A feature for row N must be identical whether or not rows N+1.. exist.
    If appending future data changes an earlier row's features, something
    is looking forward in time.
    """
    base = datetime(2026, 1, 1, 10)

    def rows(count: int) -> list[dict]:
        return [
            {
                C.SOURCE_DATASET.value: "t",
                C.SOURCE_ROW_ID.value: f"r{i}",
                C.USER_ID.value: "u1",
                C.RECIPIENT_ID.value: f"p{i % 2}",
                C.DEVICE_ID.value: f"d{i % 3}",
                C.AMOUNT.value: 100.0 * (i + 1),
                C.TIMESTAMP.value: base + timedelta(hours=i),
                C.TIME_INDEX.value: i,
                C.LOCATION.value: "Pune",
                C.IS_FRAUD.value: 0,
            }
            for i in range(count)
        ]

    availability = _full_availability()
    short = compute_features(_frame(rows(5)), availability)
    long = compute_features(_frame(rows(12)), availability)

    feature_columns = [s.name for s in FEATURE_SPECS if s.name in short.columns]
    pd.testing.assert_frame_equal(
        short[feature_columns].reset_index(drop=True),
        long[feature_columns].head(5).reset_index(drop=True),
        check_dtype=False,
    )


def test_target_is_never_used_as_an_input_feature():
    computed = {spec.name for spec in FEATURE_SPECS}
    assert C.IS_FRAUD.value not in computed
    for spec in FEATURE_SPECS:
        assert C.IS_FRAUD.value not in spec.required_inputs


def test_row_order_does_not_affect_results():
    """Shuffled input must give the same features — the engine sorts first."""
    base = datetime(2026, 1, 1, 10)
    rows = [
        {
            C.SOURCE_DATASET.value: "t",
            C.SOURCE_ROW_ID.value: f"r{i}",
            C.USER_ID.value: "u1",
            C.RECIPIENT_ID.value: "p1",
            C.DEVICE_ID.value: "d1",
            C.AMOUNT.value: 100.0 * (i + 1),
            C.TIMESTAMP.value: base + timedelta(hours=i),
            C.TIME_INDEX.value: i,
            C.LOCATION.value: "Pune",
            C.IS_FRAUD.value: 0,
        }
        for i in range(6)
    ]
    availability = _full_availability()
    ordered = compute_features(_frame(rows), availability)
    shuffled = compute_features(
        _frame(rows).sample(frac=1, random_state=7).reset_index(drop=True), availability
    )
    columns = [s.name for s in FEATURE_SPECS if s.name in ordered.columns]
    pd.testing.assert_frame_equal(
        ordered[columns].reset_index(drop=True),
        shuffled[columns].reset_index(drop=True),
        check_dtype=False,
    )


# --- user risk profile ----------------------------------------------------


def test_profile_is_cold_until_min_history():
    profile = UserRiskProfile(user_id="u1", config=ProfileConfig(min_history=3))
    assert profile.is_cold
    for i in range(3):
        profile.update(
            amount=100.0 + i,
            recipient="p1",
            device="d1",
            location="Pune",
            timestamp=datetime(2026, 1, 1, 10) + timedelta(days=i),
        )
    assert not profile.is_cold


def test_cold_profile_returns_none_rather_than_a_misleading_number():
    profile = UserRiskProfile(user_id="u1", config=ProfileConfig(min_history=5))
    profile.update(
        amount=100.0, recipient="p", device="d", location="L", timestamp=datetime(2026, 1, 1)
    )
    assert profile.amount_zscore(100000.0) is None
    assert profile.amount_ratio(100000.0) is None


def test_profile_zscore_is_none_when_spending_has_no_variance():
    """A z-score against zero variance is infinite, not informative."""
    profile = UserRiskProfile(user_id="u1", config=ProfileConfig(min_history=2))
    for _ in range(5):
        profile.update(
            amount=500.0, recipient="p", device="d", location="L", timestamp=datetime(2026, 1, 1)
        )
    assert profile.amount_zscore(500.0) is None


def test_profile_summary_is_privacy_minimised():
    """Summaries expose counts, never the underlying entity values (spec §7, §21)."""
    profile = UserRiskProfile(user_id="u1")
    profile.update(
        amount=100.0,
        recipient="secret-payee@upi",
        device="secret-device-fingerprint",
        location="Pune",
        timestamp=datetime(2026, 1, 1),
    )
    blob = str(profile.summary())
    assert "secret-payee@upi" not in blob
    assert "secret-device-fingerprint" not in blob
    assert profile.summary()["known_recipient_count"] == 1


def test_profile_is_not_a_hidden_model():
    """Phase 3 brief: the profile must stay interpretable and auditable."""
    profile = UserRiskProfile(user_id="u1")
    summary = profile.summary()
    for key in ("transactions_observed", "mean_amount", "is_cold", "min_history"):
        assert key in summary


def test_profile_recent_timestamps_are_bounded_by_window():
    profile = UserRiskProfile(user_id="u1", config=ProfileConfig(window_days=1))
    start = datetime(2026, 1, 1)
    for day in range(5):
        profile.update(
            amount=100.0,
            recipient="p",
            device="d",
            location="L",
            timestamp=start + timedelta(days=day),
        )
    assert len(profile.recent_timestamps) <= 2


def test_synthetic_end_to_end_features_separate_scenarios():
    """The signal the demo depends on actually exists."""
    result = SyntheticAdapter(
        SyntheticConfig(users=20, history_per_user=25)
    ).generate()
    features = compute_features(result.frame, result.availability)
    scenario_rows = features[~features["is_history"].astype(bool)]

    means = scenario_rows.groupby("scenario")["amount_vs_average"].mean()
    assert means["UNUSUAL_AMOUNT"] > means["LEGITIMATE_ROUTINE"] * 3

    # The point of spec §38 Scenario F: a large legitimate payment is not
    # anomalous *for that user*, even though it is large in absolute terms.
    zscores = scenario_rows.groupby("scenario")["amount_zscore"].mean()
    assert zscores["LEGITIMATE_HIGH_VALUE"] < zscores["UNUSUAL_AMOUNT"]

    velocity = scenario_rows.groupby("scenario")["transactions_last_10m"].mean()
    assert velocity["VELOCITY_SPIKE"] > velocity["LEGITIMATE_ROUTINE"]
