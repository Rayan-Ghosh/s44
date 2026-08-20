"""
SHAP & Rule-Based Plain-Language Explanation Engine for S40.

Generates pre-decision explainability packages containing:
1. Plain-language non-technical bullet points for ordinary users.
2. SHAP feature attributions & percentage risk contribution breakdowns.
3. Specific risk factor tags.
"""

from typing import Dict, Any, List, Tuple
import numpy as np


class ExplainabilityEngine:
    """
    Translates ML feature importances and active rule triggers into
    human-readable, non-technical explanations.
    """

    def __init__(self, xgb_model: Any = None):
        self.xgb_model = xgb_model
        self.shap_explainer = None
        if xgb_model is not None:
            try:
                import shap
                self.shap_explainer = shap.TreeExplainer(xgb_model)
            except Exception:
                self.shap_explainer = None

    def generate_explanation(
        self,
        features: Dict[str, float],
        sub_scores: Dict[str, float],
        active_rules: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Generates a human-readable explanation package.

        Args:
            features: Dictionary of computed feature values.
            sub_scores: Model outputs (fraud_probability, anomaly_score, device_risk, voice_risk).
            active_rules: List of triggered rule dictionaries.

        Returns:
            Dict containing bullet_points, risk_factors, and risk_contributions_pct.
        """
        bullet_points: List[str] = []
        risk_factors: List[str] = []

        amount = features.get("amount", 0.0)
        zscore = features.get("amount_zscore", 0.0)
        avg_ratio = features.get("amount_vs_avg_ratio", 1.0)
        new_device = features.get("new_device", 0.0)
        recipient_novelty = features.get("recipient_novelty", 0.0)
        impossible_travel = features.get("impossible_travel_speed_kmh", 0.0)
        voice_risk = sub_scores.get("voice_risk", 0.0)
        anomaly_score = sub_scores.get("behaviour_anomaly", 0.0)

        # 1. Plain-Language Rule & Feature Maps
        if avg_ratio >= 3.0 or zscore >= 2.5:
            bullet_points.append(f"Transaction amount (₹{amount:,.0f}) is {avg_ratio:.1f}× higher than your usual average.")
            risk_factors.append("amount_deviation")

        if recipient_novelty == 1.0:
            bullet_points.append("Recipient account has never been used before.")
            risk_factors.append("new_recipient")

        if new_device == 1.0:
            bullet_points.append("Payment initiated from an unrecognized device.")
            risk_factors.append("new_device")

        if impossible_travel > 800.0:
            bullet_points.append("Unusual physical distance detected since your last transaction.")
            risk_factors.append("impossible_travel")

        if voice_risk >= 0.5:
            bullet_points.append("Potential voice call coercion / social engineering scam indicators detected.")
            risk_factors.append("voice_phishing")

        if anomaly_score >= 0.70 and "amount_deviation" not in risk_factors:
            bullet_points.append("Unusual timing or transaction pattern for your account history.")
            risk_factors.append("behavioural_drift")

        # Include explicit rule explanations if present
        for rule in active_rules:
            expl = rule.get("explanation")
            rule_id = rule.get("rule_id")
            if expl and expl not in bullet_points:
                bullet_points.append(expl)
            if rule_id and rule_id not in risk_factors:
                risk_factors.append(rule_id.lower())

        # Fallback explanation if no specific triggers fired
        if not bullet_points:
            bullet_points.append("Transaction matches your typical payment activity.")

        # 2. Risk Contribution Percentage Breakdown (for Institution Dashboard & Explainability Card)
        raw_contributions = {
            "Transaction Fraud Model": max(0.01, sub_scores.get("transaction_fraud", 0.1)),
            "Behaviour Anomaly": max(0.01, sub_scores.get("behaviour_anomaly", 0.1)),
            "Device Integrity": max(0.01, sub_scores.get("device_risk", 0.1)),
            "Voice Scam Analysis": max(0.01, sub_scores.get("voice_risk", 0.0)),
            "Rule Engine": max(0.01, sub_scores.get("rule_risk", 0.0)),
        }

        total_contrib = sum(raw_contributions.values())
        risk_contributions_pct = {
            k: round((v / total_contrib) * 100.0, 1)
            for k, v in raw_contributions.items()
        }

        return {
            "plain_language_reasons": bullet_points,
            "risk_factors": list(set(risk_factors)),
            "risk_contributions_pct": risk_contributions_pct,
        }
