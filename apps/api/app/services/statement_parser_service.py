"""
Bank-statement PDF ingestion — the bootstrap path for a new user's
personalized baseline (ml/profiles/user_pattern.py), used when there's no
in-app transaction history yet to learn from.

BEST-EFFORT PARSING, STATED PLAINLY: Indian bank statement PDF layouts vary
a great deal (column names, order, date formats). This extracts pdfplumber
table rows and heuristically matches columns by header keyword (see
HEADER_KEYWORDS/DATE_FORMATS below) rather than targeting one bank's exact
export format. Rows it can't confidently parse (no recognizable date column,
no unambiguous debit/credit amount) are silently skipped, never guessed —
consistent with this repo's "never fabricate" rule. Verified end-to-end
against a synthetic test statement built for this change (see
apps/api/tests/test_financial_profile_api.py) — not verified against a real
bank's actual export layout, which this repo has no access to.

MEMORY HANDLING, STATED HONESTLY: the uploaded bytes are copied into a
bytearray and overwritten with zeros immediately after parsing, and the
original `bytes` reference is dropped. This is best-effort hygiene, not a
hard security guarantee — pdfplumber/pypdfium2 (its underlying PDF engine)
make their own internal copies of the content while parsing, which this
code has no way to reach or scrub. Nothing extracted is retained beyond the
few structured (amount, timestamp, type) rows written to
StatementLedgerTransaction; the original document text/bytes are never
persisted anywhere.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO

import pdfplumber

from app.core.concurrency import run_cpu_bound
from app.core.config import settings
from app.repositories import user_pattern_repository
from app.services.user_pattern_trainer import retrain_user_pattern

#: Column role -> recognized header text aliases. Indian bank statement
#: exports don't share a common column vocabulary (SBI/HDFC/ICICI/Axis all
#: differ), so every column position below is resolved by matching a
#: table's own header row against these aliases at parse time (see
#: _parse_table) — never a fixed index. "narration" isn't used to compute
#: an amount, but its presence is a second signal (alongside "date") that a
#: given pdfplumber table is actually a transaction ledger and not some
#: other table on the page (a summary box, an interest-rate table, etc.).
HEADER_KEYWORDS = {
    "date": ("date", "txn date", "transaction date", "value date", "value dt", "posting date"),
    "debit": ("debit", "withdrawal", "dr amt", "dr.", " dr", "debit amount", "withdrawal amt"),
    "credit": ("credit", "deposit", "cr amt", "cr.", " cr", "credit amount", "deposit amt"),
    "amount": ("amount",),
    "narration": ("narration", "particulars", "description", "details", "remarks", "transaction remarks"),
}

DATE_FORMATS = ("%d/%m/%Y", "%d-%m-%Y", "%d %b %Y", "%Y-%m-%d", "%d/%m/%y")

_AMOUNT_CLEAN_RE = re.compile(r"[^\d.\-]")


class StatementParseError(Exception):
    """Wraps a password/corruption/format failure into one clean message
    for the API layer — callers don't need pdfplumber's own exception
    hierarchy."""


@dataclass(frozen=True)
class ParsedRow:
    amount: float
    timestamp: datetime
    transaction_type: str  # "DEBIT" | "CREDIT"


def _match_header(cell: str | None) -> str | None:
    if not cell:
        return None
    lowered = cell.strip().lower()
    for role, keywords in HEADER_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return role
    return None


def _parse_date(cell: str | None) -> datetime | None:
    if not cell:
        return None
    text = cell.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _parse_amount(cell: str | None) -> float | None:
    if not cell:
        return None
    cleaned = _AMOUNT_CLEAN_RE.sub("", cell.strip())
    if not cleaned or cleaned in ("-", "."):
        return None
    try:
        value = float(cleaned)
    except ValueError:
        return None
    return value if value > 0 else None


def _parse_table(table: list[list[str | None]]) -> list[ParsedRow]:
    if not table or len(table) < 2:
        return []

    col_roles = [_match_header(cell) for cell in table[0]]
    if "date" not in col_roles:
        return []  # not a transaction table

    date_idx = col_roles.index("date")
    debit_idx = col_roles.index("debit") if "debit" in col_roles else None
    credit_idx = col_roles.index("credit") if "credit" in col_roles else None
    amount_idx = col_roles.index("amount") if "amount" in col_roles else None

    rows: list[ParsedRow] = []
    for data_row in table[1:]:
        if date_idx >= len(data_row):
            continue
        ts = _parse_date(data_row[date_idx])
        if ts is None:
            continue

        debit = _parse_amount(data_row[debit_idx]) if debit_idx is not None and debit_idx < len(data_row) else None
        credit = _parse_amount(data_row[credit_idx]) if credit_idx is not None and credit_idx < len(data_row) else None

        if debit is not None:
            rows.append(ParsedRow(amount=debit, timestamp=ts, transaction_type="DEBIT"))
        elif credit is not None:
            rows.append(ParsedRow(amount=credit, timestamp=ts, transaction_type="CREDIT"))
        elif amount_idx is not None and amount_idx < len(data_row):
            # A single combined "Amount" column with no separate debit/
            # credit split can't be classified — skip rather than guess.
            continue
    return rows


def parse_pdf_bytes(file_bytes: bytes, password: str | None, max_pages: int) -> list[ParsedRow]:
    """CPU-bound, sync — always called via app.core.concurrency.run_cpu_bound,
    never directly on the event loop."""
    try:
        with pdfplumber.open(BytesIO(file_bytes), password=password) as pdf:
            rows: list[ParsedRow] = []
            for page in pdf.pages[:max_pages]:
                for table in page.extract_tables() or []:
                    rows.extend(_parse_table(table))
            return rows
    except Exception as exc:  # noqa: BLE001 - pdfplumber/pypdfium2 raise several distinct types for bad password/corrupt file
        raise StatementParseError(str(exc)) from exc


def _dedup_hash(user_id: int, row: ParsedRow) -> str:
    payload = f"{user_id}|{row.timestamp.isoformat()}|{row.amount}|{row.transaction_type}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def ingest_statement(db, user_id: int, file_bytes: bytes, password: str | None) -> dict:
    """Parses, dedupes, and stores the statement, then either triggers an
    inline bootstrap train (first-ever training for this user — see
    user_pattern_trainer.py's module docstring) or just flips the
    opportunistic-retrain flag once the volume gate is met."""
    buf = bytearray(file_bytes)
    file_bytes = None  # drop the original reference; buf is now the only copy we control

    try:
        rows = await run_cpu_bound(parse_pdf_bytes, bytes(buf), password, settings.statement_upload_max_pages)
    finally:
        for i in range(len(buf)):
            buf[i] = 0

    inserted = 0
    for row in rows:
        saved = user_pattern_repository.insert_statement_transaction(
            db,
            user_id=user_id,
            amount=row.amount,
            transaction_timestamp=row.timestamp,
            transaction_type=row.transaction_type,
            dedup_hash=_dedup_hash(user_id, row),
        )
        if saved is not None:
            inserted += 1

    profile = user_pattern_repository.get_or_create_profile(db, user_id)
    is_bootstrap = profile.last_retrained_at is None and inserted > 0
    trained = False

    if is_bootstrap:
        # First-ever training for this user runs inline — the whole point
        # of uploading a statement is to see a baseline in the response,
        # not wait for the next opportunistic sweep. Still goes through the
        # same TRAINING_SEMAPHORE-bounded path as every other retrain.
        profile = await retrain_user_pattern(db, user_id)
        trained = True
    elif inserted > 0:
        profile.pending_transactions_count += inserted
        profile.needs_retrain = (
            profile.pending_transactions_count >= settings.user_pattern_min_new_transactions
        )
        db.commit()
        db.refresh(profile)

    return {
        "parsed_rows": len(rows),
        "inserted_rows": inserted,
        "duplicate_rows": len(rows) - inserted,
        "trained": trained,
        "p50_amount": float(profile.p50_amount) if profile.p50_amount is not None else None,
        "p90_amount": float(profile.p90_amount) if profile.p90_amount is not None else None,
        "p99_amount": float(profile.p99_amount) if profile.p99_amount is not None else None,
    }
