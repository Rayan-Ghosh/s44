"""
Versioned model artifacts.

An artifact is a directory containing everything needed to answer "what is
this model, what was it trained on, and can I trust its numbers?" — never
an opaque `model.pkl` with no provenance.

    ml/models/<detector>/<version>/
        model.json | model.joblib
        calibrator.joblib      optional, only when calibration was applied
        metadata.json          full provenance + measured metrics
        feature_manifest.json

XGBoost's native JSON is preferred over pickle: pickle ties the artifact to
exact library versions and executes code on load, which is a poor property
for a fraud model.

Artifacts live under `ml/models/` and are git-ignored. They are build
outputs, reproducible from the documented training commands.
"""

from __future__ import annotations

import json
import platform
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import joblib
import xgboost as xgb

#: Repo root: ml/registry/artifact.py -> ml/registry -> ml -> <root>
REPO_ROOT = Path(__file__).resolve().parents[2]

#: Root for fraud-model artifacts. Git-ignored (see .gitignore).
ARTIFACT_ROOT = REPO_ROOT / "ml" / "models" / "fraud"


def _git_commit() -> str | None:
    """Best-effort code version. None if unavailable — never fabricated."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=str(REPO_ROOT),
        )
        return result.stdout.strip() or None if result.returncode == 0 else None
    except Exception:
        return None


@dataclass
class ModelMetadata:
    """Full provenance for one trained model."""

    model_name: str
    model_version: str
    trained_at: str
    seed: int

    # --- data provenance ------------------------------------------------
    datasets: list[str]
    dataset_notes: str
    split_report: dict

    # --- configuration --------------------------------------------------
    training_config: dict
    hyperparameters: dict
    scale_pos_weight: float | None
    best_iteration: int | None

    # --- features -------------------------------------------------------
    feature_manifest_version: str
    feature_names: list[str]

    # --- measured results (never hand-written) --------------------------
    metrics: dict
    hyperparameter_search: dict
    calibration: dict
    selected_threshold: float

    # --- environment ----------------------------------------------------
    git_commit: str | None = None
    python_version: str = field(default_factory=platform.python_version)
    xgboost_version: str = field(default_factory=lambda: xgb.__version__)

    #: Plain-language statement of what these numbers do and do not mean.
    caveats: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ModelArtifact:
    """A loaded model plus everything needed to use it responsibly."""

    booster: xgb.XGBClassifier
    calibrator: object | None
    metadata: ModelMetadata
    path: Path

    @property
    def feature_names(self) -> tuple[str, ...]:
        return tuple(self.metadata.feature_names)

    @property
    def is_calibrated(self) -> bool:
        return self.calibrator is not None


def save_artifact(
    booster: xgb.XGBClassifier,
    calibrator,
    metadata: ModelMetadata,
    feature_manifest: dict,
    *,
    root: Path | None = None,
) -> Path:
    """Write a complete, self-describing artifact directory."""
    root = Path(root) if root else ARTIFACT_ROOT
    path = root / metadata.model_version
    path.mkdir(parents=True, exist_ok=True)

    booster.save_model(str(path / "model.json"))
    if calibrator is not None:
        joblib.dump(calibrator, path / "calibrator.joblib")

    (path / "metadata.json").write_text(
        json.dumps(metadata.to_dict(), indent=2, default=str), encoding="utf-8"
    )
    (path / "feature_manifest.json").write_text(
        json.dumps(feature_manifest, indent=2, default=str), encoding="utf-8"
    )
    return path


def load_artifact(path: Path) -> ModelArtifact:
    """Load an artifact, failing loudly if it is incomplete."""
    path = Path(path)
    model_file = path / "model.json"
    metadata_file = path / "metadata.json"

    if not model_file.exists():
        raise FileNotFoundError(f"No model.json in {path}. Train one first.")
    if not metadata_file.exists():
        raise FileNotFoundError(
            f"No metadata.json in {path}. An artifact without provenance must "
            f"not be loaded — see ml/registry/artifact.py."
        )

    booster = xgb.XGBClassifier()
    booster.load_model(str(model_file))

    calibrator_file = path / "calibrator.joblib"
    calibrator = joblib.load(calibrator_file) if calibrator_file.exists() else None

    metadata = ModelMetadata(**json.loads(metadata_file.read_text(encoding="utf-8")))
    return ModelArtifact(
        booster=booster, calibrator=calibrator, metadata=metadata, path=path
    )


def new_version(prefix: str = "v") -> str:
    """UTC timestamp version. Sorts lexicographically in time order."""
    return f"{prefix}{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"


def build_metadata(**kwargs) -> ModelMetadata:
    kwargs.setdefault("git_commit", _git_commit())
    kwargs.setdefault("trained_at", datetime.now(timezone.utc).isoformat())
    return ModelMetadata(**kwargs)
