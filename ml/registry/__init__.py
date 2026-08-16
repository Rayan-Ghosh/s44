"""
Model artifact and registry infrastructure.

NOTE ON LOCATION: this code deliberately lives in `ml/registry/`, NOT in
`ml/models/`. Spec §50 reserves `ml/models/` for trained artifacts, and
during Phase 4 a routine "clean the artifacts" step (`rm -rf ml/models`)
destroyed source code that had been placed there alongside them. Keeping
generated artifacts and hand-written source in separate trees means the
artifact directory can be deleted, ignored, or regenerated freely.
"""

from ml.registry.artifact import (
    ARTIFACT_ROOT,
    ModelArtifact,
    ModelMetadata,
    build_metadata,
    load_artifact,
    new_version,
    save_artifact,
)
from ml.registry.model_registry import ModelRegistry, ModelStage

__all__ = [
    "ARTIFACT_ROOT",
    "ModelArtifact",
    "ModelMetadata",
    "ModelRegistry",
    "ModelStage",
    "build_metadata",
    "load_artifact",
    "new_version",
    "save_artifact",
]
