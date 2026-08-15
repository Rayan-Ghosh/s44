"""
S40 API — application entry point.

Bootstrap scope only (see docs/DEVELOPMENT_PLAN.md Phase 1/2). This module
wires up the FastAPI app, its database dependency, and a health check.
It intentionally contains no risk-engine, ML, or voice logic — those are
later, controlled phases per CLAUDE.md.
"""

from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db

app = FastAPI(title=settings.app_name)


@app.get("/health")
def health() -> dict:
    """Liveness check: the application process is up and responding."""
    return {"status": "ok", "app": settings.app_name, "environment": settings.environment}


@app.get("/health/db")
def health_db(db: Session = Depends(get_db)) -> dict:
    """Readiness check: the application can round-trip a query against Avaran.db."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
