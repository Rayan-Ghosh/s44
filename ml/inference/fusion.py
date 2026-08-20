"""
Calibrated Multi-Signal Risk Fusion & Rule Engine for S40.

Implements Probabilistic Multi-Signal Fusion (docs/ARCHITECTURE.md §5, docs/ML_ARCHITECTURE.md §8):
1. Runs deterministic Rule Engine checks.
2. Ingests normalized sub-model outputs:
   - Calibrated Transaction Fraud Probability (P_fraud)
   - Behaviour Anomaly Score (S_anomaly)
   - Device Risk Heuristics (R_device)
   - Voice Phishing Threat Intent (R_voice)
   - Rule Engine Risk Contribution (R_rules)
3. Applies Anti-Double-Counting Probabilistic Saturation Fusion:
   Risk_fused = 100 * (1 - prod_i (1 - w_i * s_i))
   Prevents artificial score inflation when correlated signals (e.g. new_device) activate rules & ML.
4. Tier Routing:
   - 0–30:   LOW    -> ALLOW (Auto-Approve)
   - 31–60:  MEDIUM -> WARN_CHOICE (User Choice Warning)
   - 61–100: HIGH   -> CONFIRM_OR_CANCEL (Strong Verification)
"""

import os
import json
import math
from typing import Dict, Any, List, Tuple


DEFAULT_FUSION_CONFIG = {
    "weights": {
        "transaction_fraud": 0.35,
        "behaviour_anomaly": 0.25,
        "device_risk": 0.20,
        "voice_risk": 0.20,
    },
    "thresholds": {
        "low_max": 30,
        "medium_max": 60,
    },
    "rule_definitions": [
        {
            "rule_id": "NEW_DEVICE_HIGH_VALUE",
            "severity": "high",
            "score": 25,
            "condition": lambda f: f.get("new_device", 0) == 1 and f.get("amount_vs_avg_ratio", 1.0) >= 3.0 and f.get("recipient_novelty", 0) == 1,
            "explanation": "High-value payment to a new recipient initiated from an unrecognized device."
        },
        {
            "rule_id": "IMPOSSIBLE_TRAVEL_VELOCITY",
            "severity": "high",
            "score": 30,
            "condition": lambda f: f.get("impossible_travel_speed_kmh", 0) > 800.0,
            "explanation": "Transaction location violates physical travel speed limits."
        },
        {
            "rule_id": "VELOCITY_BURST",
            "severity": "medium",
            "score": 15,
            "condition": lambda f: f.get("velocity_10m", 0) >= 4 or f.get("velocity_ratio_10m_24h", 0) >= 3.0,
            "explanation": "High transaction frequency burst detected in recent activity."
        },
        {
            "rule_id": "RAPID_SUCCESSIVE_TRANSFER",
            "severity": "medium",
            "score": 15,
            "condition": lambda f: f.get("rapid_successive_transfer", 0) == 1.0,
            "explanation": "Rapid successive transaction initiated within 60 seconds."
        },
        {
            "rule_id": "VOICE_COERCION_FLAG",
            "severity": "high",
            "score": 35,
            "condition": lambda f: f.get("voice_risk_score", 0.0) >= 0.70,
            "explanation": "Active voice call indicates severe coercion or social engineering."
        }
    ]
}


class RiskFusionEngine:
    """
    Calibrates, fuses multi-model signals, applies rules, and renders risk decisions.
    """

    def __init__(self, config_path: str = None):
        self.config = DEFAULT_FUSION_CONFIG
        if config_path and os.path.exists(config_path):
            try:
                with open(config_path, "r") as f:
                    file_config = json.load(f)
                    if "weights" in file_config:
                        self.config["weights"].update(file_config["weights"])
                    if "thresholds" in file_config:
                        self.config["thresholds"].update(file_config["thresholds"])
            except Exception:
                pass

    def evaluate_rules(self, features: Dict[str, float]) -> Tuple[float, List[Dict[str, Any]]]:
        """Evaluates deterministic rules against feature vector."""
        active_rules = []
        total_rule_score = 0.0

        for rule in self.config["rule_definitions"]:
            try:
                if rule["condition"](features):
                    active_rules.append({
                        "rule_id": rule["rule_id"],
                        "severity": rule["severity"],
                        "score": rule["score"],
                        "explanation": rule["explanation"]
                    })
                    total_rule_score += rule["score"]
            except Exception:
                continue

        normalized_rule_score = min(50.0, total_rule_score) / 50.0
        return float(normalized_rule_score), active_rules

    def fuse_signals(
        self,
        features: Dict[str, float],
        sub_scores: Dict[str, float],
        active_rules: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Fuses normalized sub-model outputs using Probabilistic Saturation Fusion.
        """
        weights = self.config["weights"]

        if active_rules is None:
            r_rule, active_rules = self.evaluate_rules(features)
        else:
            r_rule = min(50.0, sum(r.get("score", 10) for r in active_rules)) / 50.0

        p_fraud = min(1.0, sub_scores.get("transaction_fraud", 0.0) * 2.5)
        s_anomaly = sub_scores.get("behaviour_anomaly", 0.0)
        r_device = sub_scores.get("device_risk", 0.0)
        r_voice = sub_scores.get("voice_risk", 0.0)

        # 1. Anti-Double-Counting Control:
        if features.get("new_device", 0) == 1 and r_device > 0.6:
            r_rule = r_rule * 0.75

        # 2. Probabilistic Saturation Fusion Formula:
        # Risk = 1 - ( (1 - w_f * P_fraud) * (1 - w_a * S_anomaly) * (1 - w_d * R_device) * (1 - w_v * R_voice) * (1 - 0.25 * R_rule) )
        comp_fraud = 1.0 - (weights["transaction_fraud"] * p_fraud)
        comp_anomaly = 1.0 - (weights["behaviour_anomaly"] * s_anomaly)
        comp_device = 1.0 - (weights["device_risk"] * r_device)
        comp_voice = 1.0 - (weights["voice_risk"] * r_voice)
        comp_rule = 1.0 - (0.25 * r_rule)

        combined_survival = comp_fraud * comp_anomaly * comp_device * comp_voice * comp_rule
        fused_risk_float = 1.0 - combined_survival

        # Non-linear boost if voice phishing or high-value fraud detected
        if r_voice >= 0.70 or p_fraud >= 0.75:
            fused_risk_float = max(fused_risk_float, 0.75)

        # Calibrate to 0–100 integer
        risk_score = int(round(min(100.0, fused_risk_float * 100.0)))


        # 3. Decision Tier Routing
        low_max = self.config["thresholds"]["low_max"]
        medium_max = self.config["thresholds"]["medium_max"]

        if risk_score <= low_max:
            risk_level = "LOW"
            decision = "ALLOW"
        elif risk_score <= medium_max:
            risk_level = "MEDIUM"
            decision = "WARN_CHOICE"
        else:
            risk_level = "HIGH"
            decision = "CONFIRM_OR_CANCEL"

        return {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "decision": decision,
            "sub_scores": {
                "transaction_fraud": round(p_fraud, 4),
                "behaviour_anomaly": round(s_anomaly, 4),
                "device_risk": round(r_device, 4),
                "voice_risk": round(r_voice, 4),
                "rule_risk": round(r_rule, 4),
            },
            "active_rules": active_rules,
        }
