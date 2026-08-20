"""
Unit Tests for S40 Feature Extractors.
"""

import unittest
from ml.features.transaction_features import TransactionFeatureExtractor
from ml.features.behaviour_features import BehaviourFeatureExtractor
from ml.features.device_features import DeviceFeatureExtractor, haversine_distance
from ml.features.voice_features import VoiceFeatureExtractor


class TestFeatureExtractors(unittest.TestCase):

    def setUp(self):
        self.txn_extractor = TransactionFeatureExtractor()
        self.beh_extractor = BehaviourFeatureExtractor()
        self.dev_extractor = DeviceFeatureExtractor()
        self.voi_extractor = VoiceFeatureExtractor()

        self.sample_txn = {
            "transaction_id": "TXN_001",
            "amount": 7500.0,
            "recipient_id": "REC_99",
            "timestamp": "2026-08-15T14:00:00Z",
            "device_id": "NEW_DEV_1",
            "location": "Delhi",
            "lat": 28.6139,
            "lon": 77.2090,
            "hours_since_last_txn": 0.5,
        }

        self.sample_profile = {
            "normal_avg_amount": 1000.0,
            "normal_std_amount": 300.0,
            "historical_max_amount": 3000.0,
            "frequent_recipients": ["REC_1", "REC_2"],
            "known_devices": ["OLD_DEV_1"],
            "last_lat": 20.2961,  # Bhubaneswar
            "last_lon": 85.8245,
            "typical_locations": ["Bhubaneswar"],
        }

    def test_transaction_feature_extraction(self):
        res = self.txn_extractor.extract_features(self.sample_txn, self.sample_profile)
        self.assertEqual(res["amount"], 7500.0)
        self.assertAlmostEqual(res["amount_vs_avg_ratio"], 7.5, delta=0.1)
        self.assertEqual(res["recipient_novelty"], 1.0)

    def test_behaviour_feature_extraction(self):
        res = self.beh_extractor.extract_features(self.sample_txn, self.sample_profile)
        self.assertGreater(res["behaviour_amount_deviation"], 10.0)
        self.assertEqual(res["location_anomaly_score"], 1.0)

    def test_device_feature_extraction(self):
        res = self.dev_extractor.extract_features(self.sample_txn, self.sample_profile)
        self.assertEqual(res["new_device"], 1.0)
        # Haversine distance between Bhubaneswar and Delhi is ~1250 km
        self.assertGreater(res["location_distance_km"], 1000.0)
        # Speed over 0.5h is ~2500 km/h -> Impossible travel
        self.assertGreater(res["impossible_travel_speed_kmh"], 800.0)

    def test_haversine_formula(self):
        # Distance between same points should be 0.0
        dist = haversine_distance(20.2961, 85.8245, 20.2961, 85.8245)
        self.assertAlmostEqual(dist, 0.0, delta=0.01)

    def test_voice_feature_extraction(self):
        script = "Your bank account will be blocked immediately by police unless you pay now."
        res = self.voi_extractor.extract_features_from_text(script)
        self.assertGreater(res["urgency_score"], 0.3)
        self.assertGreater(res["threat_score"], 0.3)
        self.assertGreater(res["coercion_score"], 0.4)


if __name__ == "__main__":
    unittest.main()
