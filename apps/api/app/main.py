"""
S40 API — application entry point.

Phase 2 scope (see docs/DEVELOPMENT_PLAN.md): real database schema,
database layer, and initial API contracts for users/transactions/risk/
alerts. No risk engine, ML inference, or voice logic — those are later,
controlled phases per CLAUDE.md. Schema is owned by Alembic
(apps/api/alembic/) — this module does not create tables itself.
"""

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routers import alerts, auth, guardian, institution, risk, simulator, transactions, users, voice_stream
from app.core.config import settings
from app.core.database import get_db

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(transactions.router)
app.include_router(risk.router)
app.include_router(alerts.router)
app.include_router(guardian.router)
app.include_router(institution.router)
app.include_router(simulator.router)
app.include_router(voice_stream.router)



@app.get("/health")
def health() -> dict:
    """Liveness check: the application process is up and responding."""
    return {"status": "ok", "app": settings.app_name, "environment": settings.environment}


@app.get("/health/db")
def health_db(db: Session = Depends(get_db)) -> dict:
    """Readiness check: the application can round-trip a query against Avaran.db."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
