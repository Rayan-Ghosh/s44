"""
Phase 4 — transaction fraud model tests.

Regenerated after the original test file was accidentally deleted
(untracked, lost to `git clean -f`). Written against the CURRENT public
interfaces of ml/training/* by reading those modules directly, not from
memory of the prior version.

Everything here trains on a deliberately small synthetic dataset so the
suite stays fast. No downloaded dataset is required.
"""

from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
import pytest

from ml.data.canonical import CanonicalColumn as C
from ml.data.generators import SyntheticConfig
from ml.training.baseline import train_baseline
from ml.training.calibration import assess_calibration
from ml.training.config import TrainingConfig, XGBParams
from ml.training.dataset import build_training_data
from ml.training.evaluate import (
    best_threshold_by_f1,
    calibration_bins,
    evaluate,
    expected_calibration_error,
    threshold_metrics,
    threshold_sweep,
)
from ml.training.feature_manifest import (
    BASELINE_FEATURES,
    MODEL_FEATURE_NAMES,
    REJECTED_FEATURES,
    DecisionTimeStatus,
    audit_table,
    manifest,
    rejected_table,
    select_features,
    validate_manifest,
)
from ml.training.search import SEARCH_SPACE, params_from_trial, run_search
from ml.training.target import (
    S40_FRAUD_TARGET,
    TARGET_COLUMN,
    assert_label_compatible,
    class_distribution,
    extract_target,
)
from ml.training.xgb_model import compute_scale_pos_weight, train_xgb

warnings.filterwarnings("ignore")

#: Small but large enough to contain positives in every split.
SMALL = SyntheticConfig(seed=40, users=160, history_per_user=12)


@pytest.fixture(scope="module")
def data():
    return build_training_data(TrainingConfig(synthetic=SMALL))


@pytest.fixture(scope="module")
def trained(data):
    return train_xgb(
        data.train.X,
        data.train.y,
        data.validation.X,
        data.validation.y,
        config=TrainingConfig(synthetic=SMALL, xgb=XGBParams(n_estimators=60)),
    )


# ===================== TARGET ==============================================


def test_target_definition_is_documented():
    described = S40_FRAUD_TARGET.describe()
    assert described["column"] == TARGET_COLUMN == C.IS_FRAUD.value
    assert described["positive_meaning"] and described["negative_meaning"]
    assert "before" in described["decision_time"].lower()


def test_incompatible_dataset_labels_are_refused():
    """IEEE-CIS and ULB describe a different fraud mechanism from S40's."""
    for dataset in ("ieee_cis", "credit_card_ulb"):
        with pytest.raises(ValueError, match="not compatible"):
            assert_label_compatible(dataset)


def test_compatible_dataset_labels_are_accepted():
    assert assert_label_compatible("s40_synthetic") is None
    assert assert_label_compatible("paysim") is None


def test_unknown_dataset_raises_keyerror():
    with pytest.raises(KeyError):
        assert_label_compatible("not_a_real_dataset")


def test_extract_target_rejects_nulls():
    frame = pd.DataFrame({TARGET_COLUMN: pd.array([1, None, 0], dtype="Int64")})
    with pytest.raises(ValueError, match="nulls"):
        extract_target(frame)


def test_extract_target_rejects_non_binary():
    frame = pd.DataFrame({TARGET_COLUMN: pd.array([0, 2], dtype="Int64")})
    with pytest.raises(ValueError, match="must be in"):
        extract_target(frame)


def test_extract_target_rejects_missing_column():
    with pytest.raises(ValueError, match="no"):
        extract_target(pd.DataFrame({"other": [1, 0]}))


def test_class_distribution_is_measured():
    target = pd.Series([0] * 90 + [1] * 10)
    dist = class_distribution(target)
    assert dist["positives"] == 10
    assert dist["negatives"] == 90
    assert dist["positive_rate"] == pytest.approx(0.10)
    assert dist["scale_pos_weight"] == pytest.approx(9.0)


def test_class_distribution_handles_zero_positives():
    dist = class_distribution(pd.Series([0, 0, 0]))
    assert dist["positives"] == 0
    assert dist["scale_pos_weight"] is None


# ===================== FEATURE MANIFEST / AUDIT =============================


def test_manifest_validates():
    assert validate_manifest() is None


def test_manifest_has_thirteen_features():
    assert len(BASELINE_FEATURES) == 13
    assert len(MODEL_FEATURE_NAMES) == 13


def test_every_model_feature_is_available_at_decision_time():
    for feature in BASELINE_FEATURES:
        assert feature.decision_time is DecisionTimeStatus.AVAILABLE
        assert feature.spec.is_safe


def test_audit_table_documents_every_feature():
    table = audit_table()
    assert len(table) == len(BASELINE_FEATURES)
    for column in ("source", "calculation", "leakage_risk", "missing_policy"):
        assert table[column].notna().all()
        assert (table[column].astype(str).str.len() > 0).all()


def test_context_features_are_marked_not_explainable():
    """user_transaction_count / profile_is_cold drive the model but must
    never be shown to a worried user as a raw explanation."""
    by_name = {f.name: f for f in BASELINE_FEATURES}
    assert by_name["user_transaction_count"].explainable is False
    assert by_name["profile_is_cold"].explainable is False


def test_known_leaky_fields_are_recorded_as_rejected():
    rejected = {r.name for r in REJECTED_FEATURES}
    assert "isFlaggedFraud" in rejected
    assert "sender_balance_after" in rejected
    assert "scenario" in rejected
    assert "is_history" in rejected
    for record in REJECTED_FEATURES:
        assert record.reason and record.category


def test_rejected_table_matches_rejected_features():
    table = rejected_table()
    assert len(table) == len(REJECTED_FEATURES)


def test_target_and_label_proxies_are_not_model_features():
    banned = {
        TARGET_COLUMN,
        "scenario",
        "is_history",
        C.TIME_INDEX.value,
        C.SOURCE_ROW_ID.value,
        C.USER_ID.value,
    }
    assert not banned & set(MODEL_FEATURE_NAMES)


def test_select_features_enforces_fixed_column_order():
    frame = pd.DataFrame({name: [1.0] for name in reversed(MODEL_FEATURE_NAMES)})
    selected = select_features(frame)
    assert list(selected.columns) == list(MODEL_FEATURE_NAMES)


def test_select_features_rejects_missing_columns():
    frame = pd.DataFrame({MODEL_FEATURE_NAMES[0]: [1.0]})
    with pytest.raises(ValueError, match="missing model features"):
        select_features(frame)


def test_manifest_dict_is_serializable():
    payload = manifest()
    assert payload["feature_count"] == len(BASELINE_FEATURES)
    assert payload["manifest_version"]
    assert payload["rejected"]


# ===================== DATA / SPLITS ========================================


def test_training_data_builds_with_all_splits(data):
    for split in data.as_dict().values():
        assert len(split.X) > 0
        assert len(split.X) == len(split.y)
        assert list(split.X.columns) == list(MODEL_FEATURE_NAMES)


def test_every_split_contains_positives(data):
    for name, split in data.as_dict().items():
        assert int((split.y == 1).sum()) > 0, f"'{name}' has no positives"


def test_splits_have_no_temporal_overlap(data):
    train_end = pd.to_datetime(data.train.frame[C.TIMESTAMP.value]).max()
    val_start = pd.to_datetime(data.validation.frame[C.TIMESTAMP.value]).min()
    val_end = pd.to_datetime(data.validation.frame[C.TIMESTAMP.value]).max()
    test_start = pd.to_datetime(data.test.frame[C.TIMESTAMP.value]).min()
    assert train_end <= val_start
    assert val_end <= test_start


def test_splits_share_no_rows(data):
    ids = {
        name: set(split.frame[C.SOURCE_ROW_ID.value])
        for name, split in data.as_dict().items()
    }
    assert not ids["train"] & ids["validation"]
    assert not ids["train"] & ids["test"]
    assert not ids["validation"] & ids["test"]
    assert not data.split_report["row_overlap_errors"]


def test_split_report_records_periods_and_counts(data):
    report = data.split_report
    assert report["split_strategy"] == "chronological"
    for name in ("train", "validation", "test"):
        entry = report["splits"][name]
        assert entry["rows"] > 0
        assert entry["period"]["start"] and entry["period"]["end"]
        assert entry["positive_rate"] is not None


def test_entity_overlap_is_recorded_not_hidden(data):
    assert isinstance(data.split_report["entity_overlap_warnings"], list)


def test_feature_matrix_excludes_the_target(data):
    assert TARGET_COLUMN not in data.train.X.columns


def test_label_incompatible_dataset_is_refused_first():
    """IEEE-CIS fails the label gate before availability is even considered."""
    with pytest.raises(ValueError, match="not compatible"):
        build_training_data(TrainingConfig(dataset="ieee_cis"))


def test_label_compatible_but_unavailable_dataset_is_refused_on_governance():
    """PaySim passes the label gate but is not present locally."""
    with pytest.raises(NotImplementedError, match="DATA_STRATEGY"):
        build_training_data(TrainingConfig(dataset="paysim"))


# ===================== TRAINING =============================================


def test_xgboost_trains_on_small_data(trained):
    assert trained.booster is not None
    assert trained.feature_names == MODEL_FEATURE_NAMES


def test_training_is_deterministic(data):
    config = TrainingConfig(synthetic=SMALL, xgb=XGBParams(n_estimators=40))
    first = train_xgb(
        data.train.X, data.train.y, data.validation.X, data.validation.y, config=config
    )
    second = train_xgb(
        data.train.X, data.train.y, data.validation.X, data.validation.y, config=config
    )
    np.testing.assert_allclose(
        first.predict_proba(data.validation.X),
        second.predict_proba(data.validation.X),
    )


def test_scale_pos_weight_reflects_imbalance():
    target = pd.Series([0] * 95 + [1] * 5)
    assert compute_scale_pos_weight(target) == pytest.approx(19.0)


def test_training_refuses_without_positives():
    with pytest.raises(ValueError, match="no positives"):
        compute_scale_pos_weight(pd.Series([0, 0, 0]))


def test_predictions_are_probabilities(trained, data):
    probs = trained.predict_proba(data.validation.X)
    assert probs.shape == (len(data.validation.X),)
    assert float(probs.min()) >= 0.0
    assert float(probs.max()) <= 1.0


def test_model_handles_missing_values_natively(trained, data):
    """XGBoost must accept NaN — cold-start features are legitimately absent."""
    X = data.validation.X.copy()
    X.loc[X.index[:5], "amount_zscore"] = np.nan
    probs = trained.predict_proba(X)
    assert np.isfinite(probs).all()


def test_baseline_trains_and_ranks(data):
    baseline = train_baseline(data.train.X, data.train.y)
    probs = baseline.predict_proba(data.validation.X)
    assert probs.shape == (len(data.validation.X),)
    result = evaluate(data.validation.y, probs, split="validation")
    # Must beat the base rate. A PR-AUC at the base rate means no signal.
    assert result.pr_auc > float((data.validation.y == 1).mean())


def test_baseline_exposes_interpretable_coefficients(data):
    baseline = train_baseline(data.train.X, data.train.y)
    coefficients = baseline.coefficients()
    assert coefficients
    assert {"feature", "coefficient"} <= set(coefficients[0])
    # Sorted largest-magnitude first.
    magnitudes = [abs(c["coefficient"]) for c in coefficients]
    assert magnitudes == sorted(magnitudes, reverse=True)


def test_xgboost_feature_importance_covers_manifest(trained):
    importance = trained.feature_importance()
    assert {row["feature"] for row in importance} == set(MODEL_FEATURE_NAMES)
    shares = [row["gain_share"] for row in importance]
    assert sum(shares) == pytest.approx(1.0, abs=1e-6) or sum(shares) == pytest.approx(0.0)


# ===================== HYPERPARAMETER SEARCH ================================


def test_search_space_has_ten_candidates():
    assert len(SEARCH_SPACE) == 10


def test_search_runs_all_candidates_on_validation_only(data):
    config = TrainingConfig(synthetic=SMALL)
    result = run_search(data.train.X, data.train.y, data.validation.X, data.validation.y, config=config)
    assert len(result.trials) == len(SEARCH_SPACE)
    assert result.best in result.trials
    assert result.criterion == "validation PR-AUC (average precision)"


def test_search_selects_the_best_pr_auc(data):
    config = TrainingConfig(synthetic=SMALL)
    result = run_search(data.train.X, data.train.y, data.validation.X, data.validation.y, config=config)
    best_pr_auc = max(t.validation_pr_auc for t in result.trials)
    assert result.best.validation_pr_auc == pytest.approx(best_pr_auc)


def test_params_from_trial_round_trips(data):
    config = TrainingConfig(synthetic=SMALL)
    result = run_search(data.train.X, data.train.y, data.validation.X, data.validation.y, config=config)
    params = params_from_trial(result.best)
    assert isinstance(params, XGBParams)
    assert params.to_dict() == result.best.params


# ===================== METRICS ===============================================


def test_threshold_metrics_are_consistent():
    y_true = [0, 0, 1, 1]
    y_prob = [0.1, 0.6, 0.4, 0.9]
    metrics = threshold_metrics(y_true, y_prob, 0.5)
    assert metrics.true_positives == 1
    assert metrics.false_positives == 1
    assert metrics.false_negatives == 1
    assert metrics.true_negatives == 1
    assert metrics.precision == pytest.approx(0.5)
    assert metrics.recall == pytest.approx(0.5)
    assert metrics.specificity == pytest.approx(0.5)
    assert metrics.false_positive_rate == pytest.approx(0.5)


def test_evaluate_reports_required_metrics(trained, data):
    result = evaluate(
        data.validation.y, trained.predict_proba(data.validation.X), split="validation"
    )
    payload = result.to_dict()
    assert payload["pr_auc"] is not None
    assert payload["roc_auc"] is not None
    for key in ("precision", "recall", "f1", "specificity", "false_positive_rate"):
        assert key in payload["at_threshold"]


def test_roc_auc_is_none_for_single_class():
    """Undefined metrics are reported as None, never fabricated."""
    result = evaluate([0, 0, 0], [0.1, 0.2, 0.3], split="degenerate")
    assert result.roc_auc is None
    assert result.pr_auc is not None  # average_precision_score tolerates this


def test_threshold_sweep_is_monotonic_in_recall():
    y_true = np.array([0] * 80 + [1] * 20)
    rng = np.random.default_rng(0)
    y_prob = np.clip(y_true * 0.5 + rng.random(100) * 0.5, 0, 1)
    sweep = threshold_sweep(y_true, y_prob)
    recalls = [m.recall for m in sweep]
    assert all(a >= b for a, b in zip(recalls, recalls[1:]))


def test_best_threshold_selection_returns_a_candidate():
    y_true = np.array([0] * 50 + [1] * 10)
    y_prob = np.concatenate([np.full(50, 0.1), np.full(10, 0.9)])
    best = best_threshold_by_f1(threshold_sweep(y_true, y_prob))
    assert best.f1 == pytest.approx(1.0)


def test_best_threshold_raises_on_empty_sweep():
    with pytest.raises(ValueError, match="Empty"):
        best_threshold_by_f1([])


def test_calibration_bins_track_observed_rate():
    y_true = [0, 0, 1, 1]
    y_prob = [0.1, 0.1, 0.9, 0.9]
    bins = calibration_bins(y_true, y_prob)
    assert bins
    for row in bins:
        assert 0.0 <= row["mean_predicted"] <= 1.0
        assert 0.0 <= row["observed_rate"] <= 1.0


def test_expected_calibration_error_is_zero_for_perfect_predictions():
    y_true = np.array([0, 0, 1, 1])
    ece = expected_calibration_error(y_true, np.array([0.0, 0.0, 1.0, 1.0]))
    assert ece == pytest.approx(0.0, abs=1e-9)


# ===================== CALIBRATION (assess_calibration) =====================


def test_assess_calibration_never_touches_a_test_set(trained, data):
    """Only validation predictions are passed in; the function has no
    parameter through which a test set could leak in."""
    raw_validation = trained.predict_proba(data.validation.X)
    calibrator, report = assess_calibration(data.validation.y, raw_validation)
    assert report.raw_ece >= 0.0
    assert "test set was not involved" in report.rationale


def test_assess_calibration_applies_only_when_it_helps(trained, data):
    raw_validation = trained.predict_proba(data.validation.X)
    calibrator, report = assess_calibration(
        data.validation.y, raw_validation, min_improvement=0.005
    )
    if report.applied:
        assert calibrator is not None
        assert report.calibrated_ece <= report.raw_ece
    else:
        assert calibrator is None
