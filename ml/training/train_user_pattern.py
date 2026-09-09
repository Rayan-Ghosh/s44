"""
Per-user micro-model fit + on-device artifact export for the personalized
transaction-pattern engine. Called from
apps/api/app/services/user_pattern_trainer.py via
app/core/concurrency.py's TRAINING_SEMAPHORE + CPU_WORKER_POOL — this
module itself has no knowledge of the API/DB, it's a pure
amounts-in/artifact-out function, kept swappable and unit-testable the same
way ml/features/engine.py is.

TWO ARTIFACT SHAPES, chosen purely by how much history this user has:

- N < MIN_TRANSACTIONS_FOR_MODEL: no model. `fit_user_pattern` returns a
  QuantileArtifact — just the three percentiles from
  ml/profiles/user_pattern.py, compared arithmetically on-device. Fitting
  three numbers a model over is manufactured complexity for no benefit; the
  spec's own "Alternative Fallback" already proposed skipping fitting below
  a volume threshold, this just skips the ONNX step for that case too
  rather than hand-building a closed-form ONNX graph for the same three
  numbers.
- N >= MIN_TRANSACTIONS_FOR_MODEL: a micro IsolationForest
  (n_estimators=30, max_samples=64, contamination=0.03 — the spec's own
  numbers), exported via skl2onnx. Verified directly against this repo's
  installed skl2onnx/onnxruntime versions before writing this: the ONNX
  `scores` output is NOT on the same scale as sklearn's own
  score_samples()/decision_function() (skl2onnx's IsolationForest
  converter uses a different internal scoring convention) — so, exactly
  like ml/export/to_onnx.py's XGBoost export already documents for its own
  raw/calibrated scale gap, this bundles a threshold computed from the
  model's OWN training scores rather than a portable absolute number. The
  mobile client must only compare a live score against ITS bundled
  threshold, never across users or against any other model's output.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass

import numpy as np

from ml.profiles.user_pattern import Baseline, compute_baseline

MIN_TRANSACTIONS_FOR_MODEL = 30
N_ESTIMATORS = 30
MAX_SAMPLES = 64
CONTAMINATION = 0.03


@dataclass(frozen=True)
class QuantileArtifact:
    kind: str  # always "quantile-json"
    baseline: Baseline


@dataclass(frozen=True)
class OnnxArtifact:
    kind: str  # always "onnx"
    baseline: Baseline
    onnx_bytes: bytes
    elevated_threshold: float
    feature_names: tuple[str, ...]
    fit_seconds: float


def _build_features(amounts: list[float], hours: list[int], baseline: Baseline) -> np.ndarray:
    """3 features: amount, amount deviation from the shrunk mean (in shrunk
    std units — cheap, interpretable, same idea as amount_zscore elsewhere
    in this repo), and hour-of-day as a single cyclical value. Deliberately
    not the full transaction-fraud feature set (ml/features/
    transaction_features.py) — this model only ever has to distinguish
    "usual for this person" from "unusual for this person" on amount/time,
    nothing else is available from a bare amount+timestamp history."""
    amounts_arr = np.asarray(amounts, dtype=np.float32)
    zscore = (amounts_arr - baseline.shrunk_mean) / baseline.shrunk_std
    hour_cyclical = np.array(
        [math.sin(2.0 * math.pi * h / 24.0) for h in hours], dtype=np.float32
    )
    return np.column_stack([amounts_arr, zscore, hour_cyclical]).astype(np.float32)


def fit_user_pattern(
    amounts: list[float], hours: list[int], archetype: str
) -> QuantileArtifact | OnnxArtifact | None:
    """Pure function: given this user's amounts (+ the hour-of-day each
    happened) and archetype, produce the artifact to ship on-device.
    Returns None for an empty history (nothing to summarize)."""
    baseline = compute_baseline(amounts, archetype)
    if baseline is None:
        return None

    if baseline.count < MIN_TRANSACTIONS_FOR_MODEL:
        return QuantileArtifact(kind="quantile-json", baseline=baseline)

    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
    from sklearn.ensemble import IsolationForest

    features = _build_features(amounts, hours, baseline)
    feature_names = ("amount", "amount_zscore_vs_shrunk_baseline", "hour_of_day_sin")

    t0 = time.perf_counter()
    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        max_samples=min(MAX_SAMPLES, len(features)),
        contamination=CONTAMINATION,
        random_state=42,
    )
    model.fit(features)
    fit_seconds = time.perf_counter() - t0

    onnx_model = convert_sklearn(
        model,
        initial_types=[("input", FloatTensorType([None, features.shape[1]]))],
        target_opset={"": 15, "ai.onnx.ml": 3},
    )

    # Self-referential threshold — see module docstring. Verified directly
    # against this repo's installed skl2onnx/onnxruntime (not assumed from
    # docs): LOWER score = more anomalous, matching sklearn's own
    # score_samples()/decision_function() convention — an amount far
    # outside this user's history scored ~0.012 here, a typical amount
    # scored ~0.14-0.22. contamination=0.03 means ~3% of training rows are
    # expected to score as anomalous, so the elevated cutoff is the LOW
    # tail (3rd percentile) of the model's own training scores — a live
    # score AT OR BELOW this threshold is elevated, not above it.
    import onnxruntime as ort

    sess = ort.InferenceSession(onnx_model.SerializeToString())
    output_name = sess.get_outputs()[-1].name
    train_scores = sess.run([output_name], {"input": features})[0].reshape(-1)
    elevated_threshold = float(np.percentile(train_scores, CONTAMINATION * 100.0))

    return OnnxArtifact(
        kind="onnx",
        baseline=baseline,
        onnx_bytes=onnx_model.SerializeToString(),
        elevated_threshold=elevated_threshold,
        feature_names=feature_names,
        fit_seconds=fit_seconds,
    )
