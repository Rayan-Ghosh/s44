"""
Leakage-safe train/validation/test splitting.

The governing rule, from spec §45/§52 and restated in the Phase 3 brief:

    SPLIT FIRST -> FIT PREPROCESSING ON TRAIN ONLY -> TRANSFORM VAL/TEST

This module owns only the *split*. It deliberately does not scale,
encode, impute or resample, because doing any of those here would make it
trivially easy to fit them on the full frame before splitting — the exact
mistake the rule exists to prevent. Preprocessing belongs downstream,
fitted on `SplitResult.train` alone.

Chronological splitting is the default for transaction data. Fraud is a
moving target: a random split lets a model see the future, and the
resulting score flatters it in a way that will not survive deployment
(spec §45). Random splitting is available only via `grouped_split` for
datasets that genuinely have no ordering.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from ml.data.canonical import CanonicalColumn as C


@dataclass(frozen=True)
class SplitRatios:
    train: float = 0.70
    validation: float = 0.15
    test: float = 0.15

    def __post_init__(self) -> None:
        total = self.train + self.validation + self.test
        if not np.isclose(total, 1.0):
            raise ValueError(f"Split ratios must sum to 1.0, got {total}.")
        if min(self.train, self.validation, self.test) <= 0:
            raise ValueError("All split ratios must be positive.")


#: Spec §45's stated target.
DEFAULT_RATIOS = SplitRatios()


@dataclass(frozen=True)
class SplitResult:
    train: pd.DataFrame
    validation: pd.DataFrame
    test: pd.DataFrame
    #: How the split was produced, for the record.
    strategy: str
    order_column: str | None

    def as_dict(self) -> dict[str, pd.DataFrame]:
        return {"train": self.train, "validation": self.validation, "test": self.test}

    def sizes(self) -> dict[str, int]:
        return {k: len(v) for k, v in self.as_dict().items()}

    def positive_rates(self, target: str = C.IS_FRAUD.value) -> dict[str, float | None]:
        """Class balance per split.

        Validation and test must retain their natural distribution — any
        imbalance handling belongs to train only — so this is the check
        that proves nothing resampled the wrong partition.
        """
        rates: dict[str, float | None] = {}
        for name, frame in self.as_dict().items():
            if target not in frame.columns or frame[target].dropna().empty:
                rates[name] = None
            else:
                rates[name] = float((frame[target].dropna() == 1).mean())
        return rates


def _resolve_order_column(frame: pd.DataFrame, order_column: str | None) -> str:
    if order_column:
        if order_column not in frame.columns:
            raise ValueError(f"Order column '{order_column}' not in frame.")
        return order_column
    # Prefer real time; fall back to the dataset's ordinal.
    if C.TIMESTAMP.value in frame.columns and frame[C.TIMESTAMP.value].notna().any():
        return C.TIMESTAMP.value
    if C.TIME_INDEX.value in frame.columns and frame[C.TIME_INDEX.value].notna().any():
        return C.TIME_INDEX.value
    raise ValueError(
        "No usable ordering column: both timestamp and time_index are empty. "
        "Use grouped_split() only if this data genuinely has no temporal order."
    )


def chronological_split(
    frame: pd.DataFrame,
    ratios: SplitRatios = DEFAULT_RATIOS,
    *,
    order_column: str | None = None,
) -> SplitResult:
    """Oldest rows train, newest rows test — mimicking deployment.

    Ties on the boundary are pushed forward so that all rows sharing a
    timestamp land in the same partition. Without this, two transactions
    at the identical instant could straddle the train/test line, which is
    a subtle temporal leak.
    """
    column = _resolve_order_column(frame, order_column)
    ordered = frame.sort_values(column, kind="stable").reset_index(drop=True)
    n = len(ordered)
    if n < 3:
        raise ValueError(f"Need at least 3 rows to split three ways, got {n}.")

    train_end = int(n * ratios.train)
    val_end = train_end + int(n * ratios.validation)

    values = ordered[column]

    def push_past_ties(index: int) -> int:
        """Advance the boundary until the value changes."""
        if index <= 0 or index >= n:
            return index
        boundary = values.iloc[index - 1]
        while index < n and values.iloc[index] == boundary:
            index += 1
        return index

    train_end = push_past_ties(train_end)
    val_end = push_past_ties(max(val_end, train_end))
    val_end = min(val_end, n)

    return SplitResult(
        train=ordered.iloc[:train_end].copy(),
        validation=ordered.iloc[train_end:val_end].copy(),
        test=ordered.iloc[val_end:].copy(),
        strategy="chronological",
        order_column=column,
    )


def grouped_split(
    frame: pd.DataFrame,
    ratios: SplitRatios = DEFAULT_RATIOS,
    *,
    group_column: str = C.USER_ID.value,
    seed: int = 40,
) -> SplitResult:
    """Split by entity so no group spans partitions.

    Use when the question is "does this generalise to users it has never
    seen?" — a random row-level split would put the same user on both
    sides and quietly inflate the score.

    Deterministic for a given seed.
    """
    if group_column not in frame.columns:
        raise ValueError(f"Group column '{group_column}' not in frame.")
    groups = frame[group_column].dropna().unique()
    if len(groups) < 3:
        raise ValueError(
            f"Need at least 3 distinct '{group_column}' values, got {len(groups)}."
        )

    rng = np.random.default_rng(seed)
    shuffled = rng.permutation(groups)
    n = len(shuffled)
    train_end = int(n * ratios.train)
    val_end = train_end + int(n * ratios.validation)

    assignment = {
        "train": set(shuffled[:train_end]),
        "validation": set(shuffled[train_end:val_end]),
        "test": set(shuffled[val_end:]),
    }
    return SplitResult(
        train=frame[frame[group_column].isin(assignment["train"])].copy(),
        validation=frame[frame[group_column].isin(assignment["validation"])].copy(),
        test=frame[frame[group_column].isin(assignment["test"])].copy(),
        strategy=f"grouped:{group_column}",
        order_column=None,
    )
