"""
Export `s40_transaction_fraud_real` to ONNX for on-device mobile
inference (2026-09-04 real-data retraining pass).

SCOPE, STATED PLAINLY: this exports the XGBoost booster only — not the
isotonic calibrator (ONNX has no standard isotonic-regression op, and
scikit-learn's isotonic model doesn't convert cleanly through skl2onnx/
onnxmltools). The mobile app therefore gets the RAW, uncalibrated
probability on-device. That's an acceptable trade for an advisory/offline
signal (see apps/mobile/src/services/recipient-risk-service.ts's own
docstring) but must never be presented to a user as the calibrated
probability the backend reports — the raw and calibrated numbers are NOT
on the same scale (see docs/FRAUD_MODEL_CARD_REAL.md §7's calibration
table: raw ECE 0.124 vs calibrated 0.0044, a meaningfully different
number). The exported metadata.json below records the model's own
`selected_threshold`, which was chosen against CALIBRATED probabilities —
the mobile app must not compare a raw ONNX score directly against it
without accounting for this gap. Kept simple deliberately: a full
isotonic-in-ONNX pipeline is a reasonable follow-up, not built here given
the added complexity for a signal that's advisory-only by design.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from onnxmltools.convert import convert_xgboost
from onnxmltools.convert.common.data_types import FloatTensorType

from ml.features.recipient_features import RECIPIENT_MODEL_FEATURE_NAMES
from ml.registry.artifact import ARTIFACT_ROOT as FRAUD_ARTIFACT_ROOT
from ml.registry.model_registry import ModelRegistry

FRAUD_REAL_ROOT = FRAUD_ARTIFACT_ROOT.parent / "fraud_real"
EXPORT_DIR = Path(__file__).resolve().parents[2] / "apps" / "mobile" / "assets" / "models"


def export(*, output_dir: Path | None = None) -> Path:
    output_dir = Path(output_dir) if output_dir else EXPORT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    artifact = ModelRegistry(root=FRAUD_REAL_ROOT).load()
    booster = artifact.booster.get_booster()
    # onnxmltools' XGBoost converter expects the generic "f0", "f1", ...
    # naming scheme, not the real pandas column names the model was
    # trained with. The real names (and their fixed order) are preserved
    # separately in RECIPIENT_MODEL_FEATURE_NAMES / the exported metadata
    # — this rename is conversion-only and doesn't change what the model
    # computes.
    booster.feature_names = [f"f{i}" for i in range(len(RECIPIENT_MODEL_FEATURE_NAMES))]

    initial_type = [("input", FloatTensorType([None, len(RECIPIENT_MODEL_FEATURE_NAMES)]))]
    onnx_model = convert_xgboost(artifact.booster, initial_types=initial_type)

    model_path = output_dir / "fraud_real.onnx"
    with open(model_path, "wb") as f:
        f.write(onnx_model.SerializeToString())

    metadata = {
        "model_name": artifact.metadata.model_name,
        "model_version": artifact.metadata.model_version,
        "feature_names": list(RECIPIENT_MODEL_FEATURE_NAMES),
        "calibrated_selected_threshold": artifact.metadata.selected_threshold,
        "warning": (
            "This ONNX export is the RAW, uncalibrated XGBoost output — the "
            "isotonic calibrator was not exported (no standard ONNX op). Do "
            "not compare its output directly against `calibrated_selected_"
            "threshold` above, which was chosen against calibrated "
            "probabilities. See ml/export/to_onnx.py's module docstring."
        ),
    }
    metadata_path = output_dir / "fraud_real_metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    _verify(model_path)
    return model_path


def _verify(model_path: Path) -> None:
    """Loads the exported file and runs one inference — proof it actually
    works, not just that bytes were written."""
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    sample = np.zeros((1, len(RECIPIENT_MODEL_FEATURE_NAMES)), dtype=np.float32)
    sample[0, 0] = 50000.0  # amount
    outputs = session.run(None, {input_name: sample})
    print(f"ONNX verification OK — outputs: {[o.shape for o in outputs]}")
    print(f"Sample probability output: {outputs[1] if len(outputs) > 1 else outputs[0]}")


if __name__ == "__main__":
    path = export()
    print(f"Exported to {path} ({path.stat().st_size} bytes)")
