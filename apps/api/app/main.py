"""
S40 API — application entry point.

Phase 2 scope (see docs/DEVELOPMENT_PLAN.md): real database schema,
database layer, and initial API contracts for users/transactions/risk/
alerts. No risk engine, ML inference, or voice logic — those are later,
controlled phases per CLAUDE.md. Schema is owned by Alembic
(apps/api/alembic/) — this module does not create tables itself.
"""

import asyncio
import contextlib
import logging

from fastapi import Depends, FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routers import (
    alerts,
    auth,
    demo,
    financial_profile,
    guardian,
    institution,
    notifications,
    payments,
    risk,
    simulator,
    statements,
    transactions,
    users,
    voice_stream,
)
from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.services import guardian_service
from app.services.user_pattern_scheduler import user_pattern_sweep_worker

logger = logging.getLogger(__name__)


async def _guardian_expiry_worker() -> None:
    """AVARAN PAY spec §6: proactively expire Guardian requests past their
    120s deadline, independent of whether the frontend is polling."""
    while True:
        try:
            await asyncio.sleep(settings.guardian_expiry_sweep_interval_seconds)
            db = SessionLocal()
            try:
                guardian_service.sweep_expired_requests(db)
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Guardian expiry sweep failed; will retry on next interval.")


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(_guardian_expiry_worker()) if settings.enable_guardian_expiry_worker else None
    pattern_task = (
        asyncio.create_task(user_pattern_sweep_worker())
        if settings.enable_user_pattern_scheduler
        else None
    )
    try:
        yield
    finally:
        for t in (task, pattern_task):
            if t is not None:
                t.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await t


app = FastAPI(title=settings.app_name, lifespan=lifespan)

# Outermost middleware: compresses the final response body (JSON/text) when
# the client negotiates it via Accept-Encoding. Starlette's GZipMiddleware
# already skips bodies under minimum_size, skips responses that already carry
# a Content-Encoding header or a known-compressed content type (images,
# video, zip/gzip), and sets Vary: Accept-Encoding — so it won't double
# compress or mangle already-compressed payloads.
app.add_middleware(GZipMiddleware, minimum_size=500)


@app.middleware("http")
async def security_headers_and_https_middleware(request: Request, call_next):
    # Enforce HTTPS when enabled
    if settings.enforce_https:
        client_host = request.client.host if request.client else ""
        is_trusted_proxy = client_host in settings.trusted_proxy_ips
        proto = request.headers.get("x-forwarded-proto", request.url.scheme) if is_trusted_proxy else request.url.scheme
        
        # In production, if request is insecure and not health check, enforce secure transport
        if proto.lower() != "https" and request.url.path not in ("/health", "/api/v1/health"):
            return Response(
                content="HTTPS connection required for secure production API access.",
                status_code=status.HTTP_403_FORBIDDEN,
                media_type="text/plain",
            )

    response = await call_next(request)
    
    # Inject enterprise security headers
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    if request.headers.get("access-control-request-private-network"):
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:19006",
        "http://127.0.0.1:19006",
        "http://10.160.81.205:8081",
        "http://10.160.81.205:8000",
        "http://10.160.81.164:8081",
        "http://10.160.81.164:8000",
        "http://192.168.137.1:8081",
        "http://192.168.137.1:8000",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_private_network=True,
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
app.include_router(payments.router)
app.include_router(demo.router)
app.include_router(notifications.router)
app.include_router(financial_profile.router)
app.include_router(statements.router)



@app.get("/health")
@app.get("/api/v1/health")
def health() -> dict:
    """Liveness check: the application process is up and responding."""
    return {"status": "ok", "app": settings.app_name, "environment": settings.environment}


@app.get("/health/db")
@app.get("/api/v1/health/db")
def health_db(db: Session = Depends(get_db)) -> dict:
    """Readiness check: the application can round-trip a query against Avaran.db."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
