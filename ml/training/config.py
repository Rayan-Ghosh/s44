"""
Training configuration.

One config object rather than settings scattered across scripts, so an
experiment is fully described by the values recorded in the model
artifact's metadata.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

from ml.data.generators import SyntheticConfig
from ml.data.splits import DEFAULT_RATIOS, SplitRatios

#: Fixed seed everywhere. Reproducibility is a hard requirement, not a nicety.
DEFAULT_SEED = 40


@dataclass(frozen=True)
class XGBParams:
    """XGBoost hyperparameters.

    Defaults are conservative for a small, highly imbalanced tabular
    dataset: shallow trees and strong regularisation, because the training
    set has a few hundred positives and deep trees would memorise them.
    """

    max_depth: int = 4
    learning_rate: float = 0.05
    n_estimators: int = 400
    min_child_weight: int = 5
    subsample: float = 0.8
    colsample_bytree: float = 0.8
    reg_alpha: float = 0.0
    reg_lambda: float = 1.0
    gamma: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class TrainingConfig:
    """Everything needed to reproduce a training run."""

    seed: int = DEFAULT_SEED
    #: Dataset key from the Phase 3 registry.
    dataset: str = "s40_synthetic"
    #: Synthetic generation parameters (used when dataset == s40_synthetic).
    synthetic: SyntheticConfig = field(
        default_factory=lambda: SyntheticConfig(
            seed=DEFAULT_SEED, users=800, history_per_user=25
        )
    )
    ratios: SplitRatios = field(default_factory=lambda: DEFAULT_RATIOS)
    xgb: XGBParams = field(default_factory=XGBParams)
    #: Rounds without validation improvement before stopping. Early
    #: stopping uses VALIDATION only — never the test set.
    early_stopping_rounds: int = 40
    #: Metric optimised during training. PR-AUC ("aucpr") rather than
    #: accuracy or ROC-AUC, because at a ~3% positive rate ROC-AUC is
    #: flattered by the huge negative class (spec §47).
    eval_metric: str = "aucpr"
    #: Weight the positive class by negatives/positives instead of
    #: resampling. Spec §46 and the Phase 4 brief both require trying this
    #: simpler approach before reaching for SMOTE.
    use_scale_pos_weight: bool = True

    def to_dict(self) -> dict:
        return {
            "seed": self.seed,
            "dataset": self.dataset,
            "synthetic": {
                "seed": self.synthetic.seed,
                "users": self.synthetic.users,
                "history_per_user": self.synthetic.history_per_user,
                "user_start_spread_days": self.synthetic.user_start_spread_days,
            },
            "ratios": {
                "train": self.ratios.train,
                "validation": self.ratios.validation,
                "test": self.ratios.test,
            },
            "xgb": self.xgb.to_dict(),
            "early_stopping_rounds": self.early_stopping_rounds,
            "eval_metric": self.eval_metric,
            "use_scale_pos_weight": self.use_scale_pos_weight,
        }
