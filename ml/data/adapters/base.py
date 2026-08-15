"""
Dataset adapter interface.

The contract exists so that dataset-specific quirks stay *inside* the
adapter. PaySim's `step` ordinal, IEEE-CIS's `TransactionDT` offset, ULB's
PCA columns, TeleAntiFraud's Chinese-language transcripts — none of that
should be visible to the feature-engineering layer, which sees only the
canonical representation plus a `FeatureAvailability` record.

Adapters do not download anything. They read from a locally-provided path
(configured in the registry) and fail loudly when the file is missing,
because Phase 3 deliberately does not fetch external datasets — see
docs/DATA_STRATEGY.md for licence status per dataset.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from ml.data.canonical import (
    CANONICAL_COLUMNS,
    CANONICAL_DTYPES,
    FeatureAvailability,
    LabelDefinition,
)


@dataclass(frozen=True)
class AdapterResult:
    """A canonical frame plus the metadata needed to use it honestly."""

    frame: pd.DataFrame
    availability: FeatureAvailability
    label: LabelDefinition | None
    #: Opaque, dataset-specific model-only columns (e.g. ULB's PCA
    #: components, IEEE-CIS's V-block). Row-aligned with `frame`. Kept out
    #: of the canonical columns on purpose: they are usable as model input
    #: but cannot support the human-readable explanations S40 owes the user
    #: (spec §14), so they must never be mistaken for interpretable
    #: features. None when the dataset has no such block.
    anonymized_features: pd.DataFrame | None = None

    def __len__(self) -> int:
        return len(self.frame)


class DatasetAdapter(ABC):
    """Maps one external dataset into the S40 canonical representation."""

    #: Registry key. Must match the dataset name in the registry manifest.
    name: str

    @abstractmethod
    def read_raw(self, path: Path) -> pd.DataFrame:
        """Load the dataset's native format, unmodified.

        Raw sources are never mutated in place; this returns an in-memory
        copy for the adapter to transform.
        """

    @abstractmethod
    def to_canonical(self, raw: pd.DataFrame) -> AdapterResult:
        """Map a native frame onto CANONICAL_COLUMNS."""

    @abstractmethod
    def availability(self) -> FeatureAvailability:
        """Declare which canonical concepts this dataset genuinely observes."""

    @abstractmethod
    def label_definition(self) -> LabelDefinition | None:
        """Describe the target, or None for unlabelled datasets."""

    def load(self, path: Path) -> AdapterResult:
        """read_raw -> to_canonical, with the canonical shape enforced."""
        path = Path(path)
        if not path.exists():
            raise FileNotFoundError(
                f"{self.name}: no data at {path}. Phase 3 does not download "
                f"external datasets — see docs/DATA_STRATEGY.md for licence "
                f"status and the manual acquisition step for this dataset."
            )
        return self.to_canonical(self.read_raw(path))

    @staticmethod
    def empty_canonical_frame(rows: int = 0) -> pd.DataFrame:
        """An all-null canonical frame with correct dtypes.

        Adapters build on this so that any concept a dataset lacks stays
        null rather than being silently defaulted to 0 / "" / False.
        """
        frame = pd.DataFrame(index=pd.RangeIndex(rows))
        for column in CANONICAL_COLUMNS:
            frame[column] = pd.Series([pd.NA] * rows, dtype=CANONICAL_DTYPES[column])
        return frame

    @staticmethod
    def finalize(frame: pd.DataFrame) -> pd.DataFrame:
        """Coerce to canonical column order and dtypes."""
        for column in CANONICAL_COLUMNS:
            if column not in frame.columns:
                frame[column] = pd.Series([pd.NA] * len(frame), dtype=CANONICAL_DTYPES[column])
            else:
                frame[column] = frame[column].astype(CANONICAL_DTYPES[column])
        return frame[list(CANONICAL_COLUMNS)]
