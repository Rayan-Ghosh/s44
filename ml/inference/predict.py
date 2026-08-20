"""
Unified ML Prediction Engine (Mediator / API Singleton) for S40.

Loads all serialized model artifacts once upon initialization:
- Transaction Fraud XGBoost (ml/models/fraud_xgb.json)
- Feature Scaler (ml/models/scaler.joblib)
- Behaviour Anomaly Forest (ml/models/anomaly_forest.joblib)
- Voice NLP Classifier (ml/models/voice_nlp.joblib)
- Fusion Configuration (ml/models/fusion_config.json)

Provides a mediator predict(payload: dict) -> dict entrypoint that executes feature extraction,
multi-model scoring, rule evaluation, SHAP explainability, and risk fusion strictly under 50ms.
"""

import os
import time
import joblib
import numpy as np
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

from xgboost import XGBClassifier
from ml.features.transaction_features import TransactionFeatureExtractor
from ml.features.behaviour_features import BehaviourFeatureExtractor
from ml.features.device_features import DeviceFeatureExtractor
from ml.features.voice_features import VoiceFeatureExtractor
from voice.classifier import VoiceClassifier
from ml.explainability.shap_explainer import ExplainabilityEngine
from ml.inference.fusion import RiskFusionEngine


MODEL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models"))


class RiskDecisionPackage(BaseModel):
    """Pydantic model representing the authoritative decision package contract."""
    transaction_id: str
    risk_score: int = Field(..., ge=0, le=100)
    risk_level: str  # LOW, MEDIUM, HIGH
    decision: str  # ALLOW, WARN_CHOICE, CONFIRM_OR_CANCEL
    plain_language_reasons: list[str]
    risk_factors: list[str]
    risk_contributions_pct: dict[str, float]
    latency_ms: float
    timestamp: str


class MLPredictor:
    """
    Singleton Inference Manager for S40 Fraud Shield.
    Loads models once at startup and performs fast <50ms real-time scoring.
    """
    _instance: Optional["MLPredictor"] = None

    def __new__(cls, model_dir: str = MODEL_DIR):
        if cls._instance is None:
            cls._instance = super(MLPredictor, cls).__new__(cls)
            cls._instance._initialize(model_dir)
        return cls._instance

    def _initialize(self, model_dir: str):
        """Loads all serialized model artifacts from disk into memory."""
        self.model_dir = model_dir
        
        # 1. Feature Extractors
        self.txn_extractor = TransactionFeatureExtractor()
        self.behaviour_extractor = BehaviourFeatureExtractor()
        self.device_extractor = DeviceFeatureExtractor()
        self.voice_extractor = VoiceFeatureExtractor()

        # 2. Sub-Models & Scalers
        self.xgb_model = None
        self.scaler = None
        self.anomaly_forest = None
        self.voice_nlp_pipeline = None

        xgb_path = os.path.join(model_dir, "fraud_xgb.json")
        calibrated_path = os.path.join(model_dir, "calibrated_fraud.joblib")
        scaler_path = os.path.join(model_dir, "scaler.joblib")
        anomaly_path = os.path.join(model_dir, "anomaly_forest.joblib")
        voice_path = os.path.join(model_dir, "voice_nlp.joblib")
        fusion_cfg_path = os.path.join(model_dir, "fusion_config.json")

        if os.path.exists(calibrated_path):
            self.xgb_model = joblib.load(calibrated_path)
            print("[ML PREDICTOR] Loaded Isotonic Calibrated Classifier.")
        elif os.path.exists(xgb_path):
            self.xgb_model = XGBClassifier()
            self.xgb_model.load_model(xgb_path)

        if os.path.exists(scaler_path):
            self.scaler = joblib.load(scaler_path)

        if os.path.exists(anomaly_path):
            self.anomaly_forest = joblib.load(anomaly_path)

        if os.path.exists(voice_path):
            self.voice_nlp_pipeline = joblib.load(voice_path)

        # 3. Voice Classifier & Subsystems
        self.voice_classifier = VoiceClassifier(nlp_model_artifact=self.voice_nlp_pipeline)
        self.explainability_engine = ExplainabilityEngine(xgb_model=self.xgb_model)
        self.fusion_engine = RiskFusionEngine(config_path=fusion_cfg_path)

        print("[ML PREDICTOR] Singleton successfully initialized and model artifacts loaded.")

    def predict(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes unified real-time risk scoring for an incoming payload.

        Args:
            payload: Dict containing transaction details, device context, user profile, and voice transcripts.

        Returns:
            Dict matching RiskDecisionPackage schema.
        """
        start_time = time.perf_counter()

        transaction = payload.get("transaction", payload)
        user_profile = payload.get("user_profile", payload.get("user_risk_profile", {}))

        # 1. Feature Extraction
        f_txn = self.txn_extractor.extract_features(transaction, user_profile)
        f_beh = self.behaviour_extractor.extract_features(transaction, user_profile)
        f_dev = self.device_extractor.extract_features(transaction, user_profile)
        f_voi = self.voice_extractor.extract_features(transaction, user_profile)

        # Combined Unified Feature Dictionary
        features = {**f_txn, **f_beh, **f_dev, **f_voi}

        # 2. Sub-Model Inferences
        # (a) Transaction Fraud XGBoost Score
        p_fraud = 0.15
        if self.xgb_model is not None and self.scaler is not None:
            try:
                # Align feature vector to model input feature columns
                from ml.training.train_fraud import FEATURE_COLUMNS
                feat_vec = [features.get(col, 0.0) for col in FEATURE_COLUMNS]
                scaled_vec = self.scaler.transform([feat_vec])
                p_fraud = float(self.xgb_model.predict_proba(scaled_vec)[0][1])
            except Exception:
                p_fraud = 0.15

        # (b) Behaviour Anomaly Isolation Forest Score
        s_anomaly = 0.10
        if self.anomaly_forest is not None:
            try:
                from ml.training.train_anomaly import BEHAVIOUR_COLUMNS
                beh_vec = [features.get(col, 0.0) for col in BEHAVIOUR_COLUMNS]
                # Isolation Forest decision_function returns negative for anomalies
                raw_score = self.anomaly_forest.decision_function([beh_vec])[0]
                # Scale raw score to 0.0 - 1.0 (where higher means more anomalous)
                s_anomaly = float(np.clip(0.5 - raw_score, 0.0, 1.0))
            except Exception:
                s_anomaly = 0.10

        # (c) Device Risk Score
        new_device = features.get("new_device", 0.0)
        impossible_travel = features.get("impossible_travel_speed_kmh", 0.0)
        account_count = features.get("device_account_count", 1.0)
        
        r_device = 0.1
        if new_device == 1.0:
            r_device += 0.45
        if impossible_travel > 800.0:
            r_device += 0.40
        if account_count > 2:
            r_device += 0.15
        r_device = min(1.0, r_device)

        # (d) Voice Phishing Risk Score
        voice_payload = transaction.get("voice_transcript", transaction.get("voice_analysis", ""))
        if isinstance(voice_payload, str) and voice_payload.strip():
            voice_res = self.voice_classifier.classify_transcript(voice_payload)
            r_voice = float(voice_res.get("overall_voice_risk", 0.0))
        else:
            r_voice = float(features.get("coercion_score", 0.0))

        sub_scores = {
            "transaction_fraud": p_fraud,
            "behaviour_anomaly": s_anomaly,
            "device_risk": r_device,
            "voice_risk": r_voice,
        }

        # 3. Rule Evaluation & Fusion
        fusion_result = self.fusion_engine.fuse_signals(features, sub_scores, [])
        active_rules = fusion_result.get("active_rules", [])

        # 4. Explainability Package Generation
        explanation_pkg = self.explainability_engine.generate_explanation(
            features, sub_scores, active_rules
        )

        latency_ms = (time.perf_counter() - start_time) * 1000.0

        txn_id = str(transaction.get("transaction_id", "TXN_UNKNOWN"))
        ts = str(transaction.get("timestamp", ""))

        response = {
            "transaction_id": txn_id,
            "risk_score": fusion_result["risk_score"],
            "risk_level": fusion_result["risk_level"],
            "decision": fusion_result["decision"],
            "plain_language_reasons": explanation_pkg["plain_language_reasons"],
            "risk_factors": explanation_pkg["risk_factors"],
            "risk_contributions_pct": explanation_pkg["risk_contributions_pct"],
            "sub_scores": fusion_result["sub_scores"],
            "latency_ms": round(latency_ms, 2),
            "timestamp": ts,
        }

        return response


# Global singleton instance helper function
def get_predictor() -> MLPredictor:
    return MLPredictor()
