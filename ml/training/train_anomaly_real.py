"""
Real-data anomaly model training (2026-09-04 retraining pass).

Same reasoning and reuse pattern as ml/training/train_fraud_real.py:
recipient-centric features (ml/features/recipient_features.py), blended
real (PaySim + Indian Online Scam) + minority synthetic data
(ml/training/recipient_dataset.py), and a NEW registered artifact
(`s40_behaviour_anomaly_real`) that does not touch or replace the
original per-user `s40_behaviour_anomaly` model.

Reuses ml/training/anomaly_model.py's IsolationForest + ScoreNormalizer
machinery directly (those classes are generic) rather than duplicating
them — only the feature-name constant differs.
"""

from __future__ import annotations

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import average_precision_score, roc_auc_score

from ml.registry.artifact import ARTIFACT_ROOT as FRAUD_ARTIFACT_ROOT, build_metadata, new_version
from ml.registry.model_registry import ModelRegistry
from ml.training.anomaly_model import ScoreNormalizer, TrainedAnomalyModel
from ml.training.recipient_dataset import BlendConfig, build_blended_training_data
from ml.features.recipient_features import RECIPIENT_MODEL_FEATURE_NAMES

REAL_MODEL_NAME = "s40_behaviour_anomaly_real"
REAL_ARTIFACT_ROOT = FRAUD_ARTIFACT_ROOT.parent / "anomaly_real"

#: REVISED 2026-09-04: the first version of this list included the three
#: timestamp-dependent features (recipient_transactions_last_10m/1h,
#: recipient_time_of_day_deviation). PaySim has no wall-clock TIMESTAMP
#: (only the `step` ordinal, mapped to TIME_INDEX — see
#: ml/data/adapters/paysim_adapter.py), so those three are unconditionally
#: null for every PaySim row, and IsolationForest cannot accept NaN — the
#: "all features present" scorable_mask excluded PaySim from training AND
#: evaluation entirely (0 of 4,042 test rows scorable), and left the
#: reported test ROC-AUC 96%+ driven by synthetic data (2,218 of 2,295
#: scorable test rows). Dropped here so the model — and its evaluation —
#: actually reflect PaySim/Indian real data, not just synthetic. Also
#: excludes new_recipient/recipient_prior_count, matching the reasoning
#: ml/training/anomaly_model.py already applies to profile_is_cold/
#: user_transaction_count: those describe HOW MUCH history exists, not how
#: the transaction itself behaves — cold start is handled by refusing to
#: score (scorable_mask), not by feeding the model a history-volume flag.
ANOMALY_FEATURES: tuple[str, ...] = (
    "amount_log",
    "recipient_amount_zscore",
    "recipient_amount_vs_average",
)


def _scorable_mask(frame: pd.DataFrame) -> pd.Series:
    return frame[list(ANOMALY_FEATURES)].notna().all(axis=1)


def _select(frame: pd.DataFrame) -> pd.DataFrame:
    return frame.loc[:, list(ANOMALY_FEATURES)].astype("float64")


def train(config: BlendConfig | None = None, *, promote: bool = True) -> dict:
    config = config or BlendConfig()
    data = build_blended_training_data(config)

    scorable = _scorable_mask(data.train)
    normal = data.train["is_fraud"].astype("float64") != 1
    fit_rows = data.train[scorable & normal]
    if len(fit_rows) < 50:
        raise ValueError(f"Only {len(fit_rows)} scorable normal rows — too few to fit.")

    X = _select(fit_rows)
    forest = IsolationForest(n_estimators=300, max_samples="auto", contamination="auto", random_state=config.seed, n_jobs=1)
    forest.fit(X)

    raw = -forest.score_samples(X)
    normalizer = ScoreNormalizer(low=float(np.percentile(raw, 5)), high=float(np.percentile(raw, 99.5)))
    model = TrainedAnomalyModel(
        forest=forest,
        normalizer=normalizer,
        feature_names=ANOMALY_FEATURES,
        params={"n_estimators": 300, "max_samples": "auto", "contamination": "auto", "seed": config.seed},
        training_rows=int(len(fit_rows)),
    )

    def _evaluate(frame: pd.DataFrame, split_name: str) -> dict:
        mask = _scorable_mask(frame)
        subset = frame[mask]
        result = {
            "split": split_name,
            "rows": int(len(frame)),
            "scorable_rows": int(len(subset)),
            "unscorable_rows": int(len(frame) - len(subset)),
        }
        if subset.empty:
            return result
        scores = model.anomaly_score(_select(subset))
        result["mean_score"] = float(scores.mean())
        y = subset["is_fraud"].astype("float64").fillna(0).astype(int).to_numpy()
        result["positives_among_scorable"] = int(y.sum())
        if 0 < y.sum() < len(y):
            result["roc_auc"] = float(roc_auc_score(y, scores))
            result["pr_auc"] = float(average_precision_score(y, scores))
            result["mean_score_fraud"] = float(scores[y == 1].mean())
            result["mean_score_normal"] = float(scores[y == 0].mean())
        return result

    val_metrics = _evaluate(data.validation, "validation")
    test_metrics = _evaluate(data.test, "test")

    # Per-source breakdown on test, so a source-level shortcut (see the
    # fraud model's caveat about missingness-as-source-proxy) is visible
    # here too, not just narratively assumed absent.
    per_source = {}
    for source in data.test["source_dataset"].dropna().unique():
        per_source[str(source)] = _evaluate(
            data.test[data.test["source_dataset"] == source].reset_index(drop=True), f"test/{source}"
        )

    version = new_version()
    metadata = build_metadata(
        model_name=REAL_MODEL_NAME,
        model_version=version,
        seed=config.seed,
        datasets=["indian_online_scam", "paysim", "s40_synthetic"],
        dataset_notes=(
            "Real-data retraining pass (2026-09-04). Same blended dataset and "
            "recipient-centric feature framing as s40_transaction_fraud_real — "
            "see ml/training/train_fraud_real.py and "
            "ml/features/recipient_features.py."
        ),
        split_report=data.blend_report,
        training_config={"blend": config.__dict__, "forest": model.params},
        hyperparameters=model.params,
        scale_pos_weight=None,
        best_iteration=None,
        feature_manifest_version="recipient-anomaly-1.0.0",
        feature_names=list(ANOMALY_FEATURES),
        metrics={"validation": val_metrics, "test": test_metrics, "test_per_source": per_source},
        hyperparameter_search={"skipped": "unsupervised detector; no search performed"},
        calibration={},
        selected_threshold=-1.0,
        caveats=(
            "PROTOTYPE. Unsupervised — labels used only to exclude fraud rows "
            "before fitting and to check separation afterwards, never to fit "
            "the model. Same real+synthetic blend and recipient-centric "
            "framing caveats as s40_transaction_fraud_real."
        ),
    )

    path = REAL_ARTIFACT_ROOT / version
    path.mkdir(parents=True, exist_ok=True)
    joblib.dump({"forest": forest, "normalizer": normalizer}, path / "model.joblib")
    (path / "metadata.json").write_text(json.dumps(metadata.to_dict(), indent=2, default=str), encoding="utf-8")

    if promote:
        ModelRegistry(root=REAL_ARTIFACT_ROOT).promote(version)

    result = {"version": version, "path": str(path), "validation": val_metrics, "test": test_metrics, "test_per_source": per_source}
    print(json.dumps(result, indent=2, default=str))
    return result


if __name__ == "__main__":
    train()
