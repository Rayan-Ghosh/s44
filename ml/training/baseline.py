"""
Logistic-regression baseline.

Purpose is NOT to beat XGBoost. It provides:
  - a sanity check that the features carry signal at all
  - an interpretable reference (signed coefficients)
  - evidence about whether XGBoost's extra complexity actually earns its
    place, which matters because S40 prefers the more explainable model
    when performance is close

Preprocessing (median imputation + standardisation) is fitted on TRAIN
ONLY inside an sklearn Pipeline. That is Critical Rule #3 made structural:
`pipeline.fit(X_train)` cannot see validation or test, and the same fitted
statistics are reused when transforming them.

Logistic regression cannot accept NaN, so missing values must be imputed
here — unlike XGBoost, which handles them natively. A missing-indicator
column is added alongside so the model can still distinguish "cold
profile" from "typical value", rather than having that fact erased.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ml.training.config import DEFAULT_SEED


@dataclass(frozen=True)
class BaselineModel:
    pipeline: Pipeline
    feature_names: tuple[str, ...]

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self.pipeline.predict_proba(X[list(self.feature_names)])[:, 1]

    def coefficients(self) -> list[dict]:
        """Signed coefficients, largest magnitude first.

        Interpretable on the standardised scale: a positive coefficient
        means a higher value pushes the prediction toward fraud.
        """
        classifier: LogisticRegression = self.pipeline.named_steps["classifier"]
        transformer: ColumnTransformer = self.pipeline.named_steps["preprocess"]
        names = list(transformer.get_feature_names_out())
        coefs = classifier.coef_[0]
        rows = [
            {"feature": name, "coefficient": float(value)}
            for name, value in zip(names, coefs)
        ]
        return sorted(rows, key=lambda r: abs(r["coefficient"]), reverse=True)


def train_baseline(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    *,
    seed: int = DEFAULT_SEED,
) -> BaselineModel:
    feature_names = tuple(X_train.columns)

    preprocess = ColumnTransformer(
        transformers=[
            (
                "numeric",
                Pipeline(
                    steps=[
                        # add_indicator preserves the fact that a value was
                        # missing, which for cold profiles is real signal.
                        ("impute", SimpleImputer(strategy="median", add_indicator=True)),
                        ("scale", StandardScaler()),
                    ]
                ),
                list(feature_names),
            )
        ],
        remainder="drop",
    )

    pipeline = Pipeline(
        steps=[
            ("preprocess", preprocess),
            (
                "classifier",
                LogisticRegression(
                    max_iter=2000,
                    # Mirrors XGBoost's scale_pos_weight approach: reweight
                    # rather than resample, per spec §46.
                    class_weight="balanced",
                    random_state=seed,
                ),
            ),
        ]
    )

    # Fitted on train only. Validation/test are transformed with these
    # same statistics later, never re-fitted.
    pipeline.fit(X_train, y_train)
    return BaselineModel(pipeline=pipeline, feature_names=feature_names)
