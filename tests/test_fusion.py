"""
Unit Tests for Risk Calibration & Fusion Engine.
"""

import unittest
from ml.inference.fusion import RiskFusionEngine


class TestRiskFusionEngine(unittest.TestCase):

    def setUp(self):
        self.fusion_engine = RiskFusionEngine()

    def test_low_risk_decision(self):
        features = {"amount_vs_avg_ratio": 1.0, "new_device": 0, "recipient_novelty": 0}
        sub_scores = {
            "transaction_fraud": 0.05,
            "behaviour_anomaly": 0.05,
            "device_risk": 0.0,
            "voice_risk": 0.0,
        }
        res = self.fusion_engine.fuse_signals(features, sub_scores, [])
        self.assertLessEqual(res["risk_score"], 30)
        self.assertEqual(res["risk_level"], "LOW")
        self.assertEqual(res["decision"], "ALLOW")

    def test_high_risk_decision(self):
        features = {
            "amount_vs_avg_ratio": 8.0,
            "new_device": 1,
            "recipient_novelty": 1,
            "impossible_travel_speed_kmh": 1200.0,
            "voice_risk_score": 0.90,
        }
        sub_scores = {
            "transaction_fraud": 0.85,
            "behaviour_anomaly": 0.80,
            "device_risk": 0.90,
            "voice_risk": 0.90,
        }
        res = self.fusion_engine.fuse_signals(features, sub_scores, [])
        self.assertGreater(res["risk_score"], 60)
        self.assertEqual(res["risk_level"], "HIGH")
        self.assertEqual(res["decision"], "CONFIRM_OR_CANCEL")

    def test_anti_double_counting_dampening(self):
        features = {"new_device": 1, "amount_vs_avg_ratio": 4.0, "recipient_novelty": 1}
        sub_scores = {
            "transaction_fraud": 0.50,
            "behaviour_anomaly": 0.40,
            "device_risk": 0.80,  # High device risk already penalizes
            "voice_risk": 0.10,
        }
        res = self.fusion_engine.fuse_signals(features, sub_scores, [])
        self.assertIn("rule_risk", res["sub_scores"])


if __name__ == "__main__":
    unittest.main()
