"""
S40 behaviour anomaly detector (Isolation Forest).

ANSWERS A DIFFERENT QUESTION FROM THE FRAUD MODEL
    Fraud model:   "does this look like fraud, as labelled in training data?"
    Anomaly model: "is this unusual FOR THIS USER, regardless of labels?"

Spec §40 is explicit that these are distinct: a transaction can look
perfectly ordinary globally while being wildly out of character for one
individual, and only the second model catches that. The two outputs meet
at fusion (spec §12), never here.

WHY UNSUPERVISED, TRAINED ON NORMAL BEHAVIOUR ONLY
    Isolation Forest learns the shape of ordinary activity and flags points
    that are easy to isolate from it. Feeding it fraud rows would teach it
    that fraud is normal. Training therefore uses NON-FRAUD rows only —
    which is also what makes this detector useful where labels are scarce
    (spec §10: "detect behaviour that is unusual even when there is
    insufficient labelled fraud data").

COLD START IS A REFUSAL, NOT A SCORE
    Deviation features are undefined for a user without history. sklearn's
    IsolationForest cannot accept NaN, and imputing would silently invent a
    baseline. This model therefore REFUSES to score cold-start users and
    says so, rather than emitting a confident-looking number derived from
    nothing. Consumers get `scorable=False` and a reason.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from ml.training.config import DEFAULT_SEED

#: Behavioural features only.
#:
#: Deliberately EXCLUDES device features: device risk is a separate
#: detector in the S40 architecture (spec §41, deterministic rules), and
#: duplicating its signal here would double-count it at fusion — the exact
#: hazard spec §12 warns about.
#:
#: Also excludes `profile_is_cold` and `user_transaction_count`: those
#: describe how much history exists, not how the user behaves. Cold start
#: is handled by refusing to score, not by feeding the model a flag.
BEHAVIOUR_FEATURES: tuple[str, ...] = (
    "amount_zscore",
    "amount_vs_average",
    "recipient_seen_before",
    "recipient_frequency",
    "time_of_day_deviation",
    "seconds_since_last_transaction",
    "transactions_last_10m",
    "transactions_last_1h",
    "location_deviation",
)


@dataclass(frozen=True)
class ScoreNormalizer:
    """Maps raw Isolation Forest output onto a stable [0, 1] scale.

    `score_samples` returns an unbounded, model-specific quantity where
    LOWER means more anomalous — useless as a fusion input, since its range
    shifts with every retrain. This calibrates against the training
    distribution of normal behaviour so that:

        0.0  =  as ordinary as the most ordinary training behaviour
        1.0  =  at least as unusual as the most extreme training point

    Percentiles (not min/max) define the endpoints so that a single freak
    training row cannot compress the whole scale.
    """

    low: float
    high: float

    def transform(self, raw: np.ndarray) -> np.ndarray:
        span = self.high - self.low
        if span <= 1e-12:
            # Degenerate training distribution: refuse to fabricate spread.
            return np.zeros_like(np.asarray(raw, dtype=float))
        return np.clip((np.asarray(raw, dtype=float) - self.low) / span, 0.0, 1.0)

    def to_dict(self) -> dict:
        return {"low": self.low, "high": self.high}


@dataclass(frozen=True)
class TrainedAnomalyModel:
    forest: IsolationForest
    normalizer: ScoreNormalizer
    feature_names: tuple[str, ...]
    params: dict
    training_rows: int

    def raw_scores(self, X: pd.DataFrame) -> np.ndarray:
        """Higher = more anomalous (sign-flipped from sklearn's convention)."""
        return -self.forest.score_samples(X[list(self.feature_names)])

    def anomaly_score(self, X: pd.DataFrame) -> np.ndarray:
        """Normalized anomaly score in [0, 1]."""
        return self.normalizer.transform(self.raw_scores(X))


def scorable_mask(frame: pd.DataFrame) -> pd.Series:
    """Rows whose behavioural features are all present.

    A row is unscorable when the user has too little history for deviation
    features to exist. That is a legitimate state, not bad data.
    """
    present = [c for c in BEHAVIOUR_FEATURES if c in frame.columns]
    return frame[present].notna().all(axis=1)


def select_behaviour_features(frame: pd.DataFrame) -> pd.DataFrame:
    missing = [c for c in BEHAVIOUR_FEATURES if c not in frame.columns]
    if missing:
        raise ValueError(f"Frame is missing behaviour features: {missing}")
    return frame.loc[:, list(BEHAVIOUR_FEATURES)].astype("float64")


def train_anomaly_model(
    frame: pd.DataFrame,
    *,
    target_column: str = "is_fraud",
    seed: int = DEFAULT_SEED,
    n_estimators: int = 300,
    max_samples: int | str = "auto",
    contamination: float | str = "auto",
) -> TrainedAnomalyModel:
    """Fit Isolation Forest on scorable, NON-FRAUD rows of `frame`.

    `frame` must be a TRAIN split only. Nothing here touches validation or
    test, and no statistic is fitted on data the model will later be
    evaluated against.
    """
    scorable = scorable_mask(frame)
    if target_column in frame.columns:
        normal = frame[target_column].astype("float64") != 1
    else:
        normal = pd.Series(True, index=frame.index)

    fit_rows = frame[scorable & normal]
    if len(fit_rows) < 50:
        raise ValueError(
            f"Only {len(fit_rows)} scorable normal rows available; too few to "
            f"characterise ordinary behaviour."
        )

    X = select_behaviour_features(fit_rows)
    forest = IsolationForest(
        n_estimators=n_estimators,
        max_samples=max_samples,
        contamination=contamination,
        random_state=seed,
        n_jobs=1,
    )
    forest.fit(X)

    # Calibrate the output scale against the same normal-behaviour
    # distribution the forest was fitted on.
    raw = -forest.score_samples(X)
    normalizer = ScoreNormalizer(
        low=float(np.percentile(raw, 5)), high=float(np.percentile(raw, 99.5))
    )

    return TrainedAnomalyModel(
        forest=forest,
        normalizer=normalizer,
        feature_names=BEHAVIOUR_FEATURES,
        params={
            "n_estimators": n_estimators,
            "max_samples": str(max_samples),
            "contamination": str(contamination),
            "seed": seed,
            "trained_on": "scorable non-fraud rows of the train split",
        },
        training_rows=int(len(fit_rows)),
    )


def evaluate_separation(
    model: TrainedAnomalyModel, frame: pd.DataFrame, *, target_column: str = "is_fraud"
) -> dict:
    """How well anomaly score separates fraud from normal on a split.

    NOT a classification metric claim: the model never saw labels. This
    measures whether "unusual for this user" correlates with "fraudulent",
    which is the property that makes the signal worth fusing at all.
    """
    from sklearn.metrics import average_precision_score, roc_auc_score

    scorable = scorable_mask(frame)
    subset = frame[scorable]
    if subset.empty:
        return {"scorable_rows": 0, "note": "no scorable rows"}

    scores = model.anomaly_score(select_behaviour_features(subset))
    result = {
        "rows": int(len(frame)),
        "scorable_rows": int(len(subset)),
        "unscorable_rows": int(len(frame) - len(subset)),
        "mean_score": float(scores.mean()),
    }

    if target_column in subset.columns:
        y = subset[target_column].astype("float64").fillna(0).astype(int).to_numpy()
        result["positives_among_scorable"] = int(y.sum())
        if 0 < y.sum() < len(y):
            result["roc_auc"] = float(roc_auc_score(y, scores))
            result["pr_auc"] = float(average_precision_score(y, scores))
            result["mean_score_fraud"] = float(scores[y == 1].mean())
            result["mean_score_normal"] = float(scores[y == 0].mean())
        else:
            result["roc_auc"] = None
            result["pr_auc"] = None
    return result
