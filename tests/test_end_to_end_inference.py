"""
End-to-End Integration & Latency Benchmark Tests for MLPredictor.
"""

import time
import unittest
from ml.inference.predict import get_predictor, MLPredictor, RiskDecisionPackage


class TestEndToEndInference(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.predictor = get_predictor()

    def test_singleton_identity(self):
        another_instance = get_predictor()
        self.assertIs(self.predictor, another_instance)

    def test_predict_contract_and_latency(self):
        payload = {
            "transaction_id": "TXN_TEST_123",
            "amount": 15000.0,
            "recipient_id": "RECIPIENT_TEST",
            "timestamp": "2026-08-15T14:30:00Z",
            "device_id": "DEVICE_TEST",
            "location": "Bhubaneswar",
            "voice_transcript": "Your account will be blocked immediately.",
            "user_profile": {
                "normal_avg_amount": 1000.0,
                "normal_std_amount": 300.0,
            }
        }

        t0 = time.perf_counter()
        res = self.predictor.predict(payload)
        t1 = time.perf_counter()
        latency_ms = (t1 - t0) * 1000.0

        # Verify Response Schema
        self.assertEqual(res["transaction_id"], "TXN_TEST_123")
        self.assertIn(res["risk_level"], ["LOW", "MEDIUM", "HIGH"])
        self.assertIn(res["decision"], ["ALLOW", "WARN_CHOICE", "CONFIRM_OR_CANCEL"])
        self.assertIsInstance(res["plain_language_reasons"], list)
        self.assertIsInstance(res["risk_factors"], list)
        self.assertIsInstance(res["risk_contributions_pct"], dict)

        # Assert Strict Latency Threshold (<50ms)
        print(f"[TEST LATENCY] End-to-end inference latency: {latency_ms:.2f} ms")
        self.assertLess(latency_ms, 50.0)


if __name__ == "__main__":
    unittest.main()
