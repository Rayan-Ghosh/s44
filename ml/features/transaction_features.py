"""
Enriched Transaction Feature Extractor for S40 Fraud Shield.

Extracts high-discrimination relative features:
1. Amount Z-score & Multi-scale Relative Ratios (7-day avg, 30-day avg, max ratio).
2. Velocity Spikes: Short-term vs long-term ratio N_10m / (N_24h / 24 + eps).
3. Rapid Successive Transfer flag (time delta < 60 seconds).
4. Cyclical time encodings (sine/cosine).
5. Recipient Novelty & Interaction Frequency.
"""

import math
from datetime import datetime, timezone
from typing import Dict, Any


class TransactionFeatureExtractor:
    """
    Extracts high-discrimination relative transaction features.
    """

    FEATURE_NAMES = [
        "amount",
        "amount_zscore",
        "amount_vs_avg_ratio",
        "amount_vs_max_ratio",
        "velocity_10m",
        "velocity_1h",
        "velocity_24h",
        "velocity_ratio_10m_24h",
        "rapid_successive_transfer",
        "time_sin",
        "time_cos",
        "recipient_novelty",
        "recipient_frequency",
    ]

    def __init__(self, eps: float = 1e-5):
        self.eps = eps

    def _parse_timestamp(self, ts: Any) -> datetime:
        if isinstance(ts, datetime):
            return ts
        if isinstance(ts, str):
            try:
                clean_ts = ts.replace("Z", "+00:00")
                return datetime.fromisoformat(clean_ts)
            except ValueError:
                pass
        return datetime.now(timezone.utc)

    def extract_features(
        self, transaction: Dict[str, Any], user_profile: Dict[str, Any]
    ) -> Dict[str, float]:
        amount = float(transaction.get("amount", 0.0))
        
        historical_avg = float(user_profile.get("normal_avg_amount", 1000.0))
        historical_std = float(user_profile.get("normal_std_amount", 500.0))
        historical_max = float(user_profile.get("historical_max_amount", 5000.0))
        
        safe_std = max(historical_std, 100.0)
        safe_avg = max(historical_avg, 10.0)
        safe_max = max(historical_max, amount)

        # 1. Multi-scale Amount Relative Deviations
        amount_zscore = (amount - historical_avg) / (safe_std + self.eps)
        amount_vs_avg_ratio = amount / (safe_avg + self.eps)
        amount_vs_max_ratio = amount / (safe_max + self.eps)

        # 2. Velocity Spikes & Rolling Windows
        velocity_10m = float(transaction.get("velocity_10m", user_profile.get("velocity_10m", 0)))
        velocity_1h = float(transaction.get("velocity_1h", user_profile.get("velocity_1h", 0)))
        velocity_24h = float(transaction.get("velocity_24h", user_profile.get("velocity_24h", 1)))

        # N_10m relative to average expected per 10m window (N_24h / 144)
        expected_10m = (velocity_24h / 144.0) + self.eps
        velocity_ratio_10m_24h = velocity_10m / expected_10m

        # 3. Rapid Successive Transfer Flag (< 60s)
        time_delta_sec = float(transaction.get("seconds_since_last_txn", transaction.get("hours_since_last_txn", 1.0) * 3600.0))
        rapid_successive = 1.0 if (0.0 < time_delta_sec < 60.0) else 0.0

        # 4. Cyclical Time Encodings
        ts = self._parse_timestamp(transaction.get("timestamp"))
        hour_float = ts.hour + (ts.minute / 60.0) + (ts.second / 3600.0)
        time_sin = math.sin(2.0 * math.pi * hour_float / 24.0)
        time_cos = math.cos(2.0 * math.pi * hour_float / 24.0)

        # 5. Recipient Novelty & Graph Interaction Context
        recipient_id = str(transaction.get("recipient_id", ""))
        frequent_recipients = user_profile.get("frequent_recipients", {})
        
        if isinstance(frequent_recipients, list):
            recipient_novelty = 0.0 if recipient_id in frequent_recipients else 1.0
            recipient_freq = 5.0 if recipient_id in frequent_recipients else 0.0
        elif isinstance(frequent_recipients, dict):
            recipient_freq = float(frequent_recipients.get(recipient_id, 0))
            recipient_novelty = 1.0 if recipient_freq == 0 else 0.0
        else:
            recipient_novelty = 1.0
            recipient_freq = 0.0

        return {
            "amount": amount,
            "amount_zscore": float(amount_zscore),
            "amount_vs_avg_ratio": float(amount_vs_avg_ratio),
            "amount_vs_max_ratio": float(amount_vs_max_ratio),
            "velocity_10m": velocity_10m,
            "velocity_1h": velocity_1h,
            "velocity_24h": velocity_24h,
            "velocity_ratio_10m_24h": float(velocity_ratio_10m_24h),
            "rapid_successive_transfer": float(rapid_successive),
            "time_sin": float(time_sin),
            "time_cos": float(time_cos),
            "recipient_novelty": float(recipient_novelty),
            "recipient_frequency": float(recipient_freq),
        }
