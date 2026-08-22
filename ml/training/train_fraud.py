"""
Transaction Fraud Classifier Training Pipeline for S40.

Strict Engineering & Data Science Rules:
1. Chronological splitting (70% Train, 15% Validation, 15% Test).
2. Damped scale_pos_weight = sqrt(N_neg / N_pos) to avoid pushing probabilities to 0/1 extremes.
3. Isotonic Probability Calibration using CalibratedClassifierCV on validation split.
4. Fit scaler solely on training split; transform validation/test without refitting.
5. Saves serialized artifacts to ml/models/fraud_xgb.json, ml/models/calibrated_fraud.joblib, and ml/models/scaler.joblib.
"""

import os
import sys
import math
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Tuple, Any, Optional
from xgboost import XGBClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from ml.registry.artifact import (
    ARTIFACT_ROOT,
    ModelArtifact,
    build_metadata,
    new_version,
    save_artifact,
)
from ml.registry.model_registry import ModelRegistry
from ml.training.baseline import train_baseline
from ml.training.calibration import assess_calibration
from ml.training.config import TrainingConfig, XGBParams
from ml.training.dataset import build_training_data
from ml.training.evaluate import evaluate
from ml.training.feature_manifest import MODEL_FEATURE_NAMES, manifest
from ml.training.search import params_from_trial, run_search
from ml.training.xgb_model import train_xgb

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(MODEL_DIR, exist_ok=True)

FRAUD_ROOT = ARTIFACT_ROOT

FEATURE_COLUMNS = [
    "amount",
    "amount_zscore",
    "amount_vs_avg_ratio",
    "amount_vs_max_ratio",
    "velocity_10m",
    "velocity_1h",
    "velocity_24h",
    "velocity_ratio_10m_24h",
    "rapid_successive_transfer",
    "time_sin",
    "time_cos",
    "recipient_novelty",
    "recipient_frequency",
    "new_device",
    "device_age_days",
    "ip_novelty",
    "location_distance_km",
    "impossible_travel_speed_kmh",
    "os_change",
    "browser_change",
    "device_account_count",
    "voice_risk_score",
]


def train(
    config: Optional[TrainingConfig] = None,
    *,
    run_hyperparameter_search: bool = True,
    output_root: Optional[Path] = None,
    promote: bool = True,
) -> ModelArtifact:
    """Train canonical XGBoost transaction fraud model, calibrate, and save artifact."""
    config = config or TrainingConfig()
    root = Path(output_root) if output_root else FRAUD_ROOT
    data = build_training_data(config)

    if run_hyperparameter_search:
        search_result = run_search(
            data.train.X,
            data.train.y,
            data.validation.X,
            data.validation.y,
            config=config,
        )
        xgb_params = params_from_trial(search_result.best)
        search_summary = search_result.to_dict()
    else:
        xgb_params = config.xgb
        search_summary = {}

    trained = train_xgb(
        data.train.X,
        data.train.y,
        data.validation.X,
        data.validation.y,
        config=TrainingConfig(
            dataset=config.dataset,
            synthetic=config.synthetic,
            xgb=xgb_params,
            seed=config.seed,
        ),
    )

    raw_val_probs = trained.predict_proba(data.validation.X)
    calibrator, cal_report = assess_calibration(data.validation.y, raw_val_probs)

    baseline = train_baseline(data.train.X, data.train.y)
    baseline_eval = evaluate(
        data.validation.y,
        baseline.predict_proba(data.validation.X),
        split="validation",
    ).to_dict()

    val_probs = calibrator.predict(raw_val_probs) if calibrator else raw_val_probs
    val_eval = evaluate(
        data.validation.y,
        val_probs,
        split="validation",
    ).to_dict()

    test_raw = trained.predict_proba(data.test.X)
    test_probs = calibrator.predict(test_raw) if calibrator else test_raw
    test_eval = evaluate(
        data.test.y,
        test_probs,
        split="test",
    ).to_dict()

    version = new_version()
    metadata = build_metadata(
        model_name="s40_transaction_fraud",
        model_version=version,
        seed=config.seed,
        datasets=[config.dataset],
        dataset_notes="Synthetic scenario dataset for S40 fraud shield",
        split_report=data.split_report,
        training_config=config.to_dict(),
        hyperparameters=xgb_params.to_dict(),
        scale_pos_weight=trained.scale_pos_weight,
        best_iteration=trained.best_iteration,
        feature_manifest_version=manifest()["manifest_version"],
        feature_names=list(MODEL_FEATURE_NAMES),
        metrics={
            "validation": val_eval,
            "test": test_eval,
            "baseline": baseline_eval,
        },
        hyperparameter_search=search_summary,
        calibration=cal_report.to_dict(),
        selected_threshold=0.40,
        caveats="Prototype model trained on synthetic data only. Not a production classifier; true performance may differ.",
    )



    artifact_path = save_artifact(
        trained.booster,
        calibrator,
        metadata,
        manifest(),
        root=root,
    )
    if promote:
        registry = ModelRegistry(root=root)
        registry.promote(version)


    return ModelArtifact(
        booster=trained.booster,
        calibrator=calibrator,
        metadata=metadata,
        path=artifact_path,
    )




def train_fraud_model(df: pd.DataFrame) -> Tuple[Any, StandardScaler]:
    """
    Trains XGBoost classifier with damped scale_pos_weight and isotonic probability calibration.
    """
    # 1. Ensure Chronological Sorting
    df_sorted = df.sort_values(by="timestamp").reset_index(drop=True)

    # Ensure missing feature columns fall back gracefully
    for col in FEATURE_COLUMNS:
        if col not in df_sorted.columns:
            df_sorted[col] = 0.0

    X = df_sorted[FEATURE_COLUMNS]
    y = df_sorted["is_fraud"].values

    n_total = len(df_sorted)
    n_train = int(n_total * 0.70)
    n_val = int(n_total * 0.15)

    X_train, y_train = X.iloc[:n_train], y[:n_train]
    X_val, y_val = X.iloc[n_train:n_train + n_val], y[n_train:n_train + n_val]
    X_test, y_test = X.iloc[n_train + n_val:], y[n_train + n_val:]

    # 2. Strict Scaler Fitting on Train Split Only
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)
    X_test_scaled = scaler.transform(X_test)

    # 3. Damped scale_pos_weight: sqrt(N_neg / N_pos)
    num_neg = np.sum(y_train == 0)
    num_pos = np.sum(y_train == 1)
    raw_ratio = float(num_neg) / max(num_pos, 1)
    damped_scale_pos_weight = max(1.0, math.sqrt(raw_ratio))

    print(f"[TRAIN FRAUD] Training split size: {len(X_train)} (Fraud: {num_pos}, Legitimate: {num_neg})")
    print(f"[TRAIN FRAUD] Raw Imbalance Ratio: {raw_ratio:.2f} -> Damped scale_pos_weight: {damped_scale_pos_weight:.2f}")

    # 4. Train & Calibrate Model with Isotonic Probability Calibration
    print(f"[TRAIN FRAUD] Training split size: {len(X_train)} (Fraud: {num_pos}, Legitimate: {num_neg})")
    print(f"[TRAIN FRAUD] Raw Imbalance Ratio: {raw_ratio:.2f} -> Damped scale_pos_weight: {damped_scale_pos_weight:.2f}")

    base_model = XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.05,
        scale_pos_weight=damped_scale_pos_weight,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        eval_metric="logloss"
    )

    print("[TRAIN FRAUD] Fitting Isotonic Calibrated Classifier (cv=3)...")
    try:
        calibrated_clf = CalibratedClassifierCV(estimator=base_model, method="isotonic", cv=3)
        calibrated_clf.fit(X_train_scaled, y_train)
    except Exception as e:
        print(f"[TRAIN FRAUD] Isotonic calibration warning ({e}), falling back to sigmoid calibration...")
        calibrated_clf = CalibratedClassifierCV(estimator=base_model, method="sigmoid", cv=3)
        calibrated_clf.fit(X_train_scaled, y_train)

    # Train standalone base XGBoost for SHAP tree explainer compatibility
    base_model.fit(X_train_scaled, y_train)

    # 5. Serialize Model & Scaler Artifacts

    base_model_path = os.path.join(MODEL_DIR, "fraud_xgb.json")
    calibrated_path = os.path.join(MODEL_DIR, "calibrated_fraud.joblib")
    scaler_path = os.path.join(MODEL_DIR, "scaler.joblib")

    base_model.save_model(base_model_path)
    joblib.dump(calibrated_clf, calibrated_path)
    joblib.dump(scaler, scaler_path)

    print(f"[TRAIN FRAUD] Base XGBoost model saved to {base_model_path}")
    print(f"[TRAIN FRAUD] Calibrated Classifier saved to {calibrated_path}")
    print(f"[TRAIN FRAUD] Scaler saved to {scaler_path}")

    return calibrated_clf, scaler


if __name__ == "__main__":
    import math
    from scripts.generate_synthetic_data import generate_synthetic_dataset
    df_txns, _ = generate_synthetic_dataset()
    train_fraud_model(df_txns)
