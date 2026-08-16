"""
Probability calibration.

WHY THIS MATTERS FOR S40 SPECIFICALLY
    The fusion engine (Phase 6) will combine this model's output with
    anomaly, device, voice and rule signals. Combining numbers that are
    not on a comparable probability scale produces a weighted average of
    incommensurable quantities. So the fusion layer must know whether it is
    receiving a true probability or merely a ranking score — and this
    module answers that question with a measurement rather than an
    assumption.

THE COMPLICATION
    `scale_pos_weight` reweights the positive class to combat imbalance.
    That deliberately distorts the output scale: the model is trained as
    if fraud were far more common than it is, so raw probabilities are
    systematically inflated. Good ranking, poor calibration — exactly the
    situation calibration exists for.

METHOD AND ITS HONEST LIMITATION
    The calibrator is fitted on VALIDATION predictions. The test set is
    never involved (Critical Rule #5). Validation is therefore reused for
    early stopping, threshold selection and calibration, which is a mild
    form of reuse — with more positives a dedicated calibration split
    would be preferable. Recorded here rather than glossed over.

    Calibration is applied ONLY if it measurably improves expected
    calibration error on validation. Otherwise the raw model ships and the
    artifact records `calibrated: false`.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

from ml.training.evaluate import calibration_bins, expected_calibration_error


@dataclass(frozen=True)
class CalibrationReport:
    method: str
    applied: bool
    raw_ece: float
    calibrated_ece: float | None
    raw_bins: list[dict]
    calibrated_bins: list[dict] | None
    rationale: str

    def to_dict(self) -> dict:
        return {
            "method": self.method,
            "applied": self.applied,
            "raw_ece": self.raw_ece,
            "calibrated_ece": self.calibrated_ece,
            "raw_bins": self.raw_bins,
            "calibrated_bins": self.calibrated_bins,
            "rationale": self.rationale,
        }


class Calibrator:
    """Wraps a fitted 1-D probability calibration map."""

    def __init__(self, method: str, model) -> None:
        self.method = method
        self._model = model

    def transform(self, probabilities: np.ndarray) -> np.ndarray:
        p = np.asarray(probabilities, dtype=float).reshape(-1, 1)
        if self.method == "isotonic":
            return np.clip(self._model.predict(p.ravel()), 0.0, 1.0)
        # Platt scaling: logistic regression on the raw probability.
        return np.clip(self._model.predict_proba(p)[:, 1], 0.0, 1.0)


def fit_calibrator(y_true, y_prob, method: str = "isotonic") -> Calibrator:
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob, dtype=float)

    if method == "isotonic":
        model = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
        model.fit(y_prob, y_true)
        return Calibrator("isotonic", model)
    if method == "platt":
        model = LogisticRegression(max_iter=1000)
        model.fit(y_prob.reshape(-1, 1), y_true)
        return Calibrator("platt", model)
    raise ValueError(f"Unknown calibration method '{method}'.")


def assess_calibration(
    y_validation,
    raw_validation_prob,
    *,
    method: str = "isotonic",
    min_improvement: float = 0.005,
) -> tuple[Calibrator | None, CalibrationReport]:
    """Decide, from evidence, whether calibration should be applied.

    Returns (calibrator or None, report). The calibrator is returned only
    when it improves ECE by more than `min_improvement` — a small gain is
    not worth the extra moving part and the risk of overfitting the
    calibration map to a few hundred validation positives.
    """
    raw_ece = expected_calibration_error(y_validation, raw_validation_prob)
    raw_bins = calibration_bins(y_validation, raw_validation_prob)

    calibrator = fit_calibrator(y_validation, raw_validation_prob, method=method)
    calibrated_prob = calibrator.transform(raw_validation_prob)
    calibrated_ece = expected_calibration_error(y_validation, calibrated_prob)
    calibrated_bins = calibration_bins(y_validation, calibrated_prob)

    improvement = raw_ece - calibrated_ece
    applied = improvement > min_improvement

    rationale = (
        f"Raw ECE {raw_ece:.4f} vs {method} ECE {calibrated_ece:.4f} "
        f"(improvement {improvement:+.4f}). "
        + (
            f"Applied because the improvement exceeds {min_improvement}."
            if applied
            else f"NOT applied: improvement does not exceed {min_improvement}, so "
            f"the raw model ships and the extra component is avoided."
        )
        + " Fitted on validation; the test set was not involved. "
        "IMPORTANT: the calibrated ECE above is measured on the same "
        "validation data the calibrator was fitted on, so it is "
        "optimistically biased and will tend toward zero by construction "
        "(isotonic regression can fit validation almost exactly). Treat the "
        "held-out test ECE as the only trustworthy calibration estimate."
    )

    report = CalibrationReport(
        method=method,
        applied=applied,
        raw_ece=float(raw_ece),
        calibrated_ece=float(calibrated_ece),
        raw_bins=raw_bins,
        calibrated_bins=calibrated_bins,
        rationale=rationale,
    )
    return (calibrator if applied else None), report
