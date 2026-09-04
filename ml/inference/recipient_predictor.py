"""
Live inference for the real-data, recipient-centric models
(`s40_transaction_fraud_real`, `s40_behaviour_anomaly_real`).

Deliberately separate from ml/inference/predict.py's MLPredictor, which
serves S40's original per-user model and stays untouched — the two take
different feature contracts (9 recipient-keyed features here vs. 13
user-keyed features there) and mixing them into one class risks exactly
the "columns silently in the wrong order" failure
ml/training/feature_manifest.py warns about.

This module is stateless: it accepts already-computed feature values and
scores them. Building those values from live transaction history is the
backend's job (apps/api/app/services/recipient_profile_service.py) — ML
code should not own a database connection.
"""

from __future__ import annotations

from typing import Any, Optional

import joblib

from ml.features.recipient_features import RECIPIENT_MODEL_FEATURE_NAMES
from ml.registry.artifact import ARTIFACT_ROOT as FRAUD_ARTIFACT_ROOT
from ml.registry.model_registry import ModelRegistry
from ml.training.anomaly_model import ScoreNormalizer

FRAUD_REAL_ROOT = FRAUD_ARTIFACT_ROOT.parent / "fraud_real"
ANOMALY_REAL_ROOT = FRAUD_ARTIFACT_ROOT.parent / "anomaly_real"

#: Subset of the 9 fraud-model features the anomaly model actually uses
#: (see ml/training/train_anomaly_real.py's ANOMALY_FEATURES for why the
#: other 6 were dropped).
ANOMALY_FEATURE_NAMES = ("amount_log", "recipient_amount_zscore", "recipient_amount_vs_average")


class RecipientMLPredictor:
    """Singleton loader + scorer for the real-data recipient-centric models."""

    _instance: Optional["RecipientMLPredictor"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self) -> None:
        self.fraud_artifact = None
        self.anomaly_forest = None
        self.anomaly_normalizer: ScoreNormalizer | None = None

        try:
            self.fraud_artifact = ModelRegistry(root=FRAUD_REAL_ROOT).load()
        except FileNotFoundError:
            self.fraud_artifact = None

        try:
            registry = ModelRegistry(root=ANOMALY_REAL_ROOT)
            version = registry.current_version()
            if version:
                blob = joblib.load(registry.version_path(version) / "model.joblib")
                self.anomaly_forest = blob["forest"]
                self.anomaly_normalizer = blob["normalizer"]
        except FileNotFoundError:
            pass

    @property
    def available(self) -> bool:
        return self.fraud_artifact is not None

    def predict(self, features: dict[str, Any]) -> dict:
        """`features` must already carry the 9 names in
        RECIPIENT_MODEL_FEATURE_NAMES (missing ones may be None/NaN —
        native-NaN handling, same policy as the original model)."""
        import numpy as np
        import pandas as pd

        if self.fraud_artifact is None:
            raise RuntimeError(
                "s40_transaction_fraud_real is not trained/registered. Run:\n"
                "    python -m ml.training.train_fraud_real"
            )

        row = {name: features.get(name) for name in RECIPIENT_MODEL_FEATURE_NAMES}
        df = pd.DataFrame([row], columns=list(RECIPIENT_MODEL_FEATURE_NAMES)).astype("float64")

        raw_prob = float(self.fraud_artifact.booster.predict_proba(df)[:, 1][0])
        if self.fraud_artifact.calibrator is not None:
            calibrated = float(
                np.clip(self.fraud_artifact.calibrator.predict(np.array([raw_prob]))[0], 1e-4, 1.0 - 1e-4)
            )
        else:
            calibrated = raw_prob

        result: dict[str, Any] = {
            "fraud_probability": calibrated,
            "fraud_probability_raw": raw_prob,
            "model_version": self.fraud_artifact.metadata.model_version,
            "selected_threshold": self.fraud_artifact.metadata.selected_threshold,
        }

        if self.anomaly_forest is not None and self.anomaly_normalizer is not None:
            anomaly_row = pd.DataFrame(
                [{n: features.get(n) for n in ANOMALY_FEATURE_NAMES}], columns=list(ANOMALY_FEATURE_NAMES)
            ).astype("float64")
            scorable = anomaly_row.notna().all(axis=1).iloc[0]
            if scorable:
                raw_score = -self.anomaly_forest.score_samples(anomaly_row)
                result["anomaly_score"] = float(self.anomaly_normalizer.transform(raw_score)[0])
                result["anomaly_scorable"] = True
            else:
                result["anomaly_score"] = None
                result["anomaly_scorable"] = False

        return result


def get_recipient_predictor() -> RecipientMLPredictor:
    return RecipientMLPredictor()
