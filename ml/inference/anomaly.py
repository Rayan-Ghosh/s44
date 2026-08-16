"""
Behaviour anomaly inference contract.

Mirrors ml/inference/predict.py in shape and guarantees, so that Phase 6
fusion consumes two detectors with consistent ergonomics. Like the fraud
detector, it has no FastAPI dependency and emits no risk score, risk level
or decision.

THE DEFINING BEHAVIOUR OF THIS DETECTOR: IT CAN REFUSE.

A user without enough history has no baseline to deviate from. Rather than
imputing one and returning a confident number built on nothing, this
detector returns `scorable=False` with a reason and `anomaly_score=None`.
Fusion must handle absence — which is honest — instead of silently
absorbing a fabricated value.
"""

from __future__ import annotations

import json
import math
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.registry.model_registry import ModelRegistry, ModelStage
from ml.training.anomaly_model import BEHAVIOUR_FEATURES, ScoreNormalizer
from ml.training.train_anomaly import ANOMALY_ROOT

#: Sanity bounds. As with the fraud detector, these reject IMPOSSIBLE input
#: (a negative count, a share above 1), never merely unusual input —
#: unusual behaviour is precisely what this detector exists to measure.
FEATURE_BOUNDS: dict[str, tuple[float | None, float | None]] = {
    "amount_zscore": (-1e4, 1e4),
    "amount_vs_average": (0.0, None),
    "recipient_seen_before": (0.0, 1.0),
    "recipient_frequency": (0.0, 1.0),
    "time_of_day_deviation": (0.0, 1.0),
    "seconds_since_last_transaction": (0.0, None),
    "transactions_last_10m": (0.0, None),
    "transactions_last_1h": (0.0, None),
    "location_deviation": (0.0, 1.0),
}


@dataclass(frozen=True)
class AnomalyValidationIssue:
    feature: str
    problem: str
    detail: str


class AnomalyInputError(ValueError):
    def __init__(self, issues: list[AnomalyValidationIssue]) -> None:
        self.issues = issues
        summary = "; ".join(f"{i.feature}: {i.problem}" for i in issues)
        super().__init__(f"Invalid anomaly model input — {summary}")


@dataclass(frozen=True)
class AnomalyPrediction:
    """One detector's output. Not a risk score, not a decision."""

    model_name: str
    model_version: str
    #: Normalized [0,1], higher = more unusual for this user. None when
    #: the user cannot be scored.
    anomaly_score: float | None
    #: Raw Isolation Forest output, retained for audit.
    raw_score: float | None
    scorable: bool
    #: Why scoring was refused, when it was.
    reason: str | None
    feature_availability: dict[str, bool]
    inference_ms: float
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


class BehaviourAnomalyDetector:
    MODEL_NAME = "s40_behaviour_anomaly"

    def __init__(self, forest, normalizer: ScoreNormalizer, metadata: dict, path: Path):
        self.forest = forest
        self.normalizer = normalizer
        self.metadata = metadata
        self.path = path
        self.feature_names = tuple(metadata.get("feature_names") or BEHAVIOUR_FEATURES)

    # -- construction -----------------------------------------------------

    @classmethod
    def from_path(cls, path: Path) -> BehaviourAnomalyDetector:
        path = Path(path)
        model_file = path / "model.joblib"
        metadata_file = path / "metadata.json"
        if not model_file.exists():
            raise FileNotFoundError(
                f"No model.joblib in {path}. Train one with:\n"
                f"    python -m ml.training.train_anomaly"
            )
        if not metadata_file.exists():
            raise FileNotFoundError(
                f"No metadata.json in {path}. An artifact without provenance must "
                f"not be loaded."
            )
        payload = joblib.load(model_file)
        metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
        return cls(payload["forest"], payload["normalizer"], metadata, path)

    @classmethod
    def from_registry(
        cls, stage: ModelStage = ModelStage.CURRENT, *, root: Path | None = None
    ) -> BehaviourAnomalyDetector:
        registry = ModelRegistry(root=Path(root) if root else ANOMALY_ROOT)
        version = registry.state().get(stage.value)
        if not version:
            # Fail loudly and usefully. Never fall back to a random score.
            raise FileNotFoundError(
                f"No anomaly model registered as '{stage.value}'. Train one with:\n"
                f"    python -m ml.training.train_anomaly"
            )
        return cls.from_path(registry.version_path(version))

    @property
    def model_version(self) -> str:
        return self.metadata.get("model_version", "unknown")

    # -- validation -------------------------------------------------------

    def _validate(self, features: dict) -> tuple[list[AnomalyValidationIssue], list[str]]:
        issues: list[AnomalyValidationIssue] = []
        warnings: list[str] = []

        for name in self.feature_names:
            if name not in features:
                issues.append(
                    AnomalyValidationIssue(name, "missing", "Required feature absent.")
                )
                continue
            value = features[name]
            if value is None or (isinstance(value, float) and math.isnan(value)):
                continue  # legitimate absence -> handled as unscorable below
            if isinstance(value, bool):
                continue
            if not isinstance(value, (int, float, np.integer, np.floating)):
                issues.append(
                    AnomalyValidationIssue(
                        name, "invalid_type", f"Expected a number, got {type(value).__name__}."
                    )
                )
                continue
            if math.isinf(float(value)):
                issues.append(
                    AnomalyValidationIssue(name, "not_finite", "Value is infinite.")
                )
                continue
            low, high = FEATURE_BOUNDS.get(name, (None, None))
            numeric = float(value)
            if low is not None and numeric < low:
                issues.append(
                    AnomalyValidationIssue(
                        name, "out_of_range", f"{numeric} is below the minimum {low}."
                    )
                )
            if high is not None and numeric > high:
                issues.append(
                    AnomalyValidationIssue(
                        name, "out_of_range", f"{numeric} is above the maximum {high}."
                    )
                )

        unexpected = set(features) - set(self.feature_names)
        if unexpected:
            warnings.append(f"Ignored unrecognised keys: {sorted(unexpected)}")
        return issues, warnings

    # -- prediction -------------------------------------------------------

    def predict(self, features: dict) -> AnomalyPrediction:
        started = time.perf_counter()

        issues, warnings = self._validate(features)
        if issues:
            raise AnomalyInputError(issues)

        values = {}
        availability = {}
        for name in self.feature_names:
            raw = features.get(name)
            missing = raw is None or (isinstance(raw, float) and math.isnan(raw))
            availability[name] = not missing
            values[name] = np.nan if missing else float(raw)

        missing_features = [n for n, present in availability.items() if not present]
        if missing_features:
            # REFUSE. Isolation Forest cannot accept NaN, and imputing would
            # invent the very baseline whose absence is the point.
            return AnomalyPrediction(
                model_name=self.MODEL_NAME,
                model_version=self.model_version,
                anomaly_score=None,
                raw_score=None,
                scorable=False,
                reason=(
                    "Insufficient user history to establish a behavioural "
                    f"baseline; unavailable: {sorted(missing_features)}. No score "
                    "is produced rather than one derived from imputed history."
                ),
                feature_availability=availability,
                inference_ms=(time.perf_counter() - started) * 1000.0,
                warnings=warnings,
            )

        X = pd.DataFrame([values], columns=list(self.feature_names)).astype("float64")
        raw_score = float(-self.forest.score_samples(X)[0])
        normalized = float(self.normalizer.transform(np.array([raw_score]))[0])

        return AnomalyPrediction(
            model_name=self.MODEL_NAME,
            model_version=self.model_version,
            anomaly_score=normalized,
            raw_score=raw_score,
            scorable=True,
            reason=None,
            feature_availability=availability,
            inference_ms=(time.perf_counter() - started) * 1000.0,
            warnings=warnings,
        )

    def predict_batch(self, frame: pd.DataFrame) -> np.ndarray:
        """Normalized scores for scorable rows; NaN where unscorable."""
        X = frame.reindex(columns=list(self.feature_names)).astype("float64")
        out = np.full(len(X), np.nan)
        mask = X.notna().all(axis=1).to_numpy()
        if mask.any():
            raw = -self.forest.score_samples(X[mask])
            out[mask] = self.normalizer.transform(raw)
        return out
