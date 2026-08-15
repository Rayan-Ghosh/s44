"""
TeleAntiFraud-28k adapter (spec §36.3, §43).

⚠ LANGUAGE MISMATCH — THE HEADLINE FINDING OF PHASE 3 DATASET REVIEW.

TeleAntiFraud-28k is a **Chinese-language** telecom-fraud corpus (~28,511
speech-text pairs, ~307 hours). S40 is an India-first product that must
handle English / Hindi / Hinglish (docs/PRODUCT_DIRECTIVES.md §A, §G).
The specification (§36.3, §43) names this dataset for the voice component
without noting the language, so this gap is a genuine spec-vs-reality
conflict, not an implementation detail. It is escalated in
docs/DATA_STRATEGY.md and NOT resolved unilaterally here.

What transfers across the language barrier and what does not:
  - Transferable: the *taxonomy* of social-engineering tactics (urgency,
    authority impersonation, threat, financial request, coercion) that
    spec §11/§42 asks the voice model to score. These are behavioural
    patterns, not Chinese-specific ones.
  - NOT transferable: any text classifier trained directly on Chinese
    tokens, and any accuracy figure measured on Chinese audio, neither of
    which says anything about Hinglish performance.

The adapter therefore records LANGUAGE explicitly on every row so that a
downstream training script cannot silently mix Chinese training data with
Indian evaluation data and report a single meaningless score.

Audio provenance is mixed (ASR-transcribed anonymized real calls, TTS
regeneration, and multi-agent adversarial synthesis), so IS_SYNTHETIC_AUDIO
is recorded where the source indicates it and left null where unknown —
never guessed.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from ml.data.canonical import (
    VOICE_CANONICAL_COLUMNS,
    VOICE_CANONICAL_DTYPES,
    LabelDefinition,
    VoiceCanonicalColumn as V,
)


@dataclass(frozen=True)
class VoiceAdapterResult:
    frame: pd.DataFrame
    label: LabelDefinition | None

    def __len__(self) -> int:
        return len(self.frame)


class VoiceDatasetAdapter(ABC):
    """Sibling contract to DatasetAdapter for voice/social-engineering data."""

    name: str

    @abstractmethod
    def read_raw(self, path: Path) -> pd.DataFrame: ...

    @abstractmethod
    def to_canonical(self, raw: pd.DataFrame) -> VoiceAdapterResult: ...

    @abstractmethod
    def label_definition(self) -> LabelDefinition | None: ...

    def load(self, path: Path) -> VoiceAdapterResult:
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(
                f"{self.name}: no data at {path}. Phase 3 does not download "
                f"external datasets — see docs/DATA_STRATEGY.md."
            )
        return self.to_canonical(self.read_raw(path))

    @staticmethod
    def finalize(frame: pd.DataFrame) -> pd.DataFrame:
        for column in VOICE_CANONICAL_COLUMNS:
            if column not in frame.columns:
                frame[column] = pd.Series(
                    [pd.NA] * len(frame), dtype=VOICE_CANONICAL_DTYPES[column]
                )
            else:
                frame[column] = frame[column].astype(VOICE_CANONICAL_DTYPES[column])
        return frame[list(VOICE_CANONICAL_COLUMNS)]


class TeleAntiFraudAdapter(VoiceDatasetAdapter):
    name = "teleantifraud"

    #: Recorded on every row. See module docstring.
    LANGUAGE = "zh"

    def read_raw(self, path: Path) -> pd.DataFrame:
        if path.suffix == ".jsonl":
            return pd.read_json(path, lines=True)
        if path.suffix == ".json":
            return pd.read_json(path)
        return pd.read_csv(path)

    def to_canonical(self, raw: pd.DataFrame) -> VoiceAdapterResult:
        if "transcript" not in raw.columns and "text" not in raw.columns:
            raise ValueError(
                "teleantifraud: expected a 'transcript' or 'text' column; "
                f"got {sorted(raw.columns)}"
            )
        text_column = "transcript" if "transcript" in raw.columns else "text"

        frame = pd.DataFrame(index=pd.RangeIndex(len(raw)))
        frame[V.SOURCE_DATASET.value] = self.name
        frame[V.SOURCE_ROW_ID.value] = (
            raw["id"].astype("string")
            if "id" in raw.columns
            else pd.Series([f"telea-{i}" for i in range(len(raw))], dtype="string")
        )
        frame[V.TRANSCRIPT.value] = raw[text_column].astype("string")
        frame[V.LANGUAGE.value] = self.LANGUAGE

        if "audio_path" in raw.columns:
            frame[V.AUDIO_PATH.value] = raw["audio_path"].astype("string")
        if "label" in raw.columns:
            frame[V.IS_FRAUD.value] = pd.to_numeric(raw["label"], errors="coerce")
        elif "is_fraud" in raw.columns:
            frame[V.IS_FRAUD.value] = pd.to_numeric(raw["is_fraud"], errors="coerce")
        if "fraud_type" in raw.columns:
            frame[V.FRAUD_TYPE.value] = raw["fraud_type"].astype("string")
        # IS_SYNTHETIC_AUDIO deliberately left null unless the source says.
        if "is_synthetic" in raw.columns:
            frame[V.IS_SYNTHETIC_AUDIO.value] = raw["is_synthetic"].astype("boolean")

        return VoiceAdapterResult(
            frame=self.finalize(frame), label=self.label_definition()
        )

    def label_definition(self) -> LabelDefinition:
        return LabelDefinition(
            source_field="label",
            positive_meaning="Telecom fraud / social-engineering call.",
            negative_meaning="Benign call.",
            s40_compatible=True,
            limitations=(
                "CHINESE-LANGUAGE corpus. The social-engineering taxonomy "
                "transfers to S40's Indian context; trained Chinese text "
                "classifiers and any accuracy measured on them do NOT. Audio is "
                "a mix of anonymized real calls, TTS regeneration and adversarial "
                "synthesis, so it is not a clean sample of real call audio. Any "
                "S40 voice metric must be measured on Indian-language evaluation "
                "data before it may be reported — see docs/DATA_STRATEGY.md."
            ),
        )
