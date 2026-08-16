"""
Evaluation metrics.

Accuracy is deliberately NOT the headline. At a ~3% positive rate a model
that predicts "never fraud" scores ~97% accurate while catching nothing,
so spec §47 prioritises recall, precision, PR-AUC and false-positive rate.
PR-AUC is the primary model-selection metric because, unlike ROC-AUC, it
does not get flattered by the enormous true-negative pool.

Every number produced here comes from an actual computation on actual
predictions. Nothing in this module has a hard-coded metric.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    roc_auc_score,
)


@dataclass(frozen=True)
class ThresholdMetrics:
    """Metrics at one operating threshold."""

    threshold: float
    true_positives: int
    false_positives: int
    true_negatives: int
    false_negatives: int
    precision: float
    recall: float
    f1: float
    specificity: float
    false_positive_rate: float
    false_negative_rate: float

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class EvaluationResult:
    """Threshold-independent metrics plus a chosen operating point."""

    split: str
    rows: int
    positives: int
    positive_rate: float
    roc_auc: float | None
    pr_auc: float
    brier: float
    at_threshold: ThresholdMetrics

    def to_dict(self) -> dict:
        return {
            "split": self.split,
            "rows": self.rows,
            "positives": self.positives,
            "positive_rate": self.positive_rate,
            "roc_auc": self.roc_auc,
            "pr_auc": self.pr_auc,
            "brier": self.brier,
            "at_threshold": self.at_threshold.to_dict(),
        }


def threshold_metrics(y_true, y_prob, threshold: float) -> ThresholdMetrics:
    y_true = np.asarray(y_true).astype(int)
    y_pred = (np.asarray(y_prob) >= threshold).astype(int)

    matrix = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = (int(v) for v in matrix.ravel())

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    specificity = tn / (tn + fp) if (tn + fp) else 0.0

    return ThresholdMetrics(
        threshold=float(threshold),
        true_positives=tp,
        false_positives=fp,
        true_negatives=tn,
        false_negatives=fn,
        precision=float(precision),
        recall=float(recall),
        f1=float(f1),
        specificity=float(specificity),
        false_positive_rate=float(fp / (fp + tn)) if (fp + tn) else 0.0,
        false_negative_rate=float(fn / (fn + tp)) if (fn + tp) else 0.0,
    )


def evaluate(y_true, y_prob, *, split: str, threshold: float = 0.5) -> EvaluationResult:
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob, dtype=float)

    positives = int(y_true.sum())
    # ROC-AUC is undefined with a single class present; report None rather
    # than a fabricated value.
    roc = float(roc_auc_score(y_true, y_prob)) if 0 < positives < len(y_true) else None

    return EvaluationResult(
        split=split,
        rows=int(len(y_true)),
        positives=positives,
        positive_rate=float(positives / len(y_true)) if len(y_true) else 0.0,
        roc_auc=roc,
        pr_auc=float(average_precision_score(y_true, y_prob)),
        brier=float(brier_score_loss(y_true, y_prob)),
        at_threshold=threshold_metrics(y_true, y_prob, threshold),
    )


def threshold_sweep(y_true, y_prob, thresholds=None) -> list[ThresholdMetrics]:
    """Operating-point behaviour across candidate thresholds.

    Intended for VALIDATION data only. Selecting a threshold on test would
    contaminate the final evaluation (Critical Rule #5).
    """
    if thresholds is None:
        thresholds = [round(t, 2) for t in np.arange(0.05, 0.96, 0.05)]
    return [threshold_metrics(y_true, y_prob, t) for t in thresholds]


def best_threshold_by_f1(sweep: list[ThresholdMetrics]) -> ThresholdMetrics:
    """Pick the operating point with the highest F1.

    F1 balances catching fraud against annoying legitimate users — the
    trade-off spec §2 names explicitly ("avoid unnecessarily blocking
    legitimate transactions"). It is a defensible default, NOT a claim
    that F1 is the right business objective; the fusion/decision engine
    (Phase 6) owns that call with real cost figures.
    """
    if not sweep:
        raise ValueError("Empty threshold sweep.")
    return max(sweep, key=lambda m: (m.f1, m.recall))


def calibration_bins(y_true, y_prob, bins: int = 10) -> list[dict]:
    """Reliability table: predicted probability vs observed frequency.

    A well-calibrated model's mean prediction in each bin should track the
    observed fraud rate. This is what tells the future fusion engine
    whether it is receiving a real probability or just a ranking score.
    """
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob, dtype=float)

    edges = np.linspace(0.0, 1.0, bins + 1)
    rows: list[dict] = []
    for i in range(bins):
        low, high = edges[i], edges[i + 1]
        mask = (y_prob >= low) & (y_prob < high if i < bins - 1 else y_prob <= high)
        count = int(mask.sum())
        if count == 0:
            continue
        rows.append(
            {
                "bin_low": float(low),
                "bin_high": float(high),
                "count": count,
                "mean_predicted": float(y_prob[mask].mean()),
                "observed_rate": float(y_true[mask].mean()),
            }
        )
    return rows


def expected_calibration_error(y_true, y_prob, bins: int = 10) -> float:
    """Weighted mean gap between predicted probability and observed rate."""
    table = calibration_bins(y_true, y_prob, bins)
    total = sum(row["count"] for row in table)
    if not total:
        return 0.0
    return float(
        sum(
            row["count"] / total * abs(row["mean_predicted"] - row["observed_rate"])
            for row in table
        )
    )
