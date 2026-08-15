"""
Database connection layer.

Bootstrap scope: a single SQLAlchemy engine/session pointed at the local
SQLite development database (Avaran.db). This module intentionally knows
nothing about fraud/risk domain models — it only provides the connection
primitives that later phases will build on.
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

# check_same_thread=False is required for SQLite when the connection is
# shared across FastAPI's request-handling threads. Safe for this
# single-file bootstrap database; revisit if/when PostgreSQL replaces it.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
