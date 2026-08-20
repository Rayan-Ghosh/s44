"""Determinism, scenario coverage, and honesty properties of the generator."""

from __future__ import annotations

import pandas as pd

from ml.data.canonical import CANONICAL_COLUMNS, CanonicalColumn as C
from ml.data.generators import SCENARIOS, Scenario, SyntheticConfig, SyntheticGenerator


def _generate(**overrides) -> pd.DataFrame:
    config = SyntheticConfig(users=20, history_per_user=12, **overrides)
    return SyntheticGenerator(config).generate()


def test_same_seed_produces_identical_output():
    assert _generate(seed=40).equals(_generate(seed=40))


def test_different_seeds_produce_different_output():
    assert not _generate(seed=40).equals(_generate(seed=41))


def test_output_conforms_to_canonical_schema():
    frame = _generate()
    for column in CANONICAL_COLUMNS:
        assert column in frame.columns
    assert "scenario" in frame.columns
    assert "is_history" in frame.columns


def test_all_scenarios_are_represented():
    frame = _generate()
    produced = set(frame.loc[~frame["is_history"].astype(bool), "scenario"])
    assert produced == {s.value for s in SCENARIOS}


def test_every_user_has_history_before_their_scenario_row():
    """Deviation features are meaningless without a baseline."""
    frame = _generate()
    for user, rows in frame.groupby(C.USER_ID.value):
        ordered = rows.sort_values(C.TIMESTAMP.value)
        history = ordered["is_history"].astype(bool)
        assert history.iloc[0], f"{user} starts with a scenario row"
        assert history.sum() > 0


def test_identifiers_are_obviously_synthetic():
    """No real names, accounts, devices or payment handles (spec §2, §21)."""
    frame = _generate()
    assert frame[C.USER_ID.value].str.startswith("SYNTH-USER-").all()
    assert frame[C.RECIPIENT_ID.value].str.startswith("SYNTH-UPI-").all()
    assert frame[C.DEVICE_ID.value].str.startswith("SYNTH-DEVICE-").all()
    assert frame[C.RECIPIENT_ID.value].str.endswith("@synthbank").all()


def test_amounts_are_positive():
    frame = _generate()
    assert (frame[C.AMOUNT.value] > 0).all()


def test_row_ids_are_unique():
    frame = _generate()
    assert frame[C.SOURCE_ROW_ID.value].is_unique


def test_frame_is_chronologically_ordered():
    frame = _generate()
    timestamps = pd.to_datetime(frame[C.TIMESTAMP.value])
    assert timestamps.is_monotonic_increasing


def test_labels_are_not_a_simple_amount_threshold():
    """Spec §38 explicitly forbids `amount > X -> fraud` labelling.

    If any threshold separated the classes perfectly, a model would just
    learn the generator instead of anything about fraud. Proving the
    amount ranges overlap is what shows the labels carry real structure.
    """
    frame = _generate()
    scenario_rows = frame[~frame["is_history"].astype(bool)]
    fraud_amounts = scenario_rows.loc[scenario_rows[C.IS_FRAUD.value] == 1, C.AMOUNT.value]
    legit_amounts = scenario_rows.loc[scenario_rows[C.IS_FRAUD.value] == 0, C.AMOUNT.value]

    assert len(fraud_amounts) and len(legit_amounts)
    # Ranges must overlap: some legitimate payments exceed some fraudulent ones.
    assert float(legit_amounts.max()) > float(fraud_amounts.min())


def test_legitimate_high_value_is_labelled_legitimate():
    """Spec §38 Scenario F — S40 must not be 'block expensive transactions'."""
    frame = _generate()
    rows = frame[frame["scenario"] == Scenario.LEGITIMATE_HIGH_VALUE.value]
    scenario_rows = rows[~rows["is_history"].astype(bool)]
    assert len(scenario_rows) > 0
    assert (scenario_rows[C.IS_FRAUD.value] == 0).all()


def test_legitimate_high_value_users_have_prior_large_transactions():
    """Without this the scenario is feature-identical to UNUSUAL_AMOUNT.

    A large payment is only defensibly legitimate if it is consistent with
    that user's own history — which is precisely S40's thesis.
    """
    frame = _generate()
    rows = frame[frame["scenario"] == Scenario.LEGITIMATE_HIGH_VALUE.value]
    for _, user_rows in rows.groupby(C.USER_ID.value):
        history = user_rows[user_rows["is_history"].astype(bool)]
        scenario = user_rows[~user_rows["is_history"].astype(bool)]
        assert float(history[C.AMOUNT.value].max()) >= float(
            scenario[C.AMOUNT.value].iloc[0]
        ) * 0.5


def test_false_positive_scenario_looks_suspicious_but_is_legitimate():
    """Needed by spec §26 Scenario 4 and the institution FP-review flow."""
    frame = _generate()
    rows = frame[frame["scenario"] == Scenario.FALSE_POSITIVE.value]
    scenario_rows = rows[~rows["is_history"].astype(bool)]
    assert (scenario_rows[C.IS_FRAUD.value] == 0).all()
    # It should genuinely wear suspicious clothing: a new payee.
    for _, user_rows in rows.groupby(C.USER_ID.value):
        history_recipients = set(
            user_rows.loc[user_rows["is_history"].astype(bool), C.RECIPIENT_ID.value]
        )
        scenario_recipient = user_rows.loc[
            ~user_rows["is_history"].astype(bool), C.RECIPIENT_ID.value
        ].iloc[0]
        assert scenario_recipient not in history_recipients


def test_velocity_spike_produces_a_burst():
    frame = _generate()
    rows = frame[
        (frame["scenario"] == Scenario.VELOCITY_SPIKE.value)
        & (~frame["is_history"].astype(bool))
    ]
    per_user = rows.groupby(C.USER_ID.value).size()
    assert (per_user > 1).all()


def test_weak_signal_combination_stacks_multiple_signals():
    """The case that justifies having a fusion layer at all (spec §49)."""
    frame = _generate()
    rows = frame[frame["scenario"] == Scenario.WEAK_SIGNAL_COMBINATION.value]
    for _, user_rows in rows.groupby(C.USER_ID.value):
        history = user_rows[user_rows["is_history"].astype(bool)]
        scenario = user_rows[~user_rows["is_history"].astype(bool)].iloc[0]
        assert scenario[C.RECIPIENT_ID.value] not in set(history[C.RECIPIENT_ID.value])
        assert scenario[C.DEVICE_ID.value] not in set(history[C.DEVICE_ID.value])
        assert scenario[C.LOCATION.value] not in set(history[C.LOCATION.value])


def test_fraud_rate_is_broadly_stationary_over_time():
    """Regression guard for a defect found in Phase 4.

    Every user's scenario row (the only row that can carry a positive
    label) sits at the end of their own timeline. If user start dates are
    staggered over a window narrower than one user's history span, every
    scenario row lands at roughly the same point in the GLOBAL timeline —
    producing a dataset whose fraud rate climbs from 0% to >20% across the
    period.

    That silently invalidates the chronological split Phase 3 mandates:
    train receives almost no positives while test receives a completely
    different class distribution, so no model trained on it means anything.
    `user_start_spread_days` must stay well above the history span.
    """
    frame = SyntheticGenerator(
        SyntheticConfig(users=200, history_per_user=25)
    ).generate()

    deciles = pd.qcut(range(len(frame)), 10, labels=False)
    rates = frame.groupby(deciles)[C.IS_FRAUD.value].mean()

    # The back half must not carry a wildly larger share of fraud than the
    # front half. A 5x gap indicates the clustering defect has returned.
    front, back = rates.iloc[:5].mean(), rates.iloc[5:].mean()
    assert front > 0, "no fraud at all in the first half of the timeline"
    assert back < front * 5, (
        f"fraud is clustered at the end of the timeline "
        f"(front-half rate {front:.4f}, back-half rate {back:.4f}); "
        f"check SyntheticConfig.user_start_spread_days"
    )


def test_chronological_split_gives_every_partition_positives():
    """A split with no positives in train cannot train a fraud model."""
    from ml.data.splits import chronological_split

    frame = SyntheticGenerator(
        SyntheticConfig(users=400, history_per_user=25)
    ).generate()
    splits = chronological_split(frame)
    for name, partition in splits.as_dict().items():
        positives = int((partition[C.IS_FRAUD.value] == 1).sum())
        assert positives > 0, f"'{name}' split contains no positive examples"


def test_cold_start_fraud_coverage_gap_is_pinned():
    """Documents a KNOWN limitation found in the Phase 4 adversarial review.

    Every user accumulates history before their scenario row, so no
    generated fraud ever occurs on a cold-start profile. A model trained on
    this data therefore learns "thin history => safe", which is FALSE in
    reality: new-account fraud is a major real-world category.

    This test pins the gap rather than hiding it. If the generator is later
    extended to emit cold-start fraud, this test fails — which is the
    signal to update docs/FRAUD_MODEL_CARD.md §11 and re-evaluate, not to
    silently delete the assertion.
    """
    from ml.features import compute_features
    from ml.data.adapters import SyntheticAdapter

    result = SyntheticAdapter(
        SyntheticConfig(users=200, history_per_user=20)
    ).generate()
    featured = compute_features(result.frame, result.availability)

    cold = featured["profile_is_cold"].astype("float64") == 1
    assert int(cold.sum()) > 0, "expected some cold-profile rows"

    frauds_while_cold = int(
        (featured.loc[cold, C.IS_FRAUD.value].astype("float64") == 1).sum()
    )
    assert frauds_while_cold == 0, (
        "The generator now produces cold-start fraud. That is an IMPROVEMENT, "
        "but the model card records the opposite — update "
        "docs/FRAUD_MODEL_CARD.md §11 and re-evaluate the model."
    )


def test_config_parameters_actually_control_output():
    small = SyntheticGenerator(SyntheticConfig(users=10, history_per_user=5)).generate()
    large = SyntheticGenerator(SyntheticConfig(users=20, history_per_user=5)).generate()
    assert large[C.USER_ID.value].nunique() > small[C.USER_ID.value].nunique()
