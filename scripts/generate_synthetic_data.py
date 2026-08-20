"""
Synthetic Data Generator for S40 Fraud Shield.

Generates realistic tabular datasets covering Scenarios A-F:
- Scenario A: Legitimate routine payment (Low Risk)
- Scenario B: Suspicious high amount + new recipient + new device (High Risk)
- Scenario C: Voice phishing / coercion payment (High Risk)
- Scenario D: Legitimate unusual payment / False positive candidate (Medium/High Risk)
- Scenario E: Device switch with verified owner (Medium Risk)
- Scenario F: Legitimate high-value user (High amount, but normal for user profile)

Outputs synthetic training and test CSV files into ml/data/synthetic/.
"""

import os
import sys
import json
import random
import numpy as np
import pandas as pd
from datetime import datetime, timedelta, timezone
from typing import Tuple

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Ensure target directories exist
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "ml", "data", "synthetic")
os.makedirs(DATA_DIR, exist_ok=True)


def generate_synthetic_dataset(num_samples: int = 2000, seed: int = 42) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Generates synthetic transaction and voice datasets with chronological timestamps.
    """
    random.seed(seed)
    np.random.seed(seed)

    base_time = datetime(2026, 8, 1, 0, 0, 0, tzinfo=timezone.utc)
    records = []
    voice_records = []

    user_ids = [f"USER_{i:03d}" for i in range(1, 51)]

    for i in range(num_samples):
        # Chronological timestamps spaced over 14 days
        txn_time = base_time + timedelta(seconds=i * 600 + random.randint(0, 300))
        user_id = random.choice(user_ids)
        
        # Scenario allocation
        # 85% Legitimate (Scenario A, F), 15% Fraud (Scenario B, C)
        scenario = random.choices(
            ["A", "B", "C", "D", "E", "F"],
            weights=[0.65, 0.08, 0.07, 0.10, 0.05, 0.05],
            k=1
        )[0]

        is_fraud = 1 if scenario in ["B", "C"] else 0

        # User baseline profiles
        if scenario == "F":
            # Legitimate high-value user (wealthy / business owner)
            normal_avg = 50000.0
            normal_std = 15000.0
            amount = random.uniform(30000.0, 120000.0)
            new_device = 0
            recipient_novelty = 0 if random.random() > 0.3 else 1
            velocity_10m = random.randint(1, 2)
            voice_risk = 0.05
        elif scenario == "A":
            # Standard legitimate routine payment
            normal_avg = 800.0
            normal_std = 350.0
            amount = max(50.0, random.gauss(normal_avg, normal_std))
            new_device = 0
            recipient_novelty = 0
            velocity_10m = 1
            voice_risk = random.uniform(0.0, 0.15)
        elif scenario == "B":
            # Suspicious high amount + new recipient + new device
            normal_avg = 500.0
            normal_std = 200.0
            amount = random.uniform(15000.0, 45000.0)
            new_device = 1
            recipient_novelty = 1
            velocity_10m = random.randint(3, 7)
            voice_risk = random.uniform(0.1, 0.4)
        elif scenario == "C":
            # Voice phishing / coercion payment
            normal_avg = 1000.0
            normal_std = 400.0
            amount = random.uniform(8000.0, 30000.0)
            new_device = random.choice([0, 1])
            recipient_novelty = 1
            velocity_10m = random.randint(2, 5)
            voice_risk = random.uniform(0.75, 0.98)
        elif scenario == "D":
            # Legitimate unusual payment (False positive candidate)
            normal_avg = 600.0
            normal_std = 250.0
            amount = random.uniform(4000.0, 12000.0)
            new_device = 0
            recipient_novelty = 1
            velocity_10m = 1
            voice_risk = random.uniform(0.0, 0.2)
        else: # Scenario E
            # Device switch with verified owner
            normal_avg = 1200.0
            normal_std = 400.0
            amount = random.uniform(1000.0, 3000.0)
            new_device = 1
            recipient_novelty = 0
            velocity_10m = 1
            voice_risk = random.uniform(0.0, 0.1)

        # Mathematical feature derivations
        amount_zscore = (amount - normal_avg) / max(normal_std, 50.0)
        amount_vs_avg_ratio = amount / max(normal_avg, 10.0)
        amount_vs_max_ratio = amount / max(normal_avg * 3.0, amount)

        hour_float = txn_time.hour + (txn_time.minute / 60.0)
        time_sin = np.sin(2.0 * np.pi * hour_float / 24.0)
        time_cos = np.cos(2.0 * np.pi * hour_float / 24.0)

        location_distance_km = 0.0 if new_device == 0 else random.uniform(50.0, 600.0)
        travel_speed_kmh = location_distance_km / max(random.uniform(0.2, 2.0), 0.1)
        impossible_travel = 1 if travel_speed_kmh > 800.0 else 0

        # Velocity metrics and ratios
        vel_10m = velocity_10m
        vel_1h = velocity_10m + random.randint(0, 3)
        vel_24h = velocity_10m + random.randint(1, 10)
        expected_10m = (vel_24h / 144.0) + 1e-5

        time_delta_sec = random.uniform(10.0, 7200.0)
        rapid_successive = 1.0 if time_delta_sec < 60.0 else 0.0

        record = {
            "transaction_id": f"TXN_{i:06d}",
            "timestamp": txn_time.isoformat(),
            "user_id": user_id,
            "scenario": scenario,
            "amount": round(amount, 2),
            "normal_avg_amount": round(normal_avg, 2),
            "normal_std_amount": round(normal_std, 2),
            "amount_zscore": round(amount_zscore, 4),
            "amount_vs_avg_ratio": round(amount_vs_avg_ratio, 4),
            "amount_vs_max_ratio": round(amount_vs_max_ratio, 4),
            "velocity_10m": vel_10m,
            "velocity_1h": vel_1h,
            "velocity_24h": vel_24h,
            "velocity_ratio_10m_24h": round(vel_10m / expected_10m, 4),
            "rapid_successive_transfer": rapid_successive,
            "time_sin": round(time_sin, 4),

            "time_cos": round(time_cos, 4),
            "recipient_novelty": recipient_novelty,
            "recipient_frequency": 0 if recipient_novelty == 1 else random.randint(3, 20),
            "new_device": new_device,
            "device_age_days": 0 if new_device == 1 else random.randint(30, 365),
            "ip_novelty": new_device,
            "location_distance_km": round(location_distance_km, 2),
            "impossible_travel_speed_kmh": round(travel_speed_kmh, 2),
            "os_change": new_device,
            "browser_change": new_device,
            "device_account_count": 1 if new_device == 0 else random.randint(1, 4),
            "voice_risk_score": round(voice_risk, 4),
            "is_fraud": is_fraud,
        }
        records.append(record)

        # Voice script data
        if scenario == "C":
            script = random.choice([
                "Your bank account will be blocked immediately within 5 minutes. Transfer money to police verification account now.",
                "I am RBI Cyber Cell Officer. Your account is linked to crime. Pay 25000 fine immediately or police will arrest you.",
                "Customer care warning: Urgent security block. Provide OTP and transfer money to safety wallet now."
            ])
            is_scam = 1
        else:
            script = random.choice([
                "Hey, sending payment for lunch yesterday.",
                "Paying monthly electricity bill.",
                "Transferring rent amount to landlord account."
            ])
            is_scam = 0

        voice_records.append({
            "transaction_id": record["transaction_id"],
            "script": script,
            "is_scam": is_scam
        })

    df_txns = pd.DataFrame(records)
    df_voice = pd.DataFrame(voice_records)

    # Save to CSV
    txn_path = os.path.join(DATA_DIR, "transactions_synthetic.csv")
    voice_path = os.path.join(DATA_DIR, "voice_scripts_synthetic.csv")

    df_txns.to_csv(txn_path, index=False)
    df_voice.to_csv(voice_path, index=False)

    print(f"[DATA GENERATOR] Successfully generated {len(df_txns)} transactions at {txn_path}")
    print(f"[DATA GENERATOR] Successfully generated {len(df_voice)} voice scripts at {voice_path}")

    return df_txns, df_voice


if __name__ == "__main__":
    generate_synthetic_dataset()
