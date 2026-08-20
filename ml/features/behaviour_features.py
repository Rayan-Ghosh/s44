"""
Behaviour Feature Extractor for S40 Fraud Shield.

Computes user-specific behavioral deviation signals:
1. Amount deviation relative to user's habitual range.
2. Velocity anomaly score (bursts in transaction frequency).
3. Time-of-day deviation from typical transaction hours.
4. Location/IP deviation from typical user activity centers.
"""

import math
from typing import Dict, Any, List


class BehaviourFeatureExtractor:
    """
    Extracts behavioral anomaly features by comparing active payload
    against historical User Risk Profile.
    """

    FEATURE_NAMES = [
        "behaviour_amount_deviation",
        "velocity_burst_score",
        "time_deviation_hours",
        "location_anomaly_score",
        "historical_risk_score",
    ]

    def extract_features(
        self, transaction: Dict[str, Any], user_profile: Dict[str, Any]
    ) -> Dict[str, float]:
        """
        Computes behavioral anomaly metrics.

        Args:
            transaction: Transaction event details.
            user_profile: Historical profile containing typical_hours, typical_location, etc.

        Returns:
            Dict containing behavioral deviation float values.
        """
        amount = float(transaction.get("amount", 0.0))
        normal_avg = float(user_profile.get("normal_avg_amount", 1000.0))
        normal_std = float(user_profile.get("normal_std_amount", 500.0))
        
        # 1. Habitual Amount Deviation (|amount - avg| / max(std, 100))
        amount_diff = abs(amount - normal_avg)
        amount_dev = amount_diff / max(normal_std, 100.0)

        # 2. Velocity Burst Score (ratio of recent 10m txns to typical 10m average)
        vel_10m = float(transaction.get("velocity_10m", user_profile.get("velocity_10m", 0)))
        typical_vel_10m = float(user_profile.get("typical_velocity_10m", 0.5))
        velocity_burst = vel_10m / max(typical_vel_10m, 0.1)

        # 3. Time of Day Deviation (shortest distance in hours from user's typical hours)
        current_hour = float(transaction.get("hour", 12.0))
        typical_hours: List[float] = user_profile.get("typical_hours", [10.0, 14.0, 18.0])
        
        min_time_diff = 24.0
        for typ_h in typical_hours:
            diff = abs(current_hour - typ_h)
            # Circular 24-hour wrap-around (e.g. 23h vs 1h is 2h diff)
            circular_diff = min(diff, 24.0 - diff)
            if circular_diff < min_time_diff:
                min_time_diff = circular_diff

        # 4. Location Anomaly Score
        current_location = str(transaction.get("location", ""))
        known_locations = user_profile.get("typical_locations", ["Bhubaneswar", "Cuttack", "Delhi"])
        
        if not current_location or current_location in known_locations:
            location_anomaly = 0.0
        else:
            location_anomaly = 1.0

        # 5. Historical Risk Context (prior disputes/flagged incidents)
        historical_risk = float(user_profile.get("historical_risk_score", 0.0))

        return {
            "behaviour_amount_deviation": float(amount_dev),
            "velocity_burst_score": float(velocity_burst),
            "time_deviation_hours": float(min_time_diff),
            "location_anomaly_score": float(location_anomaly),
            "historical_risk_score": float(historical_risk),
        }
