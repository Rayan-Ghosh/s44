"""
Initialize and seed the local development database (Avaran.db).

Avaran.db is a LOCAL DEVELOPMENT/TESTING database, git-ignored.
Anyone on the team gets an identical schema plus demo dataset by running:

    python scripts/seed_database.py

Schema is owned by Alembic (apps/api/alembic/) — this script runs
`alembic upgrade head` rather than creating tables itself, so the seeded
database always matches the latest migrations.
"""

from decimal import Decimal
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
API_ROOT = REPO_ROOT / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

from app.core.contact_encryption import encrypt_field  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_identifier, hash_password, mask_phone  # noqa: E402
from app.models.alert import Alert  # noqa: E402
from app.models.enums import AlertStatus, ConsentStatus, GuardianOutcome, RiskDecision, RiskLevel, TransactionStatus  # noqa: E402
from app.models.guardian_request import GuardianRequest  # noqa: E402
from app.models.risk_factor import RiskFactor  # noqa: E402
from app.models.risk_score import RiskScore  # noqa: E402
from app.models.transaction import Transaction  # noqa: E402
from app.models.trusted_contact import TrustedContact  # noqa: E402
from app.models.user_contact_info import UserContactInfo  # noqa: E402
from app.repositories import risk_repository, user_repository  # noqa: E402
from app.schemas.transaction import TransactionCreate  # noqa: E402
from app.schemas.user import UserCreate  # noqa: E402
from app.services import transaction_service, user_service  # noqa: E402

DEMO_USERS = [
    {
        "name": "Rayan",
        "phone_number": "+91-89187-68254",
        "email": "rayan@example.com",
        "password": "Rayan@2005",
        "device_identifier": "default-mobile-device",
        "transactions": [
            {
                "recipient_identifier": "urgent.tax.clearance@axis",
                "recipient_display_name": "Unknown High-Risk Recipient",
                "amount": Decimal("52000.00"),
                "location": "Mumbai",
                "payment_method": "UPI",
                "status": TransactionStatus.PENDING_AUTHORIZATION,
                "risk": {
                    "score": 89.0,
                    "level": RiskLevel.HIGH,
                    "decision": RiskDecision.CONFIRM_OR_CANCEL,
                    "factors": [
                        {"type": "behaviour", "name": "amount_spike", "contribution": 45.0, "explanation": "Transaction amount (Rs 52,000) is 18x higher than user's 30-day average."},
                        {"type": "recipient", "name": "new_recipient", "contribution": 35.0, "explanation": "Recipient VPA has no prior payment history across network."},
                        {"type": "voice", "name": "coercion_risk", "contribution": 20.0, "explanation": "Live call analysis detected urgent authority impersonation coercion pattern."}
                    ],
                    "alert": "High-risk suspicious payment of Rs 52,000 flagged under urgent authority coercion patterns."
                }
            },
            {
                "recipient_identifier": "crypto.investment.desk@upi",
                "recipient_display_name": "Crypto Trading Desk",
                "amount": Decimal("14500.00"),
                "location": "Mumbai",
                "payment_method": "UPI",
                "status": TransactionStatus.PENDING,
                "risk": {
                    "score": 68.0,
                    "level": RiskLevel.MEDIUM,
                    "decision": RiskDecision.WARN,
                    "factors": [
                        {"type": "behaviour", "name": "amount_deviation", "contribution": 40.0, "explanation": "Transaction amount is significantly higher than usual peer transfers."},
                        {"type": "recipient", "name": "flagged_category", "contribution": 28.0, "explanation": "Unregistered high-velocity merchant category."}
                    ],
                    "alert": "Transaction amount of Rs 14,500 exceeds normal spending velocity."
                }
            },
            {
                "recipient_identifier": "swiggy.food@icici",
                "recipient_display_name": "Swiggy Food Delivery",
                "amount": Decimal("420.00"),
                "location": "Mumbai",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            },
            {
                "recipient_identifier": "uber.rides@upi",
                "recipient_display_name": "Uber India Mobility",
                "amount": Decimal("260.00"),
                "location": "Mumbai",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            },
            {
                "recipient_identifier": "tneb.electricity@billdesk",
                "recipient_display_name": "Electricity Bill Payment",
                "amount": Decimal("1850.00"),
                "location": "Mumbai",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            },
            {
                "recipient_identifier": "blinkit.groceries@upi",
                "recipient_display_name": "Blinkit Quick Commerce",
                "amount": Decimal("740.00"),
                "location": "Mumbai",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            },
            {
                "recipient_identifier": "amazon.seller@upi",
                "recipient_display_name": "Amazon India",
                "amount": Decimal("2999.00"),
                "location": "Mumbai",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            },
            {
                "recipient_identifier": "chai.point@upi",
                "recipient_display_name": "Chai Point",
                "amount": Decimal("110.00"),
                "location": "Mumbai",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            },
        ]
    },
    {
        "name": "Aditya",
        "phone_number": "+91-79036-88225",
        "email": "aditya@example.com",
        "password": "Aditya@2005",
        "device_identifier": "default-mobile-device",
        "transactions": [
            {
                "recipient_identifier": "blue.tokai.coffee@upi",
                "recipient_display_name": "Blue Tokai Coffee Roasters",
                "amount": Decimal("450.00"),
                "location": "Bengaluru",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            },
            {
                "recipient_identifier": "crossword.books@upi",
                "recipient_display_name": "Crossword Bookstore",
                "amount": Decimal("1200.00"),
                "location": "Bengaluru",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            },
            {
                "recipient_identifier": "flipkart.payment@okaxis",
                "recipient_display_name": "Flipkart Internet Pvt Ltd",
                "amount": Decimal("3400.00"),
                "location": "Bengaluru",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            },
            {
                "recipient_identifier": "nature.basket.groceries@upi",
                "recipient_display_name": "Nature's Basket",
                "amount": Decimal("1850.00"),
                "location": "Bengaluru",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            },
            {
                "recipient_identifier": "apollo.pharmacy@upi",
                "recipient_display_name": "Apollo Pharmacy",
                "amount": Decimal("380.00"),
                "location": "Bengaluru",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            },
            {
                "recipient_identifier": "international.wire.agent@upi",
                "recipient_display_name": "Overseas Remittance Agent",
                "amount": Decimal("48000.00"),
                "location": "Bengaluru",
                "payment_method": "UPI",
                "status": TransactionStatus.PENDING_AUTHORIZATION,
                "risk": {
                    "score": 86.0,
                    "level": RiskLevel.HIGH,
                    "decision": RiskDecision.CONFIRM_OR_CANCEL,
                    "factors": [
                        {"type": "behaviour", "name": "amount_spike", "contribution": 48.0, "explanation": "Transfer amount exceeds user's normal baseline by 12x."},
                        {"type": "recipient", "name": "unverified_overseas_vpa", "contribution": 38.0, "explanation": "Recipient account registered in high-risk offshore channel."}
                    ],
                    "alert": "High-risk transfer of Rs 48,000 flagged for guardian and user verification."
                }
            }
        ]
    },
    {
        "name": "Rahul Sharma",
        "phone_number": "+91-98765-43210",
        "email": "rahul.sharma@example.com",
        "password": "password123",
        "device_identifier": "default-mobile-device",
        "transactions": [
            {
                "recipient_identifier": "urgent.transfer@okaxis",
                "recipient_display_name": "Unknown High-Risk Recipient",
                "amount": Decimal("49000.00"),
                "location": "New Delhi",
                "payment_method": "UPI",
                "status": TransactionStatus.PENDING_AUTHORIZATION,
                "risk": {
                    "score": 88.0,
                    "level": RiskLevel.HIGH,
                    "decision": RiskDecision.CONFIRM_OR_CANCEL,
                    "factors": [
                        {"type": "behaviour", "name": "amount_spike", "contribution": 45.0, "explanation": "Transaction amount (Rs 49,000) is 15x higher than user's 30-day average."},
                        {"type": "recipient", "name": "new_recipient", "contribution": 35.0, "explanation": "Recipient VPA has no prior payment history across network."},
                        {"type": "voice", "name": "coercion_risk", "contribution": 20.0, "explanation": "Live call analysis detected high authority coercion pattern."}
                    ],
                    "alert": "High-risk suspicious payment of Rs 49,000 flagged under urgent authority coercion patterns."
                }
            },
            {
                "recipient_identifier": "electricity.utility@upi",
                "recipient_display_name": "Electricity Bill Payment",
                "amount": Decimal("1450.00"),
                "location": "Mumbai",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            },
            {
                "recipient_identifier": "quickmart.groceries@upi",
                "recipient_display_name": "Quick Mart Groceries",
                "amount": Decimal("820.00"),
                "location": "Mumbai",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            }
        ]
    },
    {
        "name": "Ananya Sharma",
        "phone_number": "+91-90000-00001",
        "email": "ananya.sharma@example.com",
        "password": "password123",
        "device_identifier": "DEV-FIXTURE-DEVICE-ANANYA-1",
        "transactions": [
            {
                "recipient_identifier": "ananya.friend@upi",
                "recipient_display_name": "Rohit Verma",
                "amount": Decimal("450.00"),
                "location": "Bhubaneswar",
                "payment_method": "UPI",
                "status": TransactionStatus.CONFIRMED,
            }
        ]
    },
    {
        "name": "Priya Nair",
        "phone_number": "+91-90000-00002",
        "email": "priya.nair@example.com",
        "password": "password123",
        "device_identifier": "DEV-FIXTURE-DEVICE-PRIYA-1",
        "transactions": [
            {
                "recipient_identifier": "priya.landlord@upi",
                "recipient_display_name": "Suresh Iyer",
                "amount": Decimal("12000.00"),
                "location": "Chennai",
                "payment_method": "UPI",
                "status": TransactionStatus.PENDING,
                "risk": {
                    "score": 66.0,
                    "level": RiskLevel.MEDIUM,
                    "decision": RiskDecision.WARN,
                    "factors": [
                        {"type": "behaviour", "name": "amount_deviation", "contribution": 40.0, "explanation": "Transaction amount is higher than this user's typical range."}
                    ],
                    "alert": "Transaction amount of Rs 12,000 exceeds usual velocity."
                }
            }
        ]
    },
]

DEMO_CONTACTS = [
    {
        "user_phone": "+91-89187-68254",
        "contact_name": "Aditya",
        "phone_number": "+91-79036-88225",
        "relationship": "Guardian",
    },
    {
        "user_phone": "+91-79036-88225",
        "contact_name": "Rayan",
        "phone_number": "+91-89187-68254",
        "relationship": "Ward",
    },
    {
        "user_phone": "+91-98765-43210",
        "contact_name": "Ramesh Sharma",
        "phone_number": "+91-98765-43299",
        "relationship": "Father",
    },
    {
        "user_phone": "+91-98765-43210",
        "contact_name": "Sunita Sharma",
        "phone_number": "+91-98765-43298",
        "relationship": "Mother",
    },
    {
        "user_phone": "+91-90000-00001",
        "contact_name": "Alok Sharma",
        "phone_number": "+91-90000-00099",
        "relationship": "Brother",
    },
]


def run_migrations() -> None:
    alembic_cfg = Config(str(API_ROOT / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(API_ROOT / "alembic"))
    command.upgrade(alembic_cfg, "head")


def seed_users_and_transactions(db) -> list[tuple]:
    results = []
    for demo in DEMO_USERS:
        phone_clean = demo["phone_number"]
        phone_hash = hash_identifier(phone_clean)
        user = user_repository.get_user_by_phone_hash(db, phone_hash)
        if user is None:
            user = user_service.create_user(
                db, UserCreate(name=demo["name"], phone_number=phone_clean), is_verified=True
            )

        # Ensure UserContactInfo exists with password hash
        contact_info = db.query(UserContactInfo).filter_by(user_id=user.id).first()
        if contact_info is None:
            contact_info = UserContactInfo(
                user_id=user.id,
                email_encrypted=encrypt_field(demo["email"]),
                phone_encrypted=encrypt_field(phone_clean),
                password_hash=hash_password(demo["password"]),
            )
            db.add(contact_info)
            db.commit()
        elif not contact_info.password_hash:
            contact_info.password_hash = hash_password(demo["password"])
            db.commit()

        for tx_data in demo.get("transactions", []):
            existing_tx = (
                db.query(Transaction)
                .filter(
                    Transaction.user_id == user.id,
                    Transaction.amount == tx_data["amount"],
                )
                .first()
            )
            if not existing_tx:
                created_tx = transaction_service.create_transaction(
                    db,
                    TransactionCreate(
                        user_id=user.id,
                        recipient_identifier=tx_data["recipient_identifier"],
                        recipient_display_name=tx_data["recipient_display_name"],
                        device_identifier=demo["device_identifier"],
                        amount=tx_data["amount"],
                        location=tx_data["location"],
                        payment_method=tx_data["payment_method"],
                    ),
                )
                if "status" in tx_data:
                    created_tx.status = tx_data["status"]
                    if tx_data["status"] == TransactionStatus.PENDING_AUTHORIZATION:
                        created_tx.authorization_required = True
                        created_tx.authorization_status = "PENDING"
                    db.commit()

                # Add risk data if defined
                if "risk" in tx_data:
                    r_info = tx_data["risk"]
                    r_score = RiskScore(
                        transaction_id=created_tx.id,
                        fraud_probability=0.88 if r_info["level"] == RiskLevel.HIGH else 0.65,
                        anomaly_score=0.85,
                        device_score=0.60,
                        behaviour_score=0.75,
                        final_score=r_info["score"],
                        risk_level=r_info["level"],
                        decision=r_info["decision"],
                    )
                    db.add(r_score)
                    db.flush()

                    for factor in r_info.get("factors", []):
                        db.add(
                            RiskFactor(
                                risk_score_id=r_score.id,
                                factor_type=factor["type"],
                                factor_name=factor["name"],
                                contribution=factor["contribution"],
                                explanation=factor["explanation"],
                            )
                        )
                    if "alert" in r_info:
                        db.add(
                            Alert(
                                transaction_id=created_tx.id,
                                risk_score_id=r_score.id,
                                severity=r_info["level"],
                                status=AlertStatus.OPEN,
                                summary=r_info["alert"],
                            )
                        )
                    db.commit()
                results.append((user, created_tx))
            else:
                results.append((user, existing_tx))
    return results


def seed_trusted_contacts(db) -> None:
    for item in DEMO_CONTACTS:
        phone_hash = hash_identifier(item["user_phone"])
        user = user_repository.get_user_by_phone_hash(db, phone_hash)
        if not user:
            continue

        c_phone_hash = hash_identifier(item["phone_number"])
        guardian_user = user_repository.get_user_by_phone_hash(db, c_phone_hash)
        guardian_id = guardian_user.id if guardian_user else None

        existing = db.query(TrustedContact).filter_by(user_id=user.id, contact_phone_hash=c_phone_hash).first()
        if not existing:
            contact = TrustedContact(
                user_id=user.id,
                contact_name=item["contact_name"],
                contact_phone_hash=c_phone_hash,
                phone_masked=mask_phone(item["phone_number"]),
                relationship=item["relationship"],
                consent_status=ConsentStatus.ACCEPTED,
                guardian_user_id=guardian_id,
            )
            db.add(contact)
            db.commit()
        elif existing.guardian_user_id != guardian_id:
            existing.guardian_user_id = guardian_id
            db.commit()


def seed() -> None:
    print("Running Alembic migrations...")
    run_migrations()

    with SessionLocal() as db:
        print("Seeding users and transactions...")
        seed_users_and_transactions(db)

        print("Seeding trusted contacts / guardian shield...")
        seed_trusted_contacts(db)

    print(f"Avaran.db successfully seeded and ready at: {REPO_ROOT / 'Avaran.db'}")


if __name__ == "__main__":
    seed()
