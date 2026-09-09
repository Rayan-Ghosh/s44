"""
Baseline percentile computation for the personalized transaction-pattern
engine (apps/api/app/services/user_pattern_trainer.py).

Same design constraint as ml/profiles/user_risk_profile.py: this produces
*interpretable statistics* (percentiles, a shrunk mean/std), never a hidden
second model — the actual on-device model (when there's enough history for
one) is the separate micro IsolationForest built in
ml/training/train_user_pattern.py. This module only computes the numbers
that model is trained on, plus the three percentiles shipped as the
cold-start "quantile-json" artifact.

BAYESIAN SHRINKAGE: a user with few transactions has a noisy empirical
mean/std — three ₹50,000 transactions could be three outliers or a genuine
₹50,000 baseline, and there's no way to tell from three points alone.
Shrinking the user's mean toward an archetype prior (weighted by a virtual
sample size of 30) tempers that noise without discarding the user's own
data: as the user's real transaction count grows, the prior's influence
fades out on its own (N=30 real transactions carries equal weight to the
prior; N=300 makes the prior negligible).

PLACEHOLDER PRIORS: ARCHETYPE_PRIOR_MEAN/STD below are round, illustrative
numbers, not measured from any dataset — this repo has no user segmentation
data to calibrate them against. They exist only so a brand-new user's
shrinkage has somewhere sane to start before their own history dominates,
the same role ml/inference/fusion.py's fusion weights play before real
calibration. GENERAL matches the hardcoded default this codebase already
assumes everywhere else (ml/features/transaction_features.py's
historical_avg=1000.0/historical_std=500.0) rather than inventing a
different number for the same fallback case.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

# Plain strings, not an import of app.models.enums.UserPersonaArchetype —
# ml/ stays independent of apps/api (apps/api imports FROM ml, never the
# reverse; see ml/inference/predict.py, ml/features/*, ml/training/* for
# the existing precedent). Callers on the API side pass
# UserPersonaArchetype.value; the enum's string values are kept identical
# to these keys by construction (both list the same 8 archetypes).
ARCHETYPES = (
    "STUDENT", "SALARIED", "HOMEMAKER", "BUSINESS",
    "RETIRED_ELDERLY", "GIG_WORKER", "FARMER_RURAL", "GENERAL",
)

#: (mean, std) prior per archetype, in rupees. PLACEHOLDER — see module
#: docstring. Not derived from measured data.
ARCHETYPE_PRIORS: dict[str, tuple[float, float]] = {
    "STUDENT": (800.0, 600.0),
    "SALARIED": (3000.0, 2500.0),
    "HOMEMAKER": (1500.0, 1200.0),
    "BUSINESS": (15000.0, 20000.0),
    "RETIRED_ELDERLY": (2000.0, 1500.0),
    "GIG_WORKER": (1200.0, 1000.0),
    "FARMER_RURAL": (1000.0, 900.0),
    "GENERAL": (1000.0, 500.0),
}

#: Virtual sample size the prior counts for — see module docstring's
#: shrinkage explanation. Matches the spec's own worked formula (N=30).
SHRINKAGE_VIRTUAL_N = 30


@dataclass(frozen=True)
class Baseline:
    """Interpretable summary of one user's transaction amounts, ready to
    persist on UserFinancialProfile or ship as a quantile-json artifact."""

    count: int
    p50: float
    p90: float
    p99: float
    shrunk_mean: float
    shrunk_std: float


def compute_baseline(amounts: list[float], archetype: str) -> Baseline | None:
    """Percentiles + shrunk mean/std over `amounts` (already combining live
    Transaction rows and any StatementLedgerTransaction rows — see
    user_pattern_trainer.py). Returns None for an empty history; there is
    nothing interpretable to summarize from zero transactions."""
    if not amounts:
        return None

    sorted_amounts = sorted(amounts)
    n = len(sorted_amounts)

    p50, p90, p99 = _percentiles(sorted_amounts, (50, 90, 99))

    user_mean = statistics.fmean(amounts)
    user_std = statistics.pstdev(amounts) if n > 1 else 0.0
    prior_mean, prior_std = ARCHETYPE_PRIORS.get(archetype, ARCHETYPE_PRIORS["GENERAL"])

    shrunk_mean = (n * user_mean + SHRINKAGE_VIRTUAL_N * prior_mean) / (n + SHRINKAGE_VIRTUAL_N)
    shrunk_std = (n * user_std + SHRINKAGE_VIRTUAL_N * prior_std) / (n + SHRINKAGE_VIRTUAL_N)

    return Baseline(
        count=n,
        p50=p50,
        p90=p90,
        p99=p99,
        shrunk_mean=shrunk_mean,
        shrunk_std=max(shrunk_std, 1.0),  # never zero — downstream z-scores divide by this
    )


def _percentiles(sorted_amounts: list[float], percentiles: tuple[int, ...]) -> list[float]:
    """Nearest-rank percentile over an already-sorted list — no numpy
    dependency needed for something this small."""
    n = len(sorted_amounts)
    results = []
    for p in percentiles:
        rank = max(0, min(n - 1, round(p / 100 * (n - 1))))
        results.append(sorted_amounts[rank])
    return results
