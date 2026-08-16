"""
SHAP explanations for the fraud model.

Uses TreeExplainer, which computes exact Shapley values for tree ensembles
rather than sampling — so explanations are deterministic for a given model
and input. That matters for S40: a user who reloads a warning must not see
the reasons change.

WHAT A SHAP VALUE IS HERE
    The contribution of one feature to THIS prediction's log-odds, relative
    to the model's base value. Positive pushes toward fraud, negative away.

WHAT IT IS NOT
    Evidence of causation. See ml/explainability/explanations.py — the
    user-facing wording is constrained accordingly.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import shap

from ml.explainability.explanations import RiskDirection, explain_feature


@dataclass(frozen=True)
class FactorContribution:
    """One feature's contribution to one prediction."""

    feature: str
    value: float | None
    shap_value: float
    #: Share of total absolute contribution, for display ordering.
    contribution_share: float
    direction: str
    label: str | None
    user_explanation: str | None
    analyst_explanation: str | None

    def to_dict(self) -> dict:
        return {
            "feature": self.feature,
            "value": self.value,
            "shap_value": self.shap_value,
            "contribution_share": self.contribution_share,
            "direction": self.direction,
            "label": self.label,
            "user_explanation": self.user_explanation,
            "analyst_explanation": self.analyst_explanation,
        }


class ShapExplainer:
    """Wraps a TreeExplainer plus the controlled explanation vocabulary."""

    def __init__(self, booster, feature_names: tuple[str, ...]) -> None:
        self.feature_names = tuple(feature_names)
        self._explainer = shap.TreeExplainer(booster)

    def shap_values(self, X: pd.DataFrame) -> np.ndarray:
        values = self._explainer.shap_values(X[list(self.feature_names)])
        # Binary XGBoost returns a single array; guard against the
        # list-of-two-classes shape some versions produce.
        if isinstance(values, list):
            values = values[1]
        return np.asarray(values)

    def explain_row(
        self,
        X: pd.DataFrame,
        row_index: int = 0,
        *,
        top_k: int = 4,
        risk_increasing_only: bool = True,
        explainable_only: bool = True,
    ) -> list[FactorContribution]:
        """Top contributing factors for a single prediction.

        `risk_increasing_only` defaults True because the user-facing
        question is "why was this flagged?" — listing reasons the model
        considered it safe would be confusing in a warning dialog. The
        institution dashboard can pass False for the full picture.

        `explainable_only` defaults True so that a feature with no entry in
        the controlled vocabulary can never surface with a null label and
        null explanation. Internal context features such as
        `user_transaction_count` legitimately drive the model but are not
        something to show a worried user; analysts can pass False.
        """
        values = self.shap_values(X)
        row = values[row_index]
        total = float(np.abs(row).sum()) or 1.0

        factors: list[FactorContribution] = []
        for position, feature in enumerate(self.feature_names):
            shap_value = float(row[position])
            if risk_increasing_only and shap_value <= 0:
                continue
            if explainable_only and explain_feature(feature) is None:
                continue

            raw = X.iloc[row_index][feature]
            value = None if pd.isna(raw) else float(raw)
            explanation = explain_feature(feature)

            # A feature with no controlled explanation is still reported
            # with its technical name for analysts, but carries no
            # user-facing text — never a fabricated one.
            user_text = None
            analyst_text = None
            if explanation is not None:
                rendered = explanation.format_value(value)
                user_text = explanation.user_template.replace("{value}", rendered)
                analyst_text = explanation.analyst_template.replace("{value}", rendered)

            factors.append(
                FactorContribution(
                    feature=feature,
                    value=value,
                    shap_value=shap_value,
                    contribution_share=abs(shap_value) / total,
                    direction=(
                        "risk_increasing" if shap_value > 0 else "risk_decreasing"
                    ),
                    label=explanation.label if explanation else None,
                    user_explanation=user_text,
                    analyst_explanation=analyst_text,
                )
            )

        # Deterministic ordering: magnitude, then feature name to break ties.
        factors.sort(key=lambda f: (-abs(f.shap_value), f.feature))
        return factors[:top_k]

    def global_importance(self, X: pd.DataFrame) -> list[dict]:
        """Mean absolute SHAP per feature — model-wide importance."""
        values = np.abs(self.shap_values(X)).mean(axis=0)
        total = float(values.sum()) or 1.0
        rows = [
            {
                "feature": name,
                "mean_abs_shap": float(values[i]),
                "share": float(values[i] / total),
            }
            for i, name in enumerate(self.feature_names)
        ]
        return sorted(rows, key=lambda r: r["mean_abs_shap"], reverse=True)


def direction_of(feature: str) -> str:
    explanation = explain_feature(feature)
    if explanation is None:
        return "unknown"
    return (
        "higher_is_riskier"
        if explanation.direction is RiskDirection.HIGHER_IS_RISKIER
        else "higher_is_safer"
    )
