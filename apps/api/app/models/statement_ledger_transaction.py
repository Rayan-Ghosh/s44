"""
statement_ledger_transactions — bank-statement-derived history only.

Deliberately NOT a general transaction ledger: live AVARAN transactions
already live in app/models/transaction.py's `transactions` table, and
app/services/user_pattern_trainer.py reads them from there directly rather
than duplicating every confirmed transaction into a second table. This
table exists only to hold the pre-signup history a user uploads via
POST /api/v1/users/{user_id}/statement/upload
(app/services/statement_parser_service.py) — the one kind of transaction
data that has no other home in this schema.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class StatementLedgerTransaction(Base):
    __tablename__ = "statement_ledger_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    transaction_timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    transaction_type: Mapped[str] = mapped_column(String(10), nullable=False)  # DEBIT | CREDIT

    # sha256(user_id|timestamp|amount|type) — re-uploading the same
    # statement (or an overlapping one) is a no-op, not a duplicate row.
    dedup_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    user: Mapped["User"] = relationship()
