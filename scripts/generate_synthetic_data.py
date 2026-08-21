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


def generate_synthetic_dataset(num_samples: int = 50000, seed: int = 42) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Generates enterprise-scale synthetic transaction and voice datasets (50,000+ cases).
    """
    random.seed(seed)
    np.random.seed(seed)

    base_time = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    records = []
    voice_records = []

    user_ids = [f"USER_{i:04d}" for i in range(1, 501)]

    # Rich bilingual voice scam dialogues (Hindi, English, Hinglish, regional variations)
    scam_scripts = [
        "Your bank account will be blocked immediately within 5 minutes. Transfer money to police verification account now.",
        "I am RBI Cyber Cell Officer. Your account is linked to crime. Pay 25000 fine immediately or police will arrest you.",
        "Customer care warning: Urgent security block. Provide OTP and transfer money to safety wallet now.",
        "Yeh Cyber Crime Cell New Delhi se DCP Rathore bol rahe hain. Aapke naam pe digital arrest warrant issue hua hai.",
        "Aapka mobile number aur Aadhaar card illegal courier me use hua hai. Turant clearance fund transfer kijiye.",
        "Electricity board notice: Aapka bijli connection aaj raat 9 baje disconnect ho jayega. Bill update karein.",
        "Bank KYC suspension alert: Aapka SBI account 2 ghante me permanently freeze ho jayega. Verify details.",
        "Download AnyDesk application immediately to verify your payment refund and share screen access.",
        "Do not disconnect this call. Stay on line, do not talk to family members or we will send police team.",
        "Income tax refund of Rs 45,000 approved. Pay verification fee of Rs 4,999 to release amount instantly.",
        "Lottery prize won: Send 10% processing fee to government authorized account to claim reward.",
        "FedEx Customs department: Your parcel from Mumbai contains banned narcotics. Transfer penalty deposit.",
        "TRAI telecom alert: Your SIM card will be deactivated in 1 hour due to illegal bulk messaging.",
        "Supreme Court notice: Non-bailable arrest warrant issued in financial fraud case. Settle penalty now.",
        "Loan approval desk: Instant personal loan of 5 lakhs approved. Pay processing charges of 12500 to activate.",
        "Credit card reward points expiring today. Redeem cash of Rs 18,500 by entering card details and OTP.",
        "Enforcement Directorate notice: Transfer suspicious funds to government escrow account for clearance audit.",
        "Aap akele kamre me jaiye aur kisi ko mat batayiye. Yeh confidential national security inquiry hai.",
        "Bijli vibhag: Bill bhugtan na hone par turant light cut kar di jayegi. Diye gaye number par sampark karein.",
        "Install QuickSupport app on your mobile to remove malware virus and verify banking credentials.",
        "Mumbai Crime Branch: Aapke khate se money laundering hui hai. Court fine jama karein warna jail hogi.",
        "Telegram part-time job review task: Deposit Rs 10,000 security fund to unlock your daily commission payout.",
        "RTO Challan pending notice: Vehicle impound order issued. Pay traffic challan immediately on link.",
        "LPG gas subsidy suspended: Verify bank account details and transfer Rs 100 verification fee.",
        "Aapka PAN card cancel hone wala hai. Penalty charges turant pay karein to avoid penalty fine.",
        "Aapnar bank account theke illegal money laundering hoyeche. CBI thana theke bolchi, turant security taka transfer korun.",
        "Tumchya khyatyavar police action zali ahe. Non bailable warrant cancel karaycha asel tar lagech dharohar rashi jama kara.",
        "Ungal bank account illegal parcel case-la block aagudhu. Police arrest thavirkka udane panam anupunga.",
        "Mee bank account narcotics crime tho link ayyindi. Police custody lo veyyakunda undalante ventane security amount deposit cheyyandi.",
        "Thwade account te CBI case darj hoya hai. Court challan da jurmana turant jama karwao nahi taan giraftari hovegi.",
        "Tamara bank account ma illegal hawala transactions malya che. Turant police verification fee pay karo.",
        "Nimma bank khateyannu freeze madalagide. Police arrestinda thappisikollalu koodale hana vargayisi."
    ]


    legit_scripts = [
        "Hey, sending payment for lunch yesterday.",
        "Paying monthly electricity bill.",
        "Transferring rent amount to landlord account.",
        "Payment for grocery and vegetables at supermarket.",
        "Chai and snacks payment via QR code.",
        "Paying school tuition fees for semester.",
        "Pharmacy medicine purchase payment.",
        "Cab ride fare settlement.",
        "Gym membership quarterly renewal.",
        "DTH recharge payment for 6 months.",
        "Split dinner bill with Rohit and Priya.",
        "Advance payment for home painting work.",
        "Buying train tickets on IRCTC for family vacation.",
        "Purchasing birthday gift on Amazon.",
        "Paying broadband internet monthly fiber plan.",
        "Society maintenance bill payment for August.",
        "Donation to local charitable trust.",
        "Car servicing and engine oil change payment.",
        "Movie tickets booking for weekend show.",
        "Mobile postpaid bill payment for self and spouse."
    ]


    for i in range(num_samples):
        # Chronological timestamps spaced over 180 days
        txn_time = base_time + timedelta(seconds=i * 620 + random.randint(0, 300))
        user_id = random.choice(user_ids)
        
        # Scenario allocation
        # 88% Legitimate (Scenario A, D, E, F), 12% Fraud (Scenario B, C)
        scenario = random.choices(
            ["A", "B", "C", "D", "E", "F"],
            weights=[0.60, 0.06, 0.06, 0.12, 0.08, 0.08],
            k=1
        )[0]

        is_fraud = 1 if scenario in ["B", "C"] else 0

        # User baseline profiles
        if scenario == "F":
            # Legitimate high-value user (wealthy / business owner)
            normal_avg = random.uniform(40000.0, 75000.0)
            normal_std = normal_avg * 0.35
            amount = random.uniform(25000.0, 150000.0)
            new_device = 0
            recipient_novelty = 0 if random.random() > 0.35 else 1
            velocity_10m = random.randint(1, 2)
            voice_risk = random.uniform(0.0, 0.10)
        elif scenario == "A":
            # Standard legitimate routine payment
            normal_avg = random.uniform(400.0, 1500.0)
            normal_std = normal_avg * 0.40
            amount = max(30.0, random.gauss(normal_avg, normal_std))
            new_device = 0
            recipient_novelty = 0
            velocity_10m = 1
            voice_risk = random.uniform(0.0, 0.12)
        elif scenario == "B":
            # Suspicious high amount + new recipient + new device
            normal_avg = random.uniform(300.0, 1200.0)
            normal_std = normal_avg * 0.30
            amount = random.uniform(normal_avg * 8.0, normal_avg * 35.0)
            new_device = 1
            recipient_novelty = 1
            velocity_10m = random.randint(3, 8)
            voice_risk = random.uniform(0.15, 0.45)
        elif scenario == "C":
            # Voice phishing / coercion payment
            normal_avg = random.uniform(500.0, 2000.0)
            normal_std = normal_avg * 0.35
            amount = random.uniform(5000.0, 45000.0)
            new_device = random.choice([0, 1])
            recipient_novelty = 1
            velocity_10m = random.randint(2, 6)
            voice_risk = random.uniform(0.75, 0.98)
        elif scenario == "D":
            # Legitimate unusual payment (False positive candidate / festive shopping)
            normal_avg = random.uniform(500.0, 1500.0)
            normal_std = normal_avg * 0.35
            amount = random.uniform(normal_avg * 3.0, normal_avg * 6.0)
            new_device = 0
            recipient_novelty = 1 if random.random() > 0.5 else 0
            velocity_10m = random.randint(1, 2)
            voice_risk = random.uniform(0.0, 0.15)
        else: # Scenario E
            # Device switch with verified owner
            normal_avg = random.uniform(800.0, 2500.0)
            normal_std = normal_avg * 0.35
            amount = random.uniform(500.0, 3500.0)
            new_device = 1
            recipient_novelty = 0
            velocity_10m = 1
            voice_risk = random.uniform(0.0, 0.10)

        # Mathematical feature derivations
        amount_zscore = (amount - normal_avg) / max(normal_std, 50.0)
        amount_vs_avg_ratio = amount / max(normal_avg, 10.0)
        amount_vs_max_ratio = amount / max(normal_avg * 3.5, amount)

        hour_float = txn_time.hour + (txn_time.minute / 60.0)
        time_sin = np.sin(2.0 * np.pi * hour_float / 24.0)
        time_cos = np.cos(2.0 * np.pi * hour_float / 24.0)

        location_distance_km = 0.0 if new_device == 0 else random.uniform(50.0, 850.0)
        travel_speed_kmh = location_distance_km / max(random.uniform(0.2, 2.5), 0.1)

        # Velocity metrics and ratios
        vel_10m = velocity_10m
        vel_1h = velocity_10m + random.randint(0, 4)
        vel_24h = velocity_10m + random.randint(1, 12)
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
            "recipient_frequency": 0 if recipient_novelty == 1 else random.randint(3, 25),
            "new_device": new_device,
            "device_age_days": 0 if new_device == 1 else random.randint(30, 400),
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
        if scenario == "C" or (is_fraud == 1 and random.random() > 0.2):
            script = random.choice(scam_scripts)
            is_scam = 1
        else:
            script = random.choice(legit_scripts)
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

