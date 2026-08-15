"""
Dataset validation.

Produces a *report* rather than raising on the first problem. A dataset
with three separate issues should surface all three in one pass — the
alternative is a slow whack-a-mole loop, which during a hackathon is a
real cost.

Severity is meaningful: ERROR means the frame is unsafe to train on,
WARNING means it is usable but has a property someone must know about
(extreme imbalance, high null rates), and INFO records facts worth
recording in a report (class balance, row counts).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

import pandas as pd

from ml.data.canonical import (
    CANONICAL_COLUMNS,
    REQUIRED_COLUMNS,
    Availability,
    CanonicalColumn as C,
    FeatureAvailability,
)


class Severity(str, Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"


@dataclass(frozen=True)
class ValidationIssue:
    severity: Severity
    check: str
    message: str

    def __str__(self) -> str:
        return f"[{self.severity.value}] {self.check}: {self.message}"


@dataclass
class ValidationReport:
    dataset: str
    rows: int
    issues: list[ValidationIssue] = field(default_factory=list)

    def add(self, severity: Severity, check: str, message: str) -> None:
        self.issues.append(ValidationIssue(severity, check, message))

    @property
    def errors(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity is Severity.ERROR]

    @property
    def warnings(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity is Severity.WARNING]

    @property
    def ok(self) -> bool:
        return not self.errors

    def render(self) -> str:
        header = f"Validation report — {self.dataset} ({self.rows} rows)"
        status = "PASS" if self.ok else "FAIL"
        lines = [header, "=" * len(header), f"Status: {status}", ""]
        lines.extend(str(issue) for issue in self.issues) if self.issues else lines.append(
            "No issues recorded."
        )
        return "\n".join(lines)


def validate_canonical(
    frame: pd.DataFrame,
    availability: FeatureAvailability,
    *,
    dataset: str | None = None,
    null_rate_warning: float = 0.5,
) -> ValidationReport:
    """Check a canonical frame for structural and data-quality problems."""
    name = dataset or availability.dataset
    report = ValidationReport(dataset=name, rows=len(frame))

    # --- schema ---------------------------------------------------------
    missing = [c for c in CANONICAL_COLUMNS if c not in frame.columns]
    if missing:
        report.add(Severity.ERROR, "schema", f"Missing canonical columns: {missing}")
        return report  # further checks would be meaningless

    if len(frame) == 0:
        report.add(Severity.ERROR, "rows", "Frame is empty.")
        return report

    # --- required fields ------------------------------------------------
    for column in REQUIRED_COLUMNS:
        null_count = int(frame[column].isna().sum())
        if null_count:
            report.add(
                Severity.ERROR,
                "required_field",
                f"'{column}' is required but has {null_count} null(s).",
            )

    # --- availability honesty -------------------------------------------
    # A column declared ABSENT must actually be empty. If it has values,
    # something fabricated them — exactly the failure this architecture
    # exists to prevent.
    for column in CANONICAL_COLUMNS:
        if availability.of(column) is Availability.ABSENT:
            populated = int(frame[column].notna().sum())
            if populated:
                report.add(
                    Severity.ERROR,
                    "fabricated_data",
                    f"'{column}' is declared ABSENT but has {populated} non-null "
                    f"value(s). A column the dataset does not observe must never "
                    f"be populated.",
                )

    # --- null rates on usable columns -----------------------------------
    for column in CANONICAL_COLUMNS:
        if not availability.is_usable(column):
            continue
        rate = float(frame[column].isna().mean())
        if rate >= null_rate_warning:
            report.add(
                Severity.WARNING,
                "null_rate",
                f"'{column}' is {rate:.1%} null despite being declared "
                f"{availability.of(column).value}.",
            )

    # --- duplicates ------------------------------------------------------
    dupe_ids = int(frame[C.SOURCE_ROW_ID.value].duplicated().sum())
    if dupe_ids:
        report.add(
            Severity.ERROR,
            "duplicate_ids",
            f"{dupe_ids} duplicated source_row_id value(s); IDs must be unique.",
        )
    dupe_rows = int(frame.duplicated().sum())
    if dupe_rows:
        report.add(Severity.WARNING, "duplicate_rows", f"{dupe_rows} fully duplicated row(s).")

    # --- amounts ---------------------------------------------------------
    amounts = pd.to_numeric(frame[C.AMOUNT.value], errors="coerce")
    negative = int((amounts < 0).sum())
    if negative:
        report.add(
            Severity.ERROR, "invalid_amount", f"{negative} row(s) with a negative amount."
        )
    zero = int((amounts == 0).sum())
    if zero:
        report.add(
            Severity.WARNING,
            "zero_amount",
            f"{zero} row(s) with a zero amount — verify these are meaningful.",
        )

    # --- timestamps ------------------------------------------------------
    if availability.is_usable(C.TIMESTAMP.value):
        timestamps = pd.to_datetime(frame[C.TIMESTAMP.value], errors="coerce")
        unparseable = int(timestamps.isna().sum() - frame[C.TIMESTAMP.value].isna().sum())
        if unparseable > 0:
            report.add(
                Severity.ERROR, "invalid_timestamp", f"{unparseable} unparseable timestamp(s)."
            )
        future = int((timestamps > pd.Timestamp.now() + pd.Timedelta(days=365 * 5)).sum())
        if future:
            report.add(
                Severity.WARNING,
                "implausible_timestamp",
                f"{future} timestamp(s) more than 5 years in the future.",
            )

    # --- target ----------------------------------------------------------
    if availability.is_usable(C.IS_FRAUD.value):
        labels = frame[C.IS_FRAUD.value].dropna()
        invalid = int((~labels.isin([0, 1])).sum())
        if invalid:
            report.add(
                Severity.ERROR,
                "invalid_target",
                f"{invalid} label value(s) outside {{0, 1}}.",
            )
        if len(labels):
            positive_rate = float((labels == 1).mean())
            report.add(
                Severity.INFO,
                "class_balance",
                f"{positive_rate:.4%} positive ({int((labels == 1).sum())} of {len(labels)}).",
            )
            if 0 < positive_rate < 0.001:
                report.add(
                    Severity.WARNING,
                    "extreme_imbalance",
                    f"Positive rate {positive_rate:.4%} is below 0.1%; PR-AUC and "
                    f"recall matter far more than accuracy here (spec §47).",
                )
            if positive_rate in (0.0, 1.0):
                report.add(
                    Severity.ERROR, "single_class", "Target has only one class present."
                )

    return report


def validate_no_split_contamination(
    splits: dict[str, pd.DataFrame],
    *,
    id_column: str = C.SOURCE_ROW_ID.value,
    entity_column: str | None = None,
) -> ValidationReport:
    """Assert that splits share no rows — and optionally no entities.

    `entity_column` (typically user_id) catches user-level leakage: the
    same user appearing in both train and test lets a model memorise that
    individual's behaviour rather than learning generalisable patterns.
    Whether that is a problem depends on the model — a per-user deviation
    model legitimately needs a user's history — so it is opt-in rather
    than always enforced.
    """
    total = sum(len(f) for f in splits.values())
    report = ValidationReport(dataset="+".join(splits), rows=total)

    names = list(splits)
    for i, left in enumerate(names):
        for right in names[i + 1 :]:
            shared = set(splits[left][id_column]) & set(splits[right][id_column])
            if shared:
                report.add(
                    Severity.ERROR,
                    "split_contamination",
                    f"{len(shared)} row id(s) appear in both '{left}' and '{right}'.",
                )
            if entity_column:
                shared_entities = set(splits[left][entity_column].dropna()) & set(
                    splits[right][entity_column].dropna()
                )
                if shared_entities:
                    report.add(
                        Severity.WARNING,
                        "entity_leakage",
                        f"{len(shared_entities)} '{entity_column}' value(s) appear in "
                        f"both '{left}' and '{right}'. Acceptable for per-user "
                        f"behavioural models; not acceptable for a model meant to "
                        f"generalise to unseen users.",
                    )
    return report
