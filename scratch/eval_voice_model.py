"""
One-off, honest evaluation of the voice_nlp classifier via a held-out
split. The shipped ml/models/voice_nlp.joblib was trained on the FULL
synthetic dataset (see ml/training/train_voice.py) with no test set kept
aside, so there are no real metrics for it yet. This trains an identical
pipeline on an 80% train split and reports metrics on the untouched 20%
test split, plus the actual train/test class balance.
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score

from scripts.generate_synthetic_data import generate_synthetic_dataset

_, df_voice = generate_synthetic_dataset()

print(f"Total voice samples: {len(df_voice)}")
print(f"Class balance (is_scam): \n{df_voice['is_scam'].value_counts(normalize=True)}")

X = df_voice["script"].fillna("")
y = df_voice["is_scam"].values

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

pipeline = Pipeline([
    ("tfidf", TfidfVectorizer(ngram_range=(1, 3), max_features=5000, sublinear_tf=True)),
    ("clf", LogisticRegression(C=1.5, class_weight="balanced", max_iter=500, random_state=42))
])
pipeline.fit(X_train, y_train)

y_pred = pipeline.predict(X_test)
y_proba = pipeline.predict_proba(X_test)[:, 1]

print(f"\n--- Held-out test set (20%%, n={len(X_test)}) ---")
print(classification_report(y_test, y_pred, target_names=["legit", "scam"], digits=4))
print("ROC-AUC:", roc_auc_score(y_test, y_proba))
print("Confusion matrix [rows=true, cols=pred] [[TN, FP],[FN, TP]]:")
print(confusion_matrix(y_test, y_pred))
