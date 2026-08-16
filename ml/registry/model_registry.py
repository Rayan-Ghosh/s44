"""
Lightweight local model registry.

Deliberately a single JSON pointer file, not MLflow. What the project
actually needs is the ability to answer "which model is current?" and
"what was the previous one?" — a JSON file answers both, survives a
reboot, and needs no server.

    ml/models/<detector>/registry.json
        { "current": "v...", "previous": "v...", "experimental": [...] }

The registry stores versions (pointers), never weights. It is git-ignored
alongside the artifacts it points at, because an entry naming a model that
does not exist on another machine is worse than no entry at all.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from ml.registry.artifact import ARTIFACT_ROOT, ModelArtifact, load_artifact


class ModelStage(str, Enum):
    CURRENT = "current"
    PREVIOUS = "previous"
    EXPERIMENTAL = "experimental"


@dataclass
class ModelRegistry:
    """Pointer file mapping stages to artifact versions."""

    root: Path = ARTIFACT_ROOT

    @property
    def path(self) -> Path:
        return Path(self.root) / "registry.json"

    def _read(self) -> dict:
        if not self.path.exists():
            return {"current": None, "previous": None, "experimental": []}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _write(self, state: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    # -- queries ----------------------------------------------------------

    def current_version(self) -> str | None:
        return self._read().get("current")

    def previous_version(self) -> str | None:
        return self._read().get("previous")

    def experimental_versions(self) -> list[str]:
        return list(self._read().get("experimental", []))

    def state(self) -> dict:
        return self._read()

    def version_path(self, version: str) -> Path:
        return Path(self.root) / version

    # -- mutation ---------------------------------------------------------

    def promote(self, version: str) -> None:
        """Make `version` current, demoting the incumbent to previous.

        Refuses to point at an artifact that is not on disk — a registry
        that lies is worse than an empty one.
        """
        if not (self.version_path(version) / "metadata.json").exists():
            raise FileNotFoundError(
                f"Cannot promote '{version}': no artifact with metadata at "
                f"{self.version_path(version)}."
            )
        state = self._read()
        if state.get("current") and state["current"] != version:
            state["previous"] = state["current"]
        state["current"] = version
        state["experimental"] = [v for v in state.get("experimental", []) if v != version]
        self._write(state)

    def register_experimental(self, version: str) -> None:
        state = self._read()
        experimental = state.get("experimental", [])
        if version not in experimental:
            experimental.append(version)
        state["experimental"] = experimental
        self._write(state)

    # -- loading ----------------------------------------------------------

    def load(self, stage: ModelStage = ModelStage.CURRENT) -> ModelArtifact:
        version = self._read().get(stage.value)
        if isinstance(version, list):
            raise ValueError(f"Stage '{stage.value}' holds a list; load by version.")
        if not version:
            raise FileNotFoundError(
                f"No model registered as '{stage.value}'. Train one with:\n"
                f"    python -m ml.training.train_fraud"
            )
        return load_artifact(self.version_path(version))

    def load_version(self, version: str) -> ModelArtifact:
        return load_artifact(self.version_path(version))
