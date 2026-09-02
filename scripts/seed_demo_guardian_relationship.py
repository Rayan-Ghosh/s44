"""
seed_demo_guardian_relationship.py
====================================
STEP 2 of the Guardian Approval implementation:
  Establish the real database-backed Aditya -> Rayan relationship.

This script is IDEMPOTENT: re-running it will not create duplicate rows.

Relationship being established:
    Aditya (User) -> initiates high-risk payment
        |
    GuardianRequest is created -> assigned to TrustedContact (Rayan)
        |
    TrustedContact.guardian_user_id = Rayan's User.id
        |
    Rayan's dashboard queries: GET /api/v1/guardian/requests/pending/{trusted_contact_id}

After this script:
  - Aditya is a real User in `users`.
  - Rayan is a real User in `users`.
  - Aditya has a TrustedContact row where:
      trusted_contacts.user_id          = Aditya.id
      trusted_contacts.contact_name     = "Rayan Ghosh"
      trusted_contacts.guardian_user_id = Rayan.id    <- real FK link
  - This contact can be used to determine which User account receives
    a Guardian Approval request.

Run from the repository root:
    python scripts/seed_demo_guardian_relationship.py
"""

import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Path setup -- mirrors what env.py and seed_database.py already do.
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
API_ROOT = REPO_ROOT / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_identifier, mask_phone  # noqa: E402
from app.models.enums import ConsentStatus  # noqa: E402
from app.models.trusted_contact import TrustedContact  # noqa: E402
from app.models.user import User  # noqa: E402
import app.models  # noqa: E402,F401  -- register all model metadata

# ---------------------------------------------------------------------------
# Demo user definitions.
# ---------------------------------------------------------------------------
# Stable, unique phone numbers for the two demo users.
# These are never used to contact anyone -- they exist only to produce
# a deterministic phone_hash so the idempotency check works on re-runs.
ADITYA_PHONE = "+91-79086-12345"
RAYAN_PHONE  = "+91-79087-54321"

ADITYA_NAME = "Aditya Ranjan"
RAYAN_NAME  = "Rayan Ghosh"


def _get_or_create_user(db, name, phone):
    """Return the existing User for `phone`, or create a new one."""
    phone_hash = hash_identifier(phone)
    user = db.query(User).filter(User.phone_hash == phone_hash).first()
    if user:
        print("  [FOUND]   User '{}' (id={}) -- phone_hash already in DB.".format(user.name, user.id))
        return user

    user = User(name=name, phone_hash=phone_hash)
    db.add(user)
    db.flush()  # get the auto-assigned id without committing yet
    print("  [CREATED] User '{}' (id={}).".format(user.name, user.id))
    return user


def _get_or_create_guardian_contact(db, aditya, rayan):
    """
    Return the TrustedContact that links Aditya -> Rayan as guardian, or
    create it.  Uses guardian_user_id = rayan.id as the authoritative key,
    so we never rely on contact_name matching alone.
    """
    # Idempotency check: look for a contact owned by Aditya where
    # guardian_user_id already points at Rayan.
    existing = (
        db.query(TrustedContact)
        .filter(
            TrustedContact.user_id == aditya.id,
            TrustedContact.guardian_user_id == rayan.id,
        )
        .first()
    )
    if existing:
        print(
            "  [FOUND]   TrustedContact id={}: user_id={} -> guardian_user_id={} ('{}') already exists.".format(
                existing.id, existing.user_id, existing.guardian_user_id, existing.contact_name
            )
        )
        return existing

    phone_hash = hash_identifier(RAYAN_PHONE)
    phone_masked = mask_phone(RAYAN_PHONE)

    contact = TrustedContact(
        user_id=aditya.id,
        contact_name=rayan.name,
        contact_phone_hash=phone_hash,
        phone_masked=phone_masked,
        relationship="Friend",
        consent_status=ConsentStatus.ACCEPTED,
        guardian_user_id=rayan.id,  # THE critical FK link
    )
    db.add(contact)
    db.flush()
    print(
        "  [CREATED] TrustedContact id={}: user_id={} (Aditya) -> guardian_user_id={} (Rayan).".format(
            contact.id, contact.user_id, contact.guardian_user_id
        )
    )
    return contact


def main():
    print("=" * 60)
    print("STEP 2 -- Seed demo Guardian relationship: Aditya -> Rayan")
    print("=" * 60)
    print("Database: {}\n".format(settings.database_url))

    db = SessionLocal()
    try:
        print("[1] Ensuring Aditya exists as a real User...")
        aditya = _get_or_create_user(db, ADITYA_NAME, ADITYA_PHONE)

        print("\n[2] Ensuring Rayan exists as a real User...")
        rayan = _get_or_create_user(db, RAYAN_NAME, RAYAN_PHONE)

        print("\n[3] Ensuring Aditya's TrustedContact -> Rayan exists...")
        contact = _get_or_create_guardian_contact(db, aditya, rayan)

        db.commit()

        print("\n" + "=" * 60)
        print("VERIFICATION SUMMARY")
        print("=" * 60)
        print("  Aditya user_id          : {}".format(aditya.id))
        print("  Rayan  user_id          : {}".format(rayan.id))
        print("  TrustedContact id       : {}".format(contact.id))
        print("  contact.user_id         : {}  (owner = Aditya)".format(contact.user_id))
        print("  contact.guardian_user_id: {}  (guardian = Rayan)".format(contact.guardian_user_id))
        print("  contact.contact_name    : {}".format(contact.contact_name))
        print("  contact.phone_masked    : {}".format(contact.phone_masked))
        print()
        print("HOW THE RELATIONSHIP IS USED:")
        print("  1. Aditya initiates a high-risk payment -> transaction.user_id = Aditya.id")
        print("  2. System looks up: TrustedContact WHERE user_id = Aditya.id")
        print("     -> finds contact.id and contact.guardian_user_id = Rayan.id")
        print("  3. GuardianRequest is created with trusted_contact_id = contact.id")
        print("  4. Rayan's dashboard polls:")
        print("     GET /api/v1/guardian/requests/pending/{}".format(contact.id))
        print("     -- or -- uses guardian_user_id to look up his contact IDs first.")
        print("=" * 60)
        print("Done. No blocking issues.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
