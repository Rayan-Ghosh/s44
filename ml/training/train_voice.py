"""
Voice Intent & Social Engineering Classifier Training Pipeline for S40.

Trains a local NLP classifier (TF-IDF + Calibrated Linear SVM) on call transcripts
to detect voice phishing indicators, urgency, and coercion.
Saves serialized model artifact to ml/models/voice_nlp.joblib.
"""

import os
import sys
import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(MODEL_DIR, exist_ok=True)


def train_voice_nlp_model(df_voice: pd.DataFrame) -> Pipeline:
    """
    Trains TF-IDF + Logistic Regression text classification pipeline.
    """
    X_text = df_voice["script"].fillna("")
    y = df_voice["is_scam"].values

    print(f"[TRAIN VOICE NLP] Training local NLP model on {len(df_voice)} voice scripts...")

    nlp_pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), max_features=1000)),
        ("clf", LogisticRegression(C=1.0, class_weight="balanced", random_state=42))
    ])

    nlp_pipeline.fit(X_text, y)

    model_path = os.path.join(MODEL_DIR, "voice_nlp.joblib")
    joblib.dump(nlp_pipeline, model_path)

    print(f"[TRAIN VOICE NLP] Voice NLP pipeline saved to {model_path}")
    return nlp_pipeline


if __name__ == "__main__":
    from scripts.generate_synthetic_data import generate_synthetic_dataset
    _, df_voice = generate_synthetic_dataset()
    train_voice_nlp_model(df_voice)
