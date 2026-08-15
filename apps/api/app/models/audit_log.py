"""
audit_logs — spec §18.

Spec field list: id, actor, action, resource, timestamp, metadata.
`metadata` is JSON — spec's own field name implies structured, variable-
shaped data, a genuine case for a JSON column (not a proxy for avoiding
schema design elsewhere). Per docs/SECURITY.md, metadata must never contain
raw PII or raw audio content — only references (hashed/pseudonymous IDs,
transaction IDs). That's an application-level discipline this model can't
enforce structurally; documented here so it isn't forgotten.

The Python attribute is named `event_metadata` (not `metadata`) only
because `metadata` is a reserved attribute name on SQLAlchemy declarative
models; the database column itself is still named `metadata`.
"""

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource: Mapped[str] = mapped_column(String(100), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )
    event_metadata: Mapped[Optional[dict[str, Any]]] = mapped_column(
        "metadata", JSON, nullable=True
    )
