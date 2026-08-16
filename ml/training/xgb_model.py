"""
XGBoost fraud model training.

Deliberate choices:
  - **Native NaN handling.** No imputation. XGBoost learns a default split
    direction per feature, which preserves the meaning of "this user's
    baseline is not measurable yet" instead of overwriting it with a
    median that reads as "perfectly ordinary".
  - **scale_pos_weight over resampling.** Spec §46 and the Phase 4 brief
    both require establishing the simpler reweighting baseline before
    reaching for SMOTE. Reweighting also leaves the training distribution
    untouched, so validation/test remain directly comparable.
  - **Early stopping on validation.** Never on test (Critical Rule #5).
  - **Fixed seed + single thread option** for reproducibility.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import xgboost as xgb

from ml.training.config import TrainingConfig, XGBParams


@dataclass(frozen=True)
class TrainedXGB:
    booster: xgb.XGBClassifier
    feature_names: tuple[str, ...]
    best_iteration: int | None
    scale_pos_weight: float | None
    params: dict

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self.booster.predict_proba(X[list(self.feature_names)])[:, 1]

    def feature_importance(self) -> list[dict]:
        """Gain-based importance.

        Gain rather than weight/frequency: how much each feature actually
        improved the splits it was used in, which is closer to "usefulness"
        than raw split count.
        """
        booster = self.booster.get_booster()
        gains = booster.get_score(importance_type="gain")
        rows = [
            {"feature": name, "gain": float(gains.get(name, 0.0))}
            for name in self.feature_names
        ]
        total = sum(r["gain"] for r in rows) or 1.0
        for row in rows:
            row["gain_share"] = row["gain"] / total
        return sorted(rows, key=lambda r: r["gain"], reverse=True)


def compute_scale_pos_weight(y: pd.Series) -> float:
    positives = int((y == 1).sum())
    negatives = int(len(y) - positives)
    if positives == 0:
        raise ValueError("Cannot train: the training split contains no positives.")
    return negatives / positives


def train_xgb(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_validation: pd.DataFrame,
    y_validation: pd.Series,
    *,
    config: TrainingConfig | None = None,
    params: XGBParams | None = None,
) -> TrainedXGB:
    config = config or TrainingConfig()
    params = params or config.xgb

    feature_names = tuple(X_train.columns)
    spw = compute_scale_pos_weight(y_train) if config.use_scale_pos_weight else None

    classifier = xgb.XGBClassifier(
        objective="binary:logistic",
        eval_metric=config.eval_metric,
        early_stopping_rounds=config.early_stopping_rounds,
        random_state=config.seed,
        n_jobs=1,  # deterministic across runs
        tree_method="hist",
        scale_pos_weight=spw,
        **params.to_dict(),
    )

    # Early stopping watches VALIDATION only. The test set is never passed
    # to fit() anywhere in this codebase.
    classifier.fit(
        X_train[list(feature_names)],
        y_train,
        eval_set=[(X_validation[list(feature_names)], y_validation)],
        verbose=False,
    )

    return TrainedXGB(
        booster=classifier,
        feature_names=feature_names,
        best_iteration=getattr(classifier, "best_iteration", None),
        scale_pos_weight=spw,
        params=params.to_dict(),
    )
