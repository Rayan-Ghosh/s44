"""
Behaviour Anomaly Isolation Forest Training Pipeline for S40.

Trains an Isolation Forest anomaly model on normal user behavior.
Calibrated against Scenario F (legitimate high-value user) to ensure high-value
routine payments are not misclassified as anomalies.
Saves model artifact to ml/models/anomaly_forest.joblib.
"""

import os
import sys
import json
from pathlib import Path
from typing import Optional

import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from ml.registry.artifact import (
    ARTIFACT_ROOT,
    build_metadata,
    new_version,
)
from ml.registry.model_registry import ModelRegistry
from ml.training.anomaly_model import (
    BEHAVIOUR_FEATURES,
    evaluate_separation,
    train_anomaly_model as train_anomaly_model_core,
)
from ml.training.config import TrainingConfig
from ml.training.dataset import build_training_data

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(MODEL_DIR, exist_ok=True)

ANOMALY_ROOT = ARTIFACT_ROOT / "anomaly"

BEHAVIOUR_COLUMNS = [
    "amount_zscore",
    "amount_vs_avg_ratio",
    "velocity_10m",
    "recipient_novelty",
    "location_distance_km",
    "impossible_travel_speed_kmh",
]


def train(
    config: Optional[TrainingConfig] = None,
    *,
    output_root: Optional[Path] = None,
    promote: bool = True,
) -> Path:
    """Train behaviour anomaly isolation forest and register artifact."""
    config = config or TrainingConfig()
    root = Path(output_root) if output_root else ANOMALY_ROOT
    data = build_training_data(config)
    trained = train_anomaly_model_core(data.train.frame, seed=config.seed)

    metrics = evaluate_separation(trained, data.validation.frame)
    version = new_version()
    metadata = build_metadata(
        model_name="s40_behaviour_anomaly",
        model_version=version,
        seed=config.seed,
        datasets=[config.dataset],
        dataset_notes="Normal user historical spending profiles",
        split_report=data.split_report,
        training_config=config.to_dict(),
        hyperparameters={"contamination": "auto", "seed": config.seed},
        scale_pos_weight=None,
        best_iteration=None,
        feature_manifest_version="1.0.0",
        feature_names=list(BEHAVIOUR_FEATURES),
        metrics={"validation": metrics},
        hyperparameter_search={},
        calibration={},
        selected_threshold=0.5,
        caveats="Unsupervised model trained on non-fraud rows only.",
    )

    path = root / version
    path.mkdir(parents=True, exist_ok=True)

    joblib.dump({"forest": trained.forest, "normalizer": trained.normalizer}, path / "model.joblib")
    (path / "metadata.json").write_text(
        json.dumps(metadata.to_dict(), indent=2, default=str), encoding="utf-8"
    )

    if promote:
        ModelRegistry(root=root).promote(version)

    return path



def train_anomaly_model(df: pd.DataFrame) -> IsolationForest:
    """
    Trains Isolation Forest on non-fraud (legitimate) historical data split.
    """
    df_legit = df[df["is_fraud"] == 0].copy()
    X_legit = df_legit[BEHAVIOUR_COLUMNS]

    print(f"[TRAIN ANOMALY] Training Isolation Forest on {len(X_legit)} legitimate user records...")

    model = IsolationForest(
        n_estimators=100,
        contamination=0.05,
        random_state=42,
        n_jobs=-1,
    )

    model.fit(X_legit)

    model_path = os.path.join(MODEL_DIR, "anomaly_forest.joblib")
    joblib.dump(model, model_path)

    print(f"[TRAIN ANOMALY] Isolation Forest saved to {model_path}")
    return model


if __name__ == "__main__":
    from scripts.generate_synthetic_data import generate_synthetic_dataset

    df_txns, _ = generate_synthetic_dataset()
    train_anomaly_model(df_txns)

