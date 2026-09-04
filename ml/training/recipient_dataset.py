"""
Blended, recipient-centric training data assembly (2026-09-04 real-data
retraining pass).

Distinct from ml/training/dataset.py's build_training_data, which serves
S40's ORIGINAL per-user (USER_ID-keyed) 13-feature model and stays
synthetic-only for the documented reason in its own docstring. This module
builds the dataset for the NEW model described in
ml/features/recipient_features.py: majority real data (PaySim +
the Indian Online Scam dataset), a minority synthetic slice, using
recipient-keyed features instead of user-keyed ones.

Splitting: each source is split chronologically (70/15/15) INDEPENDENTLY,
then the train/validation/test parts are concatenated. A single
chronological axis across PaySim's simulated 31-day window, the Indian
dataset's 2023-24 timestamps, and S40 synthetic's generated dates would be
meaningless — there is no shared clock across unrelated data sources. This
is a deliberate, explained deviation from single-axis chronological
splitting, not an oversight.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from ml.data.adapters import IndianScamAdapter, PaySimAdapter, SyntheticAdapter
from ml.data.canonical import CanonicalColumn as C
from ml.data.generators.synthetic_generator import SyntheticConfig
from ml.data.registry import get as registry_get
from ml.data.splits import DEFAULT_RATIOS, SplitRatios, chronological_split
from ml.datasets.preparation import ModelTarget, assert_pairing_allowed
from ml.features.recipient_features import (
    RECIPIENT_MODEL_FEATURE_NAMES,
    compute_recipient_features,
    select_recipient_features,
)
from ml.training.target import assert_label_compatible, extract_target


@dataclass(frozen=True)
class BlendConfig:
    """Controls the real:synthetic ratio and per-source row caps."""

    seed: int = 40
    #: Target share of the FINAL blended row count that is synthetic.
    #: 0.10-0.20 per the project owner's instruction; default the midpoint.
    synthetic_fraction: float = 0.15
    #: PaySim is 6.36M rows, ~0.13% fraud — capped well below the full file
    #: both for tractability AND so its near-total absence of positives
    #: doesn't swamp the higher-information-density Indian dataset's
    #: signal. Sampled from the START of the file (chronological — PaySim's
    #: `step` is already time ordered), not randomly, so the per-recipient
    #: history the feature computation depends on stays intact.
    paysim_row_cap: int = 150_000
    ratios: SplitRatios = field(default_factory=lambda: DEFAULT_RATIOS)
    synthetic_users: int = 800
    synthetic_history_per_user: int = 25


@dataclass(frozen=True)
class SourceSplit:
    name: str
    train: pd.DataFrame
    validation: pd.DataFrame
    test: pd.DataFrame
    row_count: int
    fraud_rate: float


@dataclass(frozen=True)
class BlendedTrainingData:
    train: pd.DataFrame
    validation: pd.DataFrame
    test: pd.DataFrame
    feature_names: tuple[str, ...]
    source_reports: list[SourceSplit]
    blend_report: dict


def _load_and_feature(name: str, adapter, path=None) -> pd.DataFrame:
    """adapter.load(path) or adapter.generate() -> compute_recipient_features."""
    if path is not None:
        result = adapter.load(path)
    else:
        result = adapter.generate()
    featured = compute_recipient_features(result.frame, result.availability)
    return featured


def _split_source(name: str, featured: pd.DataFrame, ratios: SplitRatios, order_column: str) -> SourceSplit:
    labeled = featured.dropna(subset=[C.IS_FRAUD.value]).reset_index(drop=True)
    split = chronological_split(labeled, ratios, order_column=order_column)
    fraud_rate = float(labeled[C.IS_FRAUD.value].mean()) if len(labeled) else 0.0
    return SourceSplit(
        name=name,
        train=split.train,
        validation=split.validation,
        test=split.test,
        row_count=len(labeled),
        fraud_rate=fraud_rate,
    )


def build_blended_training_data(config: BlendConfig | None = None) -> BlendedTrainingData:
    config = config or BlendConfig()

    assert_pairing_allowed(ModelTarget.TRANSACTION_FRAUD, "paysim")
    assert_pairing_allowed(ModelTarget.TRANSACTION_FRAUD, "indian_online_scam")
    assert_pairing_allowed(ModelTarget.TRANSACTION_FRAUD, "s40_synthetic")
    assert_label_compatible("paysim")
    assert_label_compatible("indian_online_scam")

    # --- Indian Online Scam (real, primary) ---------------------------------
    indian_featured = _load_and_feature(
        "indian_online_scam", IndianScamAdapter(), registry_get("indian_online_scam").local_path()
    )
    indian_split = _split_source("indian_online_scam", indian_featured, config.ratios, C.TIMESTAMP.value)

    # --- PaySim (real) -------------------------------------------------------
    paysim_raw = pd.read_csv(
        registry_get("paysim").local_path(), nrows=config.paysim_row_cap
    )
    paysim_adapter = PaySimAdapter()
    paysim_canonical = paysim_adapter.to_canonical(paysim_raw)
    paysim_featured = compute_recipient_features(paysim_canonical.frame, paysim_canonical.availability)
    paysim_split = _split_source("paysim", paysim_featured, config.ratios, C.TIME_INDEX.value)

    # --- S40 synthetic (minority) --------------------------------------------
    real_row_total = indian_split.row_count + paysim_split.row_count
    # synthetic_fraction of the FINAL blend: synthetic / (real + synthetic) = f
    # => synthetic = f * real / (1 - f)
    target_synthetic_rows = int(
        config.synthetic_fraction * real_row_total / max(1e-6, (1 - config.synthetic_fraction))
    )
    # SyntheticConfig users->rows isn't 1:1 (history + scenario rows per user);
    # oversize the generation request and trim down to the target after.
    synth_users = max(50, int(target_synthetic_rows / 25) + 10)
    synthetic_featured = _load_and_feature(
        "s40_synthetic",
        SyntheticAdapter(SyntheticConfig(seed=config.seed, users=synth_users, history_per_user=config.synthetic_history_per_user)),
    )
    synthetic_split = _split_source("s40_synthetic", synthetic_featured, config.ratios, C.TIMESTAMP.value)

    def _trim(frame: pd.DataFrame, frac: float) -> pd.DataFrame:
        n = int(len(frame) * frac)
        return frame.iloc[:n].reset_index(drop=True) if n < len(frame) else frame

    synth_trim_frac = min(1.0, target_synthetic_rows / max(1, synthetic_split.row_count))
    synth_train = _trim(synthetic_split.train, synth_trim_frac)
    synth_val = _trim(synthetic_split.validation, synth_trim_frac)
    synth_test = _trim(synthetic_split.test, synth_trim_frac)

    train = pd.concat([indian_split.train, paysim_split.train, synth_train], ignore_index=True)
    validation = pd.concat([indian_split.validation, paysim_split.validation, synth_val], ignore_index=True)
    test = pd.concat([indian_split.test, paysim_split.test, synth_test], ignore_index=True)

    total_rows = len(train) + len(validation) + len(test)
    synthetic_rows = len(synth_train) + len(synth_val) + len(synth_test)
    achieved_synthetic_fraction = synthetic_rows / total_rows if total_rows else 0.0

    blend_report = {
        "sources": {
            "indian_online_scam": indian_split.row_count,
            "paysim": paysim_split.row_count,
            "s40_synthetic": len(synth_train) + len(synth_val) + len(synth_test),
        },
        "total_rows": total_rows,
        "target_synthetic_fraction": config.synthetic_fraction,
        "achieved_synthetic_fraction": achieved_synthetic_fraction,
        "per_source_fraud_rate": {
            "indian_online_scam": indian_split.fraud_rate,
            "paysim": paysim_split.fraud_rate,
            "s40_synthetic": synthetic_split.fraud_rate,
        },
        "split_sizes": {"train": len(train), "validation": len(validation), "test": len(test)},
        "note": (
            "Each source split chronologically (70/15/15) independently, then "
            "concatenated — a single chronological axis across unrelated data "
            "sources would be meaningless."
        ),
    }

    return BlendedTrainingData(
        train=train,
        validation=validation,
        test=test,
        feature_names=RECIPIENT_MODEL_FEATURE_NAMES,
        source_reports=[indian_split, paysim_split, synthetic_split],
        blend_report=blend_report,
    )
