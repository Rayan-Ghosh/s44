"""
Master End-to-End ML Pipeline Runner for S40 Fraud Shield.

Executes the full ML pipeline sequence:
1. Generates synthetic scenario datasets (Scenarios A-F).
2. Trains independent models (Fraud XGBoost, Behaviour Isolation Forest, Voice NLP).
3. Evaluates models chronologically on held-out test split.
4. Loads MLPredictor singleton and verifies real-time inference latency (<50ms).
"""

import sys
import os
import time

# Reconfigure stdout for UTF-8 encoding on Windows PowerShell
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from scripts.generate_synthetic_data import generate_synthetic_dataset
from ml.training.train_fraud import train_fraud_model
from ml.training.train_anomaly import train_anomaly_model
from ml.training.train_voice import train_voice_nlp_model
from ml.training.evaluate import evaluate_models
from ml.inference.predict import get_predictor



def run_pipeline():
    print("=================================================================")
    print("       STARTING S40 FRAUD SHIELD COMPLETE ML PIPELINE           ")
    print("=================================================================")

    # Step 1: Synthetic Data Generation
    print("\n--- STEP 1: Synthetic Data Generation ---")
    df_txns, df_voice = generate_synthetic_dataset(num_samples=50000, seed=42)



    # Step 2: Model Training
    print("\n--- STEP 2: Training Independent Sub-Models ---")
    print("--> Training Transaction Fraud XGBoost Classifier...")
    train_fraud_model(df_txns)

    print("\n--> Training Behaviour Anomaly Isolation Forest...")
    train_anomaly_model(df_txns)

    print("\n--> Training Voice Intent NLP Classifier...")
    train_voice_nlp_model(df_voice)

    # Step 3: Chronological Evaluation
    print("\n--- STEP 3: Evaluating Models & Printing Metrics ---")
    metrics = evaluate_models(df_txns)

    # Step 4: Real-Time Inference Latency Benchmarking (<50ms)
    print("\n--- STEP 4: Real-Time Inference & Latency Verification ---")
    predictor = get_predictor()

    sample_payload = {
        "transaction_id": "TXN_DEMO_999",
        "amount": 28500.0,
        "recipient_id": "RECIPIENT_NEW_88",
        "timestamp": "2026-08-15T14:30:00Z",
        "device_id": "UNKNOWN_DEVICE_XYZ",
        "location": "Mumbai",
        "voice_transcript": "Your account will be blocked immediately within 5 minutes unless you transfer money now.",
        "user_profile": {
            "normal_avg_amount": 800.0,
            "normal_std_amount": 300.0,
            "historical_max_amount": 2500.0,
            "frequent_recipients": ["RECIPIENT_1", "RECIPIENT_2"],
            "known_devices": ["KNOWN_PHONE_1"],
            "typical_locations": ["Bhubaneswar"],
        }
    }

    # Warm-up call
    _ = predictor.predict(sample_payload)

    # Measure average latency over 20 runs
    latencies = []
    for _ in range(20):
        t0 = time.perf_counter()
        result = predictor.predict(sample_payload)
        t1 = time.perf_counter()
        latencies.append((t1 - t0) * 1000.0)

    avg_latency = sum(latencies) / len(latencies)

    print("\n[SAMPLE REAL-TIME DECISION PACKAGE RESPONSE]")
    print(f" Transaction ID        : {result['transaction_id']}")
    print(f" Risk Score (0-100)    : {result['risk_score']}")
    print(f" Risk Level            : {result['risk_level']}")
    print(f" Decision Outcome      : {result['decision']}")
    print(f" Reasons               : {result['plain_language_reasons']}")
    print(f" Risk Factors          : {result['risk_factors']}")
    print(f" Contributions %       : {result['risk_contributions_pct']}")
    print(f" Sub-Scores             : {result['sub_scores']}")
    print(f" Measured Latency      : {avg_latency:.2f} ms")

    if avg_latency < 50.0:
        print(f"\n[LATENCY PASSED] Measured {avg_latency:.2f} ms < 50.0 ms limit!")
    else:
        print(f"\n[LATENCY WARNING] Measured {avg_latency:.2f} ms exceeds 50.0 ms target.")

    print("\n=================================================================")
    print("       S40 ML PIPELINE EXECUTED SUCCESSFULLY                    ")
    print("=================================================================")


if __name__ == "__main__":
    run_pipeline()
