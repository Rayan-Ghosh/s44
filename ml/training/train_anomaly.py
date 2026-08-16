"""
S40 behaviour anomaly detector — training entry point.

    python -m ml.training.train_anomaly

Reuses the Phase 3 feature pipeline and the same chronological split as the
fraud model, so both detectors see the same temporal discipline. The model
is unsupervised: labels are used ONLY to exclude fraud rows from the
training set and, afterwards, to measure whether the resulting score
separates fraud at all.

The test split is evaluated once, at the end, for reporting only — no
selection decision is made from it.
"""

from __future__ import annotations

import argparse
import json
import time
import warnings
from pathlib import Path

import joblib

from ml.data.generators import SyntheticConfig
from ml.registry.artifact import ARTIFACT_ROOT, build_metadata, new_version
from ml.registry.model_registry import ModelRegistry
from ml.training.anomaly_model import (
    BEHAVIOUR_FEATURES,
    evaluate_separation,
    scorable_mask,
    train_anomaly_model,
)
from ml.training.config import TrainingConfig
from ml.training.dataset import build_training_data

warnings.filterwarnings("ignore", category=FutureWarning)

ANOMALY_ROOT = ARTIFACT_ROOT.parent / "anomaly"

CAVEATS = (
    "PROTOTYPE — NOT A PRODUCTION BANKING MODEL. Trained only on S40 synthetic "
    "data, because no public dataset supports S40's per-user behavioural "
    "features: PaySim has ~0.15% repeat originators (every row is a cold "
    "start), ULB publishes no cardholder identifier, and IEEE-CIS is licence-"
    "blocked. Reported separation therefore measures behaviour the S40 "
    "generator produced, not real-world anomaly-detection performance."
)


def _log(message: str) -> None:
    print(message, flush=True)


def train(
    config: TrainingConfig | None = None,
    *,
    output_root: Path | None = None,
    promote: bool = True,
) -> dict:
    config = config or TrainingConfig()
    started = time.perf_counter()
    root = Path(output_root) if output_root else ANOMALY_ROOT

    _log("[1/5] Building data (same pipeline and split as the fraud model)…")
    data = build_training_data(config)

    _log("[2/5] Fitting Isolation Forest on scorable NON-FRAUD training rows…")
    fit_started = time.perf_counter()
    model = train_anomaly_model(data.train.frame, seed=config.seed)
    fit_seconds = time.perf_counter() - fit_started
    train_scorable = int(scorable_mask(data.train.frame).sum())
    _log(
        f"      fitted on {model.training_rows} rows in {fit_seconds:.2f}s "
        f"({train_scorable} of {len(data.train.frame)} train rows scorable)"
    )

    _log("[3/5] Evaluating separation on validation…")
    validation = evaluate_separation(model, data.validation.frame)
    _log(
        f"      validation ROC-AUC={validation.get('roc_auc')} "
        f"PR-AUC={validation.get('pr_auc')} "
        f"unscorable={validation['unscorable_rows']}"
    )

    _log("[4/5] Evaluating separation on the held-out test split (reporting only)…")
    test = evaluate_separation(model, data.test.frame)
    _log(f"      test ROC-AUC={test.get('roc_auc')} PR-AUC={test.get('pr_auc')}")

    _log("[5/5] Saving versioned artifact…")
    version = new_version()
    path = root / version
    path.mkdir(parents=True, exist_ok=True)

    joblib.dump(
        {"forest": model.forest, "normalizer": model.normalizer},
        path / "model.joblib",
    )

    metadata = build_metadata(
        model_name="s40_behaviour_anomaly",
        model_version=version,
        seed=config.seed,
        datasets=[config.dataset],
        dataset_notes=CAVEATS,
        split_report=data.split_report,
        training_config=config.to_dict(),
        hyperparameters=model.params,
        scale_pos_weight=None,
        best_iteration=None,
        feature_manifest_version="anomaly-1.0.0",
        feature_names=list(BEHAVIOUR_FEATURES),
        metrics={
            "validation_separation": validation,
            "test_separation": test,
            "training_rows": model.training_rows,
            "fit_seconds": fit_seconds,
            "score_normalizer": model.normalizer.to_dict(),
        },
        hyperparameter_search={"skipped": "unsupervised detector; no search performed"},
        calibration={
            "method": "percentile normalization against the training distribution",
            "applied": True,
            "raw_ece": None,
            "calibrated_ece": None,
            "raw_bins": [],
            "calibrated_bins": None,
            "rationale": (
                "Isolation Forest emits an unbounded, model-specific score. It is "
                "mapped onto [0,1] using the 5th/99.5th percentiles of the "
                "training distribution so the value is stable across retrains and "
                "usable by fusion. This is scale normalization, NOT probability "
                "calibration — the output is not a probability and must not be "
                "read as one."
            ),
        },
        selected_threshold=-1.0,  # sentinel: this detector defines no threshold
        caveats=CAVEATS,
    )
    (path / "metadata.json").write_text(
        json.dumps(metadata.to_dict(), indent=2, default=str), encoding="utf-8"
    )
    (path / "feature_manifest.json").write_text(
        json.dumps(
            {
                "manifest_version": "anomaly-1.0.0",
                "features": list(BEHAVIOUR_FEATURES),
                "excluded": {
                    "device features": "device risk is a separate detector (spec §41)",
                    "profile_is_cold / user_transaction_count": (
                        "describe history volume, not behaviour; cold start is "
                        "handled by refusing to score"
                    ),
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    registry = ModelRegistry(root=root)
    if promote:
        registry.promote(version)
        _log(f"      promoted {version} to current")
    else:
        registry.register_experimental(version)

    _log(f"      artifact: {path}")
    _log(f"Done in {time.perf_counter() - started:.1f}s")

    return {
        "version": version,
        "path": str(path),
        "training_rows": model.training_rows,
        "validation": validation,
        "test": test,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train the S40 behaviour anomaly detector."
    )
    parser.add_argument("--users", type=int, default=800)
    parser.add_argument("--seed", type=int, default=40)
    parser.add_argument("--experimental", action="store_true")
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    config = TrainingConfig(
        seed=args.seed,
        synthetic=SyntheticConfig(seed=args.seed, users=args.users, history_per_user=25),
    )
    summary = train(config, output_root=args.output, promote=not args.experimental)
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
