"""
S40 inference service — the single entry point Phase 6 will wrap.

Runs the independent detectors and returns their outputs SIDE BY SIDE. It
does not combine them, weight them, or derive anything from them.

    transaction features
            │
            ├── FraudDetector          -> fraud_probability
            └── BehaviourAnomalyDetector -> anomaly_score
            │
            ▼
      DetectorOutputs   (no fusion, no risk score, no decision)

WHY THE SEPARATION IS ENFORCED HERE RATHER THAN JUST DOCUMENTED
    It would be one line to average the two numbers and call it a risk
    score. Spec §12 and §35.1 forbid that: individual detectors must not
    decide outcomes, and fusion weights must be calibrated rather than
    invented. The service therefore exposes no combining method at all —
    Phase 6 must add it deliberately, with real calibration.

FAILURE POLICY
    A detector that cannot load or cannot score reports that fact. There
    is no fallback score, no default, no random value. Downstream code
    sees `available=False` or `scorable=False` and decides what to do —
    which is strictly better than silently scoring a payment with a made-up
    number.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from ml.inference.anomaly import AnomalyPrediction, BehaviourAnomalyDetector
from ml.inference.predict import FraudDetector, FraudPrediction
from ml.training.anomaly_model import BEHAVIOUR_FEATURES
from ml.training.feature_manifest import MODEL_FEATURE_NAMES


@dataclass(frozen=True)
class DetectorOutputs:
    """Independent detector signals, deliberately uncombined."""

    fraud: FraudPrediction | None
    anomaly: AnomalyPrediction | None
    #: Detector name -> why it produced nothing.
    unavailable: dict[str, str] = field(default_factory=dict)

    @property
    def fraud_probability(self) -> float | None:
        return self.fraud.fraud_probability if self.fraud else None

    @property
    def anomaly_score(self) -> float | None:
        if self.anomaly is None or not self.anomaly.scorable:
            return None
        return self.anomaly.anomaly_score

    def to_dict(self) -> dict:
        return {
            "fraud": self.fraud.to_dict() if self.fraud else None,
            "anomaly": self.anomaly.to_dict() if self.anomaly else None,
            "unavailable": dict(self.unavailable),
            "note": (
                "Independent detector outputs. NOT fused, NOT a risk score, NOT a "
                "decision. Combination is the Risk Fusion Engine's responsibility "
                "(spec §12), which does not exist yet."
            ),
        }


class S40InferenceService:
    """Loads and runs the available detectors.

    Constructed with `strict=False` by default so that a missing anomaly
    model does not take down fraud scoring — the failure is reported per
    detector instead of raising globally.
    """

    def __init__(
        self,
        fraud: FraudDetector | None = None,
        anomaly: BehaviourAnomalyDetector | None = None,
        unavailable: dict[str, str] | None = None,
    ) -> None:
        self.fraud = fraud
        self.anomaly = anomaly
        self.unavailable = unavailable or {}

    @classmethod
    def load(
        cls,
        *,
        fraud_root: Path | None = None,
        anomaly_root: Path | None = None,
        strict: bool = False,
    ) -> S40InferenceService:
        unavailable: dict[str, str] = {}

        fraud = None
        try:
            fraud = (
                FraudDetector.from_registry(root=fraud_root)
                if fraud_root
                else FraudDetector.from_registry()
            )
        except Exception as exc:
            if strict:
                raise
            unavailable["fraud"] = str(exc)

        anomaly = None
        try:
            anomaly = BehaviourAnomalyDetector.from_registry(root=anomaly_root)
        except Exception as exc:
            if strict:
                raise
            unavailable["anomaly"] = str(exc)

        return cls(fraud=fraud, anomaly=anomaly, unavailable=unavailable)

    @property
    def available_detectors(self) -> list[str]:
        names = []
        if self.fraud is not None:
            names.append("fraud")
        if self.anomaly is not None:
            names.append("anomaly")
        return names

    def model_versions(self) -> dict[str, str | None]:
        return {
            "fraud": self.fraud.artifact.metadata.model_version if self.fraud else None,
            "anomaly": self.anomaly.model_version if self.anomaly else None,
        }

    def predict(self, features: dict, *, top_k: int = 4) -> DetectorOutputs:
        """Run every available detector over one transaction's features.

        `features` is the full canonical feature row; each detector selects
        the subset it was trained on, so a caller never has to know which
        detector wants which columns.
        """
        unavailable = dict(self.unavailable)

        fraud_prediction = None
        if self.fraud is not None:
            fraud_features = {k: features.get(k) for k in MODEL_FEATURE_NAMES}
            try:
                fraud_prediction = self.fraud.predict(fraud_features, top_k=top_k)
            except Exception as exc:
                unavailable["fraud"] = f"prediction failed: {exc}"

        anomaly_prediction = None
        if self.anomaly is not None:
            anomaly_features = {k: features.get(k) for k in BEHAVIOUR_FEATURES}
            try:
                anomaly_prediction = self.anomaly.predict(anomaly_features)
            except Exception as exc:
                unavailable["anomaly"] = f"prediction failed: {exc}"

        return DetectorOutputs(
            fraud=fraud_prediction, anomaly=anomaly_prediction, unavailable=unavailable
        )
