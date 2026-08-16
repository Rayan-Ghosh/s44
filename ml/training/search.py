"""
Small, principled hyperparameter search.

Deliberately NOT an exhaustive sweep. The Phase 4 brief calls for a small
search, and with only a few hundred positives an enormous grid would
mostly measure validation noise — then overfit the selection to it.

Design:
  - a hand-picked candidate list, not a cartesian product
  - each candidate varies one axis at a time from a conservative centre,
    so the effect of each knob is legible
  - selection on VALIDATION PR-AUC only; the test set is never touched
  - deterministic and fully recorded, so the choice is auditable
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from ml.training.config import TrainingConfig, XGBParams
from ml.training.evaluate import evaluate
from ml.training.xgb_model import train_xgb

#: Candidate configurations. The first entry is the conservative centre;
#: each later entry perturbs one or two axes from it.
SEARCH_SPACE: tuple[tuple[str, XGBParams], ...] = (
    ("centre", XGBParams()),
    ("shallower", XGBParams(max_depth=3)),
    ("deeper", XGBParams(max_depth=6)),
    ("slower_lr", XGBParams(learning_rate=0.02, n_estimators=800)),
    ("faster_lr", XGBParams(learning_rate=0.1)),
    ("looser_child", XGBParams(min_child_weight=1)),
    ("stricter_child", XGBParams(min_child_weight=10)),
    ("more_l2", XGBParams(reg_lambda=5.0)),
    ("l1_penalty", XGBParams(reg_alpha=1.0)),
    ("less_subsample", XGBParams(subsample=0.6, colsample_bytree=0.6)),
)


@dataclass(frozen=True)
class SearchTrial:
    name: str
    params: dict
    validation_pr_auc: float
    validation_roc_auc: float | None
    best_iteration: int | None

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "params": self.params,
            "validation_pr_auc": self.validation_pr_auc,
            "validation_roc_auc": self.validation_roc_auc,
            "best_iteration": self.best_iteration,
        }


@dataclass(frozen=True)
class SearchResult:
    trials: list[SearchTrial]
    best: SearchTrial
    criterion: str = "validation PR-AUC (average precision)"

    def to_dict(self) -> dict:
        return {
            "criterion": self.criterion,
            "trial_count": len(self.trials),
            "trials": [t.to_dict() for t in self.trials],
            "selected": self.best.to_dict(),
        }

    def table(self) -> pd.DataFrame:
        return pd.DataFrame(
            [
                {
                    "name": t.name,
                    "pr_auc": round(t.validation_pr_auc, 4),
                    "roc_auc": round(t.validation_roc_auc, 4) if t.validation_roc_auc else None,
                    "best_iter": t.best_iteration,
                }
                for t in self.trials
            ]
        ).sort_values("pr_auc", ascending=False)


def run_search(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_validation: pd.DataFrame,
    y_validation: pd.Series,
    *,
    config: TrainingConfig | None = None,
) -> SearchResult:
    """Evaluate each candidate on validation and select the best PR-AUC."""
    config = config or TrainingConfig()
    trials: list[SearchTrial] = []

    for name, params in SEARCH_SPACE:
        model = train_xgb(
            X_train, y_train, X_validation, y_validation, config=config, params=params
        )
        result = evaluate(
            y_validation, model.predict_proba(X_validation), split="validation"
        )
        trials.append(
            SearchTrial(
                name=name,
                params=params.to_dict(),
                validation_pr_auc=result.pr_auc,
                validation_roc_auc=result.roc_auc,
                best_iteration=model.best_iteration,
            )
        )

    best = max(trials, key=lambda t: t.validation_pr_auc)
    return SearchResult(trials=trials, best=best)


def params_from_trial(trial: SearchTrial) -> XGBParams:
    return XGBParams(**trial.params)
