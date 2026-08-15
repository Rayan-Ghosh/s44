"""
Initialize and seed the local development database (Avaran.db).

Avaran.db is a LOCAL DEVELOPMENT/TESTING database, git-ignored (see
.gitignore). Reproducibility comes from this script, not from committing
the binary file — anyone on the team gets an identical schema plus demo
dataset by running:

    python scripts/seed_database.py

Schema is owned by Alembic (apps/api/alembic/) — this script runs
`alembic upgrade head` rather than creating tables itself, so the seeded
database always matches the latest migration, never a stale in-process
Base.metadata.create_all() snapshot.

Seed data is entirely synthetic (spec §2 Non-Goals, §24; product directive
A: Indian names/context) — no real people, no real financial data. The
script is idempotent: re-running it does not create duplicate rows.

The risk_score/risk_factor/alert rows created by seed_risk_fixture() are
explicitly labeled DEV FIXTURES. They exist only so the read-only
GET /api/v1/risk and GET /api/v1/alerts endpoints have something to return
during development. They are NOT the output of any real model — no fraud/
anomaly/voice model exists yet (docs/DEVELOPMENT_PLAN.md Phase 4/6) — and
must never be mistaken for measured ML performance (see CLAUDE.md's rule
against fabricating metrics).
"""

import sys
from decimal import Decimal
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
API_ROOT = REPO_ROOT / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_identifier  # noqa: E402
from app.models.alert import Alert  # noqa: E402
from app.models.enums import AlertStatus, RiskDecision, RiskLevel  # noqa: E402
from app.models.risk_factor import RiskFactor  # noqa: E402
from app.models.risk_score import RiskScore  # noqa: E402
from app.repositories import risk_repository, user_repository  # noqa: E402
from app.schemas.transaction import TransactionCreate  # noqa: E402
from app.schemas.user import UserCreate  # noqa: E402
from app.services import transaction_service, user_service  # noqa: E402

# Deterministic synthetic demo data — Indian names/context per
# docs/PRODUCT_DIRECTIVES.md §A. Not real people; not real payment handles.
DEMO_USERS = [
    {
        "name": "Ananya Sharma",
        "phone_number": "+91-90000-00001",
        "device_identifier": "DEV-FIXTURE-DEVICE-ANANYA-1",
        "recipient_identifier": "ananya.friend@upi",
        "recipient_display_name": "Rohit Verma",
        "amount": Decimal("450.00"),
        "location": "Bhubaneswar",
        "payment_method": "UPI",
    },
    {
        "name": "Priya Nair",
        "phone_number": "+91-90000-00002",
        "device_identifier": "DEV-FIXTURE-DEVICE-PRIYA-1",
        "recipient_identifier": "priya.landlord@upi",
        "recipient_display_name": "Suresh Iyer",
        "amount": Decimal("12000.00"),
        "location": "Chennai",
        "payment_method": "UPI",
    },
]


def run_migrations() -> None:
    alembic_cfg = Config(str(API_ROOT / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(API_ROOT / "alembic"))
    command.upgrade(alembic_cfg, "head")


def seed_users_and_transactions(db) -> list[tuple]:
    """Create demo users/transactions if they don't already exist. Returns
    (user, transaction) pairs for every demo entry, new or pre-existing."""
    results = []
    for demo in DEMO_USERS:
        phone_hash = hash_identifier(demo["phone_number"])
        user = user_repository.get_user_by_phone_hash(db, phone_hash)
        if user is None:
            user = user_service.create_user(
                db, UserCreate(name=demo["name"], phone_number=demo["phone_number"])
            )

        if user.transactions:
            transaction = user.transactions[0]
        else:
            transaction = transaction_service.create_transaction(
                db,
                TransactionCreate(
                    user_id=user.id,
                    recipient_identifier=demo["recipient_identifier"],
                    recipient_display_name=demo["recipient_display_name"],
                    device_identifier=demo["device_identifier"],
                    amount=demo["amount"],
                    location=demo["location"],
                    payment_method=demo["payment_method"],
                ),
            )
        results.append((user, transaction))
    return results


def seed_risk_fixture(db, transaction) -> None:
    """Attach one illustrative risk_score/risk_factor/alert to the given
    transaction, only if it doesn't already have one. See module
    docstring: this is a DEV FIXTURE, not real model output."""
    if risk_repository.get_latest_risk_score(db, transaction.id) is not None:
        return

    risk_score = RiskScore(
        transaction_id=transaction.id,
        fraud_probability=0.81,
        anomaly_score=0.74,
        device_score=0.60,
        behaviour_score=0.55,
        voice_score=None,
        final_score=66.0,
        risk_level=RiskLevel.MEDIUM,
        decision=RiskDecision.WARN,
    )
    db.add(risk_score)
    db.flush()  # assigns risk_score.id without committing yet

    db.add(
        RiskFactor(
            risk_score_id=risk_score.id,
            factor_type="behaviour",
            factor_name="amount_deviation",
            contribution=40.0,
            explanation=(
                "DEV FIXTURE, not real model output. Illustrative reason: "
                "transaction amount is higher than this user's typical range."
            ),
        )
    )
    db.add(
        Alert(
            transaction_id=transaction.id,
            risk_score_id=risk_score.id,
            severity=RiskLevel.MEDIUM,
            status=AlertStatus.OPEN,
            summary=(
                "DEV FIXTURE, not a real alert. Seed data for exercising "
                "GET /api/v1/alerts during development."
            ),
        )
    )
    db.commit()


def seed() -> None:
    run_migrations()

    with SessionLocal() as db:
        pairs = seed_users_and_transactions(db)
        # Attach the illustrative risk fixture to the higher-amount demo
        # transaction only, so the other stays a clean "no evaluation yet"
        # example (GET /api/v1/risk/{id} returns 404 for it, by design).
        _, highest_amount_transaction = max(pairs, key=lambda pair: pair[1].amount)
        seed_risk_fixture(db, highest_amount_transaction)

    print(f"Avaran.db ready at: {REPO_ROOT / 'Avaran.db'}")


if __name__ == "__main__":
    seed()
