"""
Fraud model inference contract.

This is the boundary the rest of S40 integrates against. It deliberately
has NO FastAPI dependency: the backend will wrap it in a service layer
(Phase 6), and keeping web concerns out means the detector can be used
from a script, a notebook, a test, or a future batch job unchanged.

CONTRACT
    features (dict or DataFrame)  ->  FraudPrediction

    FraudPrediction carries the probability, the model version that
    produced it, the top contributing factors, and enough metadata for the
    future fusion engine to know exactly what it received — in particular
    whether the probability is calibrated.

WHAT THIS DELIBERATELY DOES NOT DO
    Produce an S40 risk score, a risk level, or a decision. Spec §12 is
    explicit that individual detectors must not decide outcomes; fusion
    owns that. Returning "0.87" here and "HIGH" nowhere is the point.
"""

from __future__ import annotations

import math
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from ml.explainability.shap_explainer import FactorContribution, ShapExplainer
from ml.registry.artifact import ModelArtifact, load_artifact
from ml.registry.model_registry import ModelRegistry, ModelStage
from ml.training.feature_manifest import BASELINE_FEATURES, MODEL_FEATURE_NAMES

#: Sanity bounds per feature. Values outside these are treated as INVALID
#: INPUT (a bug or corrupted payload), not as "suspicious transaction".
#:
#: Chosen wide on purpose. Fraud detection exists to flag unusual activity,
#: so an unusual-but-physically-possible value must reach the model. Only
#: genuinely impossible values are rejected — a negative count, a ratio
#: below zero, a probability-like share above one.
FEATURE_BOUNDS: dict[str, tuple[float | None, float | None]] = {
    "amount_zscore": (-1e4, 1e4),
    "amount_vs_average": (0.0, None),
    "recipient_seen_before": (0.0, 1.0),
    "recipient_frequency": (0.0, 1.0),
    "new_device": (0.0, 1.0),
    "device_account_count": (0.0, None),
    "transactions_last_10m": (0.0, None),
    "transactions_last_1h": (0.0, None),
    "time_of_day_deviation": (0.0, 1.0),
    "seconds_since_last_transaction": (0.0, None),
    "location_deviation": (0.0, 1.0),
    "user_transaction_count": (0.0, None),
    "profile_is_cold": (0.0, 1.0),
}

#: Probabilities are clamped away from exactly 0 and 1.
#:
#: Isotonic calibration saturates: it maps the extremes to precisely 0.0
#: and 1.0, which asserts certainty no fraud model can possess. That is
#: both dishonest to a user ("we are 100% sure") and awkward for the
#: future fusion engine, where a hard 0 or 1 can dominate a weighted
#: combination or break a log-odds transform.
PROBABILITY_FLOOR = 1e-6
PROBABILITY_CEILING = 1.0 - 1e-6

#: Features whose absence is normal and meaningful (cold start), rather
#: than a malformed payload. Derived from the manifest so the two cannot
#: drift apart.
NULLABLE_FEATURES: frozenset[str] = frozenset(
    f.name
    for f in BASELINE_FEATURES
    if f.missing_meaning and not f.missing_meaning.startswith("Not expected")
)


@dataclass(frozen=True)
class ValidationIssue:
    feature: str
    problem: str
    detail: str


class InputValidationError(ValueError):
    """Raised for structurally invalid input — never for merely unusual input."""

    def __init__(self, issues: list[ValidationIssue]) -> None:
        self.issues = issues
        summary = "; ".join(f"{i.feature}: {i.problem}" for i in issues)
        super().__init__(f"Invalid model input — {summary}")


@dataclass(frozen=True)
class FraudPrediction:
    """One detector's output. Not a risk score, not a decision."""

    model_name: str
    model_version: str
    #: The probability callers should use. Calibrated when available.
    fraud_probability: float
    #: The model's uncalibrated output, always present for audit.
    raw_probability: float
    calibrated: bool
    top_factors: list[FactorContribution]
    #: Which model features were genuinely supplied vs missing.
    feature_availability: dict[str, bool]
    #: True when the user's history is too thin for deviation features to
    #: be meaningful. Consumers should treat the probability with care.
    cold_start: bool
    inference_ms: float
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["top_factors"] = [f.to_dict() for f in self.top_factors]
        return payload


class FraudDetector:
    """Loads a versioned artifact and serves predictions."""

    MODEL_NAME = "s40_transaction_fraud"

    def __init__(self, artifact: ModelArtifact) -> None:
        self.artifact = artifact
        self.feature_names = artifact.feature_names or MODEL_FEATURE_NAMES
        self._explainer = ShapExplainer(
            artifact.booster.get_booster(), self.feature_names
        )

    # -- construction -----------------------------------------------------

    @classmethod
    def from_registry(
        cls, stage: ModelStage = ModelStage.CURRENT, *, root: Path | None = None
    ) -> FraudDetector:
        registry = ModelRegistry(root=root) if root else ModelRegistry()
        return cls(registry.load(stage))

    @classmethod
    def from_path(cls, path: Path) -> FraudDetector:
        return cls(load_artifact(Path(path)))

    # -- validation -------------------------------------------------------

    def _validate(self, features: dict) -> tuple[list[ValidationIssue], list[str]]:
        issues: list[ValidationIssue] = []
        warnings: list[str] = []

        for name in self.feature_names:
            if name not in features:
                issues.append(
                    ValidationIssue(name, "missing", "Required model feature absent.")
                )
                continue

            value = features[name]
            if value is None or (isinstance(value, float) and math.isnan(value)):
                if name not in NULLABLE_FEATURES:
                    warnings.append(
                        f"'{name}' is null; the model will use its learned default "
                        f"split direction."
                    )
                continue

            if isinstance(value, bool):
                continue
            if not isinstance(value, (int, float, np.integer, np.floating)):
                issues.append(
                    ValidationIssue(
                        name, "invalid_type", f"Expected a number, got {type(value).__name__}."
                    )
                )
                continue
            if math.isinf(float(value)):
                issues.append(ValidationIssue(name, "not_finite", "Value is infinite."))
                continue

            low, high = FEATURE_BOUNDS.get(name, (None, None))
            numeric = float(value)
            if low is not None and numeric < low:
                issues.append(
                    ValidationIssue(
                        name, "out_of_range", f"{numeric} is below the possible minimum {low}."
                    )
                )
            if high is not None and numeric > high:
                issues.append(
                    ValidationIssue(
                        name, "out_of_range", f"{numeric} is above the possible maximum {high}."
                    )
                )

        unexpected = set(features) - set(self.feature_names)
        if unexpected:
            # Extra keys are ignored rather than rejected: callers often
            # pass a whole feature row. Surfaced so typos are visible.
            warnings.append(f"Ignored unrecognised keys: {sorted(unexpected)}")

        return issues, warnings

    # -- prediction -------------------------------------------------------

    def predict(self, features: dict, *, top_k: int = 4) -> FraudPrediction:
        started = time.perf_counter()

        issues, warnings = self._validate(features)
        if issues:
            raise InputValidationError(issues)

        # Fixed column order from the manifest — never the dict's order.
        row = {
            name: (
                np.nan
                if features.get(name) is None
                else float(features[name])
            )
            for name in self.feature_names
        }
        X = pd.DataFrame([row], columns=list(self.feature_names)).astype("float64")

        raw = float(self.artifact.booster.predict_proba(X)[:, 1][0])
        calibrated_value = raw
        if self.artifact.calibrator is not None:
            calibrated_value = float(
                np.clip(
                    self.artifact.calibrator.transform(np.array([raw]))[0],
                    PROBABILITY_FLOOR,
                    PROBABILITY_CEILING,
                )
            )

        factors = self._explainer.explain_row(X, 0, top_k=top_k)

        availability = {
            name: not bool(pd.isna(X.iloc[0][name])) for name in self.feature_names
        }
        cold = bool(features.get("profile_is_cold", 0))

        if cold:
            warnings.append(
                "User history is too thin for deviation features to be reliable; "
                "treat this probability with caution."
            )

        return FraudPrediction(
            model_name=self.MODEL_NAME,
            model_version=self.artifact.metadata.model_version,
            fraud_probability=calibrated_value,
            raw_probability=raw,
            calibrated=self.artifact.is_calibrated,
            top_factors=factors,
            feature_availability=availability,
            cold_start=cold,
            inference_ms=(time.perf_counter() - started) * 1000.0,
            warnings=warnings,
        )

    def predict_batch(self, frame: pd.DataFrame) -> np.ndarray:
        """Vectorised probabilities for evaluation. No explanations."""
        X = frame.loc[:, list(self.feature_names)].astype("float64")
        raw = self.artifact.booster.predict_proba(X)[:, 1]
        if self.artifact.calibrator is not None:
            return np.clip(
                self.artifact.calibrator.transform(raw),
                PROBABILITY_FLOOR,
                PROBABILITY_CEILING,
            )
        return raw
