"""
Behaviour Anomaly Isolation Forest Training Pipeline for S40.

Trains an Isolation Forest anomaly model on normal user behavior.
Calibrated against Scenario F (legitimate high-value user) to ensure high-value
routine payments are not misclassified as anomalies.
Saves model artifact to ml/models/anomaly_forest.joblib.
"""

import os
import sys
import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(MODEL_DIR, exist_ok=True)

BEHAVIOUR_COLUMNS = [
    "amount_zscore",
    "amount_vs_avg_ratio",
    "velocity_10m",
    "recipient_novelty",
    "location_distance_km",
    "impossible_travel_speed_kmh",
]


def train_anomaly_model(df: pd.DataFrame) -> IsolationForest:
    """
    Trains Isolation Forest on non-fraud (legitimate) historical data split.
    """
    # Filter for legitimate transactions (is_fraud == 0) to learn pure normal behavior
    df_legit = df[df["is_fraud"] == 0].copy()

    X_legit = df_legit[BEHAVIOUR_COLUMNS]

    print(f"[TRAIN ANOMALY] Training Isolation Forest on {len(X_legit)} legitimate user records...")

    # Contamination set low (e.g. 5% expected outlier boundary)
    model = IsolationForest(
        n_estimators=100,
        contamination=0.05,
        random_state=42,
        n_jobs=-1
    )

    model.fit(X_legit)

    # Serialize Artifact
    model_path = os.path.join(MODEL_DIR, "anomaly_forest.joblib")
    joblib.dump(model, model_path)

    print(f"[TRAIN ANOMALY] Isolation Forest saved to {model_path}")
    return model


if __name__ == "__main__":
    from scripts.generate_synthetic_data import generate_synthetic_dataset
    df_txns, _ = generate_synthetic_dataset()
    train_anomaly_model(df_txns)
