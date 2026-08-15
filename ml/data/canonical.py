"""
The S40 canonical transaction representation.

Every external dataset is mapped through an adapter into these columns. The
point is NOT to force heterogeneous datasets to look identical — it is to
give the feature-engineering layer one vocabulary to work against, while
recording honestly which concepts each dataset actually observes.

Design rule (spec §52, CLAUDE.md): a field a dataset does not contain is
represented as *unavailable*, never fabricated and never silently imputed
as if it had been observed. `FeatureAvailability` carries that fact
alongside the data so downstream code can branch on it explicitly instead
of guessing from NaNs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Availability(str, Enum):
    """Whether a canonical concept is genuinely observed in a dataset."""

    # The dataset provides this directly.
    OBSERVED = "OBSERVED"
    # Not in the source data at all. Column exists in the canonical frame
    # but is entirely null. Must never be imputed as though observed.
    ABSENT = "ABSENT"
    # Present but transformed beyond direct interpretation — e.g. the ULB
    # credit-card dataset's PCA components. Usable as model input, not
    # usable for human-readable explanations.
    ANONYMIZED = "ANONYMIZED"
    # Derived by the adapter from other observed columns (documented per
    # adapter). Legitimate, but not a raw observation.
    DERIVED = "DERIVED"


class CanonicalColumn(str, Enum):
    """Canonical column names.

    Kept deliberately small. A concept earns a place here only if the
    specification actually references it (spec §6, §7, §18, §37) — not
    because it sounds useful.
    """

    # --- Identity / provenance -------------------------------------------
    SOURCE_DATASET = "source_dataset"
    SOURCE_ROW_ID = "source_row_id"

    # --- Core transaction (spec §6.1) ------------------------------------
    USER_ID = "user_id"
    RECIPIENT_ID = "recipient_id"
    DEVICE_ID = "device_id"
    AMOUNT = "amount"
    TRANSACTION_TYPE = "transaction_type"
    TIMESTAMP = "timestamp"
    # Integer ordering position. Some datasets (PaySim `step`, ULB `Time`)
    # provide relative ordering rather than wall-clock time; preserving the
    # raw ordinal lets chronological splitting work without inventing dates.
    TIME_INDEX = "time_index"

    # --- Balance / context (spec §36.1 lists balances for PaySim) ---------
    SENDER_BALANCE_BEFORE = "sender_balance_before"
    SENDER_BALANCE_AFTER = "sender_balance_after"

    # --- Device / location context (spec §6.2) ---------------------------
    LOCATION = "location"

    # --- Label (spec §52: never leak, never derive from outcome) ---------
    IS_FRAUD = "is_fraud"

    # --- Anonymized model-only feature block ------------------------------
    # Datasets like ULB expose PCA components with no semantic meaning.
    # They are kept out of the named canonical columns and carried in a
    # side frame so they can never be mistaken for interpretable features.


#: Columns every canonical frame must contain, in order.
CANONICAL_COLUMNS: tuple[str, ...] = tuple(c.value for c in CanonicalColumn)

#: Columns that must never be null in a valid canonical frame.
REQUIRED_COLUMNS: tuple[str, ...] = (
    CanonicalColumn.SOURCE_DATASET.value,
    CanonicalColumn.SOURCE_ROW_ID.value,
    CanonicalColumn.AMOUNT.value,
)

#: Expected pandas dtypes. Nullable extension dtypes are used so that
#: "absent" stays distinguishable from "observed as zero".
CANONICAL_DTYPES: dict[str, str] = {
    CanonicalColumn.SOURCE_DATASET.value: "string",
    CanonicalColumn.SOURCE_ROW_ID.value: "string",
    CanonicalColumn.USER_ID.value: "string",
    CanonicalColumn.RECIPIENT_ID.value: "string",
    CanonicalColumn.DEVICE_ID.value: "string",
    CanonicalColumn.AMOUNT.value: "Float64",
    CanonicalColumn.TRANSACTION_TYPE.value: "string",
    CanonicalColumn.TIMESTAMP.value: "datetime64[ns]",
    CanonicalColumn.TIME_INDEX.value: "Int64",
    CanonicalColumn.SENDER_BALANCE_BEFORE.value: "Float64",
    CanonicalColumn.SENDER_BALANCE_AFTER.value: "Float64",
    CanonicalColumn.LOCATION.value: "string",
    CanonicalColumn.IS_FRAUD.value: "Int64",
}


class VoiceCanonicalColumn(str, Enum):
    """Canonical representation for voice / social-engineering data.

    Deliberately SEPARATE from the transaction schema. A call transcript
    and a payment are different kinds of object, and the specification
    treats them as different detectors whose outputs meet only at the
    fusion layer (spec §35.1, §48). Forcing both into one table would
    invite exactly the blind concatenation the architecture forbids.
    """

    SOURCE_DATASET = "source_dataset"
    SOURCE_ROW_ID = "source_row_id"
    #: Transcript text. May be absent when only audio is distributed.
    TRANSCRIPT = "transcript"
    #: BCP-47-ish language tag of the transcript, e.g. "zh", "en", "hi".
    LANGUAGE = "language"
    #: Relative path to an audio asset, when one exists locally.
    AUDIO_PATH = "audio_path"
    #: 1 = fraudulent / social-engineering call, 0 = benign.
    IS_FRAUD = "is_fraud"
    #: Dataset-specific fraud category label, when provided.
    FRAUD_TYPE = "fraud_type"
    #: Whether the underlying audio was synthesized (TTS / generated) as
    #: opposed to a real recording. Tracked because it materially affects
    #: what a model trained on it can be claimed to have learned.
    IS_SYNTHETIC_AUDIO = "is_synthetic_audio"


VOICE_CANONICAL_COLUMNS: tuple[str, ...] = tuple(c.value for c in VoiceCanonicalColumn)

VOICE_CANONICAL_DTYPES: dict[str, str] = {
    VoiceCanonicalColumn.SOURCE_DATASET.value: "string",
    VoiceCanonicalColumn.SOURCE_ROW_ID.value: "string",
    VoiceCanonicalColumn.TRANSCRIPT.value: "string",
    VoiceCanonicalColumn.LANGUAGE.value: "string",
    VoiceCanonicalColumn.AUDIO_PATH.value: "string",
    VoiceCanonicalColumn.IS_FRAUD.value: "Int64",
    VoiceCanonicalColumn.FRAUD_TYPE.value: "string",
    VoiceCanonicalColumn.IS_SYNTHETIC_AUDIO.value: "boolean",
}


@dataclass(frozen=True)
class FeatureAvailability:
    """Per-dataset record of which canonical concepts are real.

    Travels with a canonical frame. Downstream feature code must consult
    this rather than inferring availability from null counts — a column
    that is null because the dataset lacks it is a fundamentally different
    thing from a column that is null for one row.
    """

    dataset: str
    availability: dict[str, Availability]
    #: Free-text notes explaining non-obvious mappings, keyed by column.
    notes: dict[str, str] = field(default_factory=dict)

    def of(self, column: str) -> Availability:
        return self.availability.get(column, Availability.ABSENT)

    def is_usable(self, column: str) -> bool:
        """True if the column carries real signal (observed/derived/anonymized)."""
        return self.of(column) is not Availability.ABSENT

    def observed_columns(self) -> list[str]:
        return sorted(c for c, a in self.availability.items() if a is Availability.OBSERVED)

    def absent_columns(self) -> list[str]:
        return sorted(c for c, a in self.availability.items() if a is Availability.ABSENT)


@dataclass(frozen=True)
class LabelDefinition:
    """How a dataset defines its target.

    Spec §52 and the Phase 3 brief both stress that "fraud" is not defined
    identically across datasets. Recording the semantics explicitly is what
    makes it safe to decide, per model, whether two datasets' labels may be
    pooled — a decision this class documents but deliberately does not make
    on its own.
    """

    source_field: str
    positive_meaning: str
    negative_meaning: str
    #: Whether this label means the same thing S40 means by "fraud"
    #: (spec §1: a suspicious payment S40 would want to intervene on).
    s40_compatible: bool
    limitations: str = ""
