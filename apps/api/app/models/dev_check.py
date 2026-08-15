"""
Bootstrap-only database model.

This is NOT part of the final S40 schema (see docs/18 in the specification
and docs/ARCHITECTURE.md §6 for the real entities: users, devices,
transactions, etc.). It exists solely to prove the chain

    application -> database connection -> database operation -> response

works end to end on a fresh checkout. It will be removed once real domain
models (Phase 2, docs/DEVELOPMENT_PLAN.md) replace it.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DevCheck(Base):
    """A single row proving a write/read round trip against Avaran.db."""

    __tablename__ = "dev_check"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
