"""
IEEE-CIS Dataset Advanced Processing & Training Pipeline for S40.

Implements Advanced Feature Engineering:
1. Historical user & card relative amount ratios (amount_vs_card_mean).
2. Historical velocity ratios (velocity_ratio_10m_1h, velocity_ratio_1h_24h).
3. Impossible travel velocity (distance / time delta).
4. Recipient interaction frequencies (card1 transaction counts).
5. Email domain matching (P_emaildomain == R_emaildomain).

Trains XGBoost & Isolation Forest on real IEEE-CIS data with de-fragmented DataFrames.
"""

import os
import sys
import joblib
import pandas as pd
import numpy as np
from datetime import datetime, timezone

# Reconfigure stdout for UTF-8 encoding
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from ml.training.train_fraud import train_fraud_model
from ml.training.train_anomaly import train_anomaly_model
from ml.training.evaluate import evaluate_models


ORIGINAL_DIR = os.path.join(PROJECT_ROOT, "ml", "data", "Original", "IREE fraud detection dataset")


def load_and_preprocess_ieee_cis(sample_rows: int = 50000) -> pd.DataFrame:
    """
    Loads IEEE-CIS dataset and computes strong relative features for S40.
    """
    txn_path = os.path.join(ORIGINAL_DIR, "train_transaction.csv")
    id_path = os.path.join(ORIGINAL_DIR, "train_identity.csv")

    if not os.path.exists(txn_path):
        raise FileNotFoundError(f"IEEE-CIS dataset not found at {txn_path}")

    print(f"[IEEE-CIS] Loading top {sample_rows} records from {txn_path}...")
    df_txn = pd.read_csv(txn_path, nrows=sample_rows)
    
    if os.path.exists(id_path):
        print(f"[IEEE-CIS] Merging identity data from {id_path}...")
        df_id = pd.read_csv(id_path, nrows=sample_rows)
        df = pd.merge(df_txn, df_id, on="TransactionID", how="left")
    else:
        df = df_txn

    print(f"[IEEE-CIS] Preprocessing {len(df)} rows into S40 advanced relative features...")

    # Dictionary to hold constructed features safely to avoid DataFrame fragmentation
    feats = {}

    # 1. Timestamps (TransactionDT offset in seconds)
    base_time = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    feats["timestamp"] = df["TransactionDT"].apply(lambda sec: (base_time + pd.Timedelta(seconds=sec)).isoformat())

    # 2. Amount & Relative Amount Features
    amount = df["TransactionAmt"].fillna(100.0).values
    feats["amount"] = amount
    
    # Global & Card-based statistics
    card1 = df["card1"].fillna(0).values
    card1_series = pd.Series(card1)
    amount_series = pd.Series(amount)
    
    card_mean_amount = amount_series.groupby(card1_series).transform("mean").values
    card_std_amount = amount_series.groupby(card1_series).transform("std").fillna(100.0).clip(lower=10.0).values
    card_max_amount = amount_series.groupby(card1_series).transform("max").values

    user_avg = amount.mean()
    user_std = max(amount.std(), 10.0)
    user_max = amount.max()

    feats["normal_avg_amount"] = card_mean_amount
    feats["normal_std_amount"] = card_std_amount
    feats["amount_zscore"] = (amount - card_mean_amount) / card_std_amount
    feats["amount_vs_avg_ratio"] = amount / np.clip(card_mean_amount, 1.0, None)
    feats["amount_vs_max_ratio"] = amount / np.clip(card_max_amount, 1.0, None)

    # 3. Relative Velocity & Acceleration Features
    vel_10m = df["C1"].fillna(1.0).astype(float).values
    vel_1h = df["C2"].fillna(1.0).astype(float).values
    vel_24h = df["C13"].fillna(1.0).astype(float).values

    feats["velocity_10m"] = vel_10m
    feats["velocity_1h"] = vel_1h
    feats["velocity_24h"] = vel_24h

    # Velocity Ratios & Rapid Transfers
    expected_10m = (vel_24h / 144.0) + 1e-5
    feats["velocity_ratio_10m_24h"] = vel_10m / expected_10m
    feats["velocity_ratio_10m_1h"] = vel_10m / (vel_1h + 1.0)
    feats["velocity_ratio_1h_24h"] = vel_1h / (vel_24h + 1.0)
    
    # Rapid successive transfers (<60s delta)
    time_delta_sec = df["D2"].fillna(1.0).values * 3600.0
    feats["rapid_successive_transfer"] = np.where((time_delta_sec > 0.0) & (time_delta_sec < 60.0), 1.0, 0.0)


    # 4. Cyclical time features
    hour_series = (df["TransactionDT"].values // 3600) % 24
    feats["time_sin"] = np.sin(2.0 * np.pi * hour_series / 24.0)
    feats["time_cos"] = np.cos(2.0 * np.pi * hour_series / 24.0)

    # 5. Recipient & Card Novelty + Recipient Interaction Frequency
    card_freq = amount_series.groupby(card1_series).transform("count").values
    feats["recipient_novelty"] = np.where((card1 == 0) | (card1 % 2 == 1), 1.0, 0.0)
    feats["recipient_frequency"] = card_freq.astype(float)

    # Email domain match
    p_email = df["P_emaildomain"].fillna("unknown").values
    r_email = df["R_emaildomain"].fillna("unknown").values
    feats["email_domain_match"] = np.where((p_email != "unknown") & (p_email == r_email), 1.0, 0.0)

    # 6. Physical Mobility & Impossible Travel Velocity
    dist1 = df["dist1"].fillna(0.0).values
    time_delta_h = np.clip(df["D2"].fillna(1.0).values, 0.1, None)

    feats["new_device"] = np.where(df["DeviceInfo"].isnull(), 1.0, 0.0)
    feats["device_age_days"] = df["D1"].fillna(180).astype(float).values
    feats["ip_novelty"] = np.where(df["dist1"].notnull(), 1.0, 0.0)
    feats["location_distance_km"] = dist1
    feats["impossible_travel_speed_kmh"] = dist1 / time_delta_h

    feats["os_change"] = 0.0
    feats["browser_change"] = 0.0
    feats["device_account_count"] = 1.0
    feats["voice_risk_score"] = 0.05

    # Target label and User ID
    feats["is_fraud"] = df["isFraud"].astype(int).values
    feats["user_id"] = "USER_IEEE_" + card1_series.astype(str).values

    # Construct clean, de-fragmented DataFrame
    df_clean = pd.DataFrame(feats)

    print(f"[IEEE-CIS] Mapping complete. Total fraud records: {df_clean['is_fraud'].sum()} / {len(df_clean)}")
    return df_clean


def main():
    print("=================================================================")
    print("       S40 ADVANCED ML PIPELINE - ORIGINAL IEEE-CIS DATASET      ")
    print("=================================================================")

    # Process IEEE-CIS Dataset with Advanced Feature Engineering
    df_ieee = load_and_preprocess_ieee_cis(sample_rows=50000)

    # Train Fraud XGBoost on real IEEE-CIS data
    print("\n--- STEP 1: Training XGBoost Fraud Classifier on Real IEEE-CIS Data ---")
    train_fraud_model(df_ieee)

    # Train Isolation Forest on real IEEE-CIS legitimate data
    print("\n--- STEP 2: Training Isolation Forest Anomaly Detector on Real IEEE-CIS Data ---")
    train_anomaly_model(df_ieee)

    # Precision-Recall Curve Tuning & Multi-Signal Fusion Evaluation
    print("\n--- STEP 3: Precision-Recall Curve Tuning & Multi-Signal Fusion ---")
    metrics = evaluate_models(df_ieee)

    print("\n=================================================================")
    print("       IEEE-CIS ADVANCED TRAINING & FUSION COMPLETED            ")
    print("=================================================================")


if __name__ == "__main__":
    main()
