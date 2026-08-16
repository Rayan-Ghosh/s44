"""
Phase 4 — fraud inference contract, artifact/registry, and explainability
tests.

Regenerated after the original test file was accidentally deleted
(untracked, lost to `git clean -f`). Written against the CURRENT public
interfaces of ml/inference/predict.py, ml/registry/*, and
ml/explainability/* by reading those modules directly.

Trains one small model into a tmp_path artifact root, so nothing here
touches the developer's real ml/models/fraud tree.
"""

from __future__ import annotations

import json
import warnings

import numpy as np
import pandas as pd
import pytest

from ml.data.generators import SyntheticConfig
from ml.explainability import (
    EXPLANATION_MAP,
    ShapExplainer,
    explain_feature,
    validate_explanation_map,
)
from ml.explainability.explanations import RiskDirection
from ml.explainability.shap_explainer import direction_of
from ml.inference import FraudDetector, InputValidationError
from ml.registry import ModelRegistry, ModelStage, load_artifact
from ml.registry.artifact import new_version
from ml.training.config import TrainingConfig, XGBParams
from ml.training.feature_manifest import BASELINE_FEATURES, MODEL_FEATURE_NAMES
from ml.training.train_fraud import train

warnings.filterwarnings("ignore")

SMALL = SyntheticConfig(seed=40, users=160, history_per_user=12)


@pytest.fixture(scope="module")
def artifact_root(tmp_path_factory):
    """Train one model into an isolated artifact root."""
    root = tmp_path_factory.mktemp("fraud_models")
    train(
        TrainingConfig(synthetic=SMALL, xgb=XGBParams(n_estimators=60)),
        run_hyperparameter_search=False,
        output_root=root,
        promote=True,
    )
    return root


@pytest.fixture(scope="module")
def detector(artifact_root):
    return FraudDetector.from_registry(root=artifact_root)


def _valid_features(**overrides) -> dict:
    features = {
        "amount_zscore": 1.2,
        "amount_vs_average": 1.4,
        "recipient_seen_before": 1,
        "recipient_frequency": 0.3,
        "new_device": 0,
        "device_account_count": 0,
        "transactions_last_10m": 0,
        "transactions_last_1h": 1,
        "time_of_day_deviation": 0.2,
        "seconds_since_last_transaction": 7200.0,
        "location_deviation": 0,
        "user_transaction_count": 20,
        "profile_is_cold": 0,
    }
    features.update(overrides)
    return features


# ===================== ARTIFACT & REGISTRY ==================================


def test_training_writes_a_complete_artifact(artifact_root):
    registry = ModelRegistry(root=artifact_root)
    version = registry.current_version()
    assert version

    path = registry.version_path(version)
    for filename in ("model.json", "metadata.json", "feature_manifest.json"):
        assert (path / filename).exists(), f"missing {filename}"


def test_artifact_metadata_records_full_provenance(artifact_root):
    registry = ModelRegistry(root=artifact_root)
    metadata = registry.load().metadata

    assert metadata.model_name == "s40_transaction_fraud"
    assert metadata.model_version
    assert metadata.trained_at
    assert metadata.seed == 40
    assert metadata.datasets == ["s40_synthetic"]
    assert metadata.feature_names == list(MODEL_FEATURE_NAMES)
    assert metadata.hyperparameters
    assert metadata.split_report["split_strategy"] == "chronological"
    assert metadata.metrics["test"]["pr_auc"] is not None
    assert metadata.python_version and metadata.xgboost_version


def test_artifact_states_synthetic_only_caveat(artifact_root):
    """Every artifact must carry the honest limitation with it."""
    metadata = ModelRegistry(root=artifact_root).load().metadata
    caveats = metadata.caveats.upper()
    assert "PROTOTYPE" in caveats
    assert "NOT A PRODUCTION" in caveats
    assert "SYNTHETIC" in caveats


def test_registry_promotes_and_tracks_previous(artifact_root):
    registry = ModelRegistry(root=artifact_root)
    original = registry.current_version()

    import shutil

    second = new_version("vtest-")
    shutil.copytree(registry.version_path(original), registry.version_path(second))

    registry.promote(second)
    assert registry.current_version() == second
    assert registry.previous_version() == original

    registry.promote(original)  # restore for other tests
    assert registry.current_version() == original


def test_registry_refuses_to_promote_a_missing_artifact(artifact_root):
    with pytest.raises(FileNotFoundError, match="Cannot promote"):
        ModelRegistry(root=artifact_root).promote("v-does-not-exist")


def test_registry_reports_missing_stage_with_guidance(tmp_path):
    with pytest.raises(FileNotFoundError, match="train_fraud"):
        ModelRegistry(root=tmp_path).load(ModelStage.CURRENT)


def test_registry_state_defaults_when_no_registry_file(tmp_path):
    state = ModelRegistry(root=tmp_path).state()
    assert state == {"current": None, "previous": None, "experimental": []}


def test_registry_register_experimental_does_not_touch_current(artifact_root):
    registry = ModelRegistry(root=artifact_root)
    before = registry.current_version()
    registry.register_experimental("v-experimental-only")
    assert registry.current_version() == before
    assert "v-experimental-only" in registry.experimental_versions()


def test_artifact_without_metadata_is_refused(tmp_path):
    (tmp_path / "model.json").write_text("{}", encoding="utf-8")
    with pytest.raises(FileNotFoundError, match="provenance"):
        load_artifact(tmp_path)


def test_artifact_without_model_file_is_refused(tmp_path):
    with pytest.raises(FileNotFoundError, match="model.json"):
        load_artifact(tmp_path)


def test_feature_manifest_is_stored_beside_the_model(artifact_root):
    registry = ModelRegistry(root=artifact_root)
    path = registry.version_path(registry.current_version())
    payload = json.loads((path / "feature_manifest.json").read_text(encoding="utf-8"))
    assert payload["feature_count"] == len(BASELINE_FEATURES)


def test_new_version_is_lexicographically_sortable():
    a = new_version()
    assert a.startswith("v")
    assert len(a) == len("v20260101-000000")


# ===================== INFERENCE CONTRACT ====================================


def test_prediction_returns_a_probability(detector):
    prediction = detector.predict(_valid_features())
    assert 0.0 <= prediction.fraud_probability <= 1.0
    assert 0.0 <= prediction.raw_probability <= 1.0


def test_probability_is_never_exactly_zero_or_one(detector):
    """Certainty is not something a fraud model can honestly claim."""
    extreme = _valid_features(
        amount_zscore=50.0,
        amount_vs_average=80.0,
        recipient_seen_before=0,
        recipient_frequency=0.0,
        new_device=1,
        time_of_day_deviation=1.0,
        location_deviation=1,
    )
    prediction = detector.predict(extreme)
    assert 0.0 < prediction.fraud_probability < 1.0


def test_prediction_schema_is_stable(detector):
    payload = detector.predict(_valid_features()).to_dict()
    expected = {
        "model_name",
        "model_version",
        "fraud_probability",
        "raw_probability",
        "calibrated",
        "top_factors",
        "feature_availability",
        "cold_start",
        "inference_ms",
        "warnings",
    }
    assert expected <= set(payload)


def test_prediction_does_not_emit_a_risk_score_or_decision(detector):
    """Spec §12: a detector must not decide. Fusion owns that."""
    payload = detector.predict(_valid_features()).to_dict()
    for forbidden in ("risk_score", "risk_level", "decision", "final_score"):
        assert forbidden not in payload


def test_prediction_reports_the_model_version(detector, artifact_root):
    prediction = detector.predict(_valid_features())
    assert prediction.model_version == ModelRegistry(root=artifact_root).current_version()


def test_feature_order_is_taken_from_the_manifest_not_the_input(detector):
    """A shuffled input dict must produce an identical prediction."""
    features = _valid_features()
    shuffled = dict(reversed(list(features.items())))
    assert detector.predict(features).fraud_probability == pytest.approx(
        detector.predict(shuffled).fraud_probability
    )


def test_missing_required_feature_is_rejected(detector):
    features = _valid_features()
    del features["new_device"]
    with pytest.raises(InputValidationError) as excinfo:
        detector.predict(features)
    assert any(issue.problem == "missing" for issue in excinfo.value.issues)


def test_invalid_type_is_rejected(detector):
    with pytest.raises(InputValidationError) as excinfo:
        detector.predict(_valid_features(amount_zscore="very high"))
    assert any(issue.problem == "invalid_type" for issue in excinfo.value.issues)


def test_impossible_value_is_rejected(detector):
    with pytest.raises(InputValidationError) as excinfo:
        detector.predict(_valid_features(recipient_frequency=1.7))
    assert any(issue.problem == "out_of_range" for issue in excinfo.value.issues)


def test_infinite_value_is_rejected(detector):
    with pytest.raises(InputValidationError) as excinfo:
        detector.predict(_valid_features(amount_vs_average=float("inf")))
    assert any(issue.problem == "not_finite" for issue in excinfo.value.issues)


def test_unusual_but_valid_input_is_accepted_not_rejected(detector):
    """Unusual transactions are the entire point — they must reach the model."""
    prediction = detector.predict(
        _valid_features(amount_vs_average=400.0, amount_zscore=60.0, new_device=1)
    )
    assert 0.0 < prediction.fraud_probability < 1.0


def test_cold_start_is_handled_and_flagged(detector):
    prediction = detector.predict(
        _valid_features(
            profile_is_cold=1,
            amount_zscore=None,
            amount_vs_average=None,
            time_of_day_deviation=None,
            user_transaction_count=1,
        )
    )
    assert prediction.cold_start is True
    assert prediction.feature_availability["amount_zscore"] is False
    assert any("caution" in w.lower() for w in prediction.warnings)
    assert 0.0 <= prediction.fraud_probability <= 1.0


def test_unrecognised_keys_are_ignored_with_a_warning(detector):
    prediction = detector.predict(_valid_features(unexpected_key=1.0))
    assert any("unrecognised" in w.lower() for w in prediction.warnings)


def test_batch_prediction_matches_single_prediction(detector):
    features = _valid_features()
    frame = pd.DataFrame([features])[list(MODEL_FEATURE_NAMES)]
    batch = detector.predict_batch(frame)
    single = detector.predict(features).fraud_probability
    assert float(batch[0]) == pytest.approx(single, abs=1e-9)


def test_inference_latency_is_recorded(detector):
    prediction = detector.predict(_valid_features())
    assert prediction.inference_ms > 0


def test_missing_model_fails_safely_without_a_fallback_score(tmp_path):
    with pytest.raises(FileNotFoundError, match="train_fraud"):
        FraudDetector.from_registry(root=tmp_path)


def test_detector_from_path_loads_directly(artifact_root):
    registry = ModelRegistry(root=artifact_root)
    path = registry.version_path(registry.current_version())
    detector = FraudDetector.from_path(path)
    prediction = detector.predict(_valid_features())
    assert 0.0 <= prediction.fraud_probability <= 1.0


# ===================== EXPLAINABILITY ========================================


def test_explanation_map_is_valid():
    assert validate_explanation_map() is None


def test_every_explainable_feature_has_a_controlled_explanation():
    for feature in BASELINE_FEATURES:
        if feature.explainable:
            assert explain_feature(feature.name) is not None


def test_non_explainable_features_have_no_controlled_explanation():
    """user_transaction_count / profile_is_cold drive the model but are
    never shown to a user; the map should not carry entries for them."""
    for feature in BASELINE_FEATURES:
        if not feature.explainable:
            assert feature.name not in EXPLANATION_MAP


def test_explanation_map_references_no_unknown_features():
    assert set(EXPLANATION_MAP) <= set(MODEL_FEATURE_NAMES)


def test_explanations_avoid_causal_language():
    """SHAP attributes model output; it does not establish causation."""
    for explanation in EXPLANATION_MAP.values():
        text = f"{explanation.user_template} {explanation.analyst_template}".lower()
        for banned in ("caused", "proves", "definitely", "is fraud"):
            assert banned not in text


def test_user_and_analyst_wording_are_distinct():
    for explanation in EXPLANATION_MAP.values():
        assert explanation.user_template != explanation.analyst_template
        assert explanation.label


def test_every_explanation_declares_a_risk_direction():
    for explanation in EXPLANATION_MAP.values():
        assert isinstance(explanation.direction, RiskDirection)


def test_format_value_handles_none_gracefully():
    explanation = EXPLANATION_MAP["amount_vs_average"]
    assert explanation.format_value(None) == "not available"


def test_direction_of_matches_explanation_map():
    assert direction_of("amount_vs_average") == "higher_is_riskier"
    assert direction_of("recipient_seen_before") == "higher_is_safer"
    assert direction_of("not_a_real_feature") == "unknown"


def test_shap_factors_are_produced(detector):
    prediction = detector.predict(
        _valid_features(amount_vs_average=15.0, amount_zscore=9.0, new_device=1)
    )
    assert prediction.top_factors
    for factor in prediction.top_factors:
        assert factor.feature in MODEL_FEATURE_NAMES
        assert factor.direction in {"risk_increasing", "risk_decreasing"}


def test_no_raw_feature_name_leaks_into_user_explanations(detector):
    """A null label or a bare technical name must never reach the UI."""
    prediction = detector.predict(
        _valid_features(amount_vs_average=15.0, amount_zscore=9.0, new_device=1)
    )
    for factor in prediction.top_factors:
        assert factor.label is not None
        assert factor.user_explanation is not None
        assert factor.feature not in factor.user_explanation


def test_non_explainable_features_never_surface_by_default(detector):
    """user_transaction_count/profile_is_cold can drive the model but must
    not appear in the default (explainable_only=True) factor list."""
    prediction = detector.predict(
        _valid_features(user_transaction_count=500, profile_is_cold=0)
    )
    factor_names = {f.feature for f in prediction.top_factors}
    assert "user_transaction_count" not in factor_names
    assert "profile_is_cold" not in factor_names


def test_explanations_are_deterministic(detector):
    features = _valid_features(amount_vs_average=12.0, new_device=1)
    first = [f.feature for f in detector.predict(features).top_factors]
    second = [f.feature for f in detector.predict(features).top_factors]
    assert first == second


def test_top_factors_are_ordered_by_contribution(detector):
    prediction = detector.predict(
        _valid_features(amount_vs_average=20.0, amount_zscore=10.0, new_device=1)
    )
    shares = [abs(f.shap_value) for f in prediction.top_factors]
    assert shares == sorted(shares, reverse=True)


def test_global_importance_covers_all_features(detector):
    explainer = ShapExplainer(
        detector.artifact.booster.get_booster(), MODEL_FEATURE_NAMES
    )
    frame = pd.DataFrame([_valid_features() for _ in range(5)])[list(MODEL_FEATURE_NAMES)]
    importance = explainer.global_importance(frame.astype("float64"))
    assert {row["feature"] for row in importance} == set(MODEL_FEATURE_NAMES)
    shares = [row["share"] for row in importance]
    assert sum(shares) == pytest.approx(1.0, abs=1e-6) or sum(shares) == pytest.approx(0.0)


def test_analyst_view_can_include_non_explainable_features(detector):
    """Analysts may legitimately see internal context features."""
    explainer = ShapExplainer(
        detector.artifact.booster.get_booster(), MODEL_FEATURE_NAMES
    )
    frame = pd.DataFrame([_valid_features(amount_vs_average=20.0)])[
        list(MODEL_FEATURE_NAMES)
    ].astype("float64")
    factors = explainer.explain_row(
        frame, 0, top_k=13, risk_increasing_only=False, explainable_only=False
    )
    assert len(factors) > 0
    assert len(factors) <= 13


# ===================== TRAINING <-> INFERENCE PARITY =========================
#
# Training/evaluation uses `predict_batch` (a DataFrame straight from the
# feature engine); serving uses `predict` (a dict assembled by a caller).
# Any difference in column ordering, dtype coercion or missing-value
# handling between the two paths would show up as a numeric gap here.


def test_batch_and_single_paths_agree_exactly(detector):
    rows = [
        _valid_features(),
        _valid_features(amount_vs_average=9.0, new_device=1),
        _valid_features(amount_zscore=None, amount_vs_average=None, profile_is_cold=1),
    ]
    frame = pd.DataFrame(rows)[list(MODEL_FEATURE_NAMES)]

    batch = detector.predict_batch(frame)
    singles = []
    for row in rows:
        clean = {k: (None if pd.isna(v) else v) for k, v in row.items()}
        singles.append(detector.predict(clean).fraud_probability)

    assert np.abs(batch - np.array(singles)).max() < 1e-9


def test_artifact_feature_names_match_the_current_manifest(artifact_root):
    """Catches a stale model being served after the manifest changed.

    If the feature manifest is edited without retraining, the stored model
    still expects the OLD columns. Serving would then silently feed the
    wrong values into the wrong slots.
    """
    metadata = ModelRegistry(root=artifact_root).load().metadata
    assert tuple(metadata.feature_names) == MODEL_FEATURE_NAMES, (
        "Artifact feature list differs from the current manifest — retrain "
        "before serving this model."
    )


def test_none_and_nan_are_treated_identically(detector):
    base = _valid_features()
    with_none = dict(base, amount_zscore=None)
    with_nan = dict(base, amount_zscore=float("nan"))
    assert detector.predict(with_none).fraud_probability == pytest.approx(
        detector.predict(with_nan).fraud_probability, abs=1e-12
    )


def test_pandas_na_is_rejected_rather_than_silently_coerced(detector):
    """`pd.NA` is neither None nor float, so it must not slip through."""
    with pytest.raises(InputValidationError) as excinfo:
        detector.predict(_valid_features(amount_zscore=pd.NA))
    assert any(issue.problem == "invalid_type" for issue in excinfo.value.issues)
