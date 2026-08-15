"""
Initialize the local development database (Avaran.db) from scratch.

Avaran.db is a LOCAL DEVELOPMENT/TESTING database. It is git-ignored (see
.gitignore) rather than committed, so this script is the reproducibility
mechanism: anyone on the team can recreate an identical database by running

    python scripts/seed_database.py

Bootstrap scope only: this creates the minimal dev_check table (see
apps/api/app/models/dev_check.py) and inserts one row proving the
application -> database -> operation -> response chain works. It does NOT
create the final S40 schema (users, devices, transactions, risk_scores,
etc.) — that belongs to Phase 2 (docs/DEVELOPMENT_PLAN.md).
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
API_ROOT = REPO_ROOT / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.models.dev_check import DevCheck  # noqa: E402


def seed() -> None:
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        exists = db.query(DevCheck).first()
        if exists is None:
            db.add(DevCheck(message="S40 development database initialized."))
            db.commit()

    db_path = REPO_ROOT / "Avaran.db"
    print(f"Avaran.db ready at: {db_path}")


if __name__ == "__main__":
    seed()
