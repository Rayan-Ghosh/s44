"""
/api/v1/demo — dynamic, backend-persisted demo transaction generator
(AVARAN PAY spec §9). Distinct from the pre-existing /api/v1/simulator
(app/api/routers/simulator.py), which offers 7 fixed named-person judge
presets — this router generates randomized transactions per call and drives
them through the real create → risk → guardian → UPI-launch → confirm
pipeline (same services simulator.py uses), so generated data is never a
parallel hardcoded structure the frontend could disagree with.
"""

import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_identifier
from app.models.alert import Alert
from app.models.audit_log import AuditLog
from app.models.enums import GuardianOutcome
from app.models.enums import TransactionStatus as S
from app.models.guardian_request import GuardianRequest
from app.models.risk_factor import RiskFactor
from app.models.risk_score import RiskScore
from app.models.transaction import Transaction
from app.repositories import guardian_repository, transaction_repository, user_repository
from app.schemas.transaction import TransactionCreate
from app.services import guardian_service, notification_service, payment_lifecycle_service, risk_service, transaction_service
from app.services.security_audit_service import SecurityAuditService
from app.services.transaction_integrity_service import TransactionIntegrityService
from app.services.transaction_state_machine import transition

router = APIRouter(prefix="/api/v1/demo", tags=["demo"])

SCENARIOS = [
    {"id": "low_continue", "band": "LOW", "title": "LOW-risk payment, user continues", "outcome": "COMPLETED"},
    {"id": "low_cancel", "band": "LOW", "title": "LOW-risk payment, user cancels", "outcome": "CANCELLED"},
    {"id": "medium_continue", "band": "MEDIUM", "title": "MEDIUM-risk payment, user continues", "outcome": "COMPLETED"},
    {"id": "medium_cancel", "band": "MEDIUM", "title": "MEDIUM-risk payment, user cancels", "outcome": "CANCELLED"},
    {"id": "high_guardian_approved", "band": "HIGH", "title": "HIGH-risk payment, Guardian approves", "outcome": "COMPLETED"},
    {"id": "high_guardian_rejected", "band": "HIGH", "title": "HIGH-risk payment, Guardian rejects", "outcome": "GUARDIAN_REJECTED"},
    {"id": "high_guardian_timeout", "band": "HIGH", "title": "HIGH-risk payment, Guardian does not respond", "outcome": "GUARDIAN_TIMEOUT"},
    {"id": "cancel_before_launch", "band": "LOW", "title": "Payment cancelled before UPI launch", "outcome": "CANCELLED"},
    {"id": "upi_launch_then_complete", "band": "LOW", "title": "UPI launch followed by user-confirmed completion", "outcome": "COMPLETED"},
    {"id": "duplicate_confirmation_attempt", "band": "LOW", "title": "Duplicate confirmation against a completed transaction", "outcome": "COMPLETED"},
]

_FIRST_NAMES = ["Arjun", "Meera", "Kabir", "Ishita", "Rohan", "Divya", "Aarav", "Sana", "Yash", "Naina"]
_LAST_NAMES = ["Rao", "Iyer", "Kapoor", "Singh", "Nair", "Gupta", "Bose", "Menon", "Chauhan", "Reddy"]
_VPA_HANDLES = ["okhdfcbank", "okicici", "okaxis", "oksbi", "upi"]


def _band_payload(band: str, rng: random.Random) -> dict:
    """Amount/profile templates tuned to reliably land in the requested
    band, following the same amount-vs-profile relationship already probed
    in app/api/routers/simulator.py's fixed presets — randomized per call."""
    name = f"{rng.choice(_FIRST_NAMES)} {rng.choice(_LAST_NAMES)}"
    phone = f"+91-9{rng.randint(1000, 9999)}-{rng.randint(10000, 99999)}"
    recipient_vpa = f"demo.{rng.randint(1000, 999999)}@{rng.choice(_VPA_HANDLES)}"
    device_name = f"{name.split()[0]}'s Demo Device"
    location = rng.choice(["Bengaluru", "Mumbai", "Delhi", "Pune", "Chennai", "Hyderabad"])

    if band == "LOW":
        amount = rng.uniform(200, 900)
        profile = {"normal_avg_amount": 500.0, "normal_std_amount": 150.0}
    elif band == "MEDIUM":
        amount = rng.uniform(8000, 12000)
        profile = {"normal_avg_amount": 3000.0, "velocity_10m": 4}
    else:  # HIGH
        amount = rng.uniform(60000, 120000)
        profile = {"normal_avg_amount": 2500.0, "normal_std_amount": 800.0}

    return {
        "user_name": name,
        "phone_number": phone,
        "amount": round(amount, 2),
        "recipient_vpa": recipient_vpa,
        "device_name": device_name,
        "location": location,
        "user_profile": profile,
    }


@router.get("/scenarios")
def list_scenarios() -> list[dict]:
    return SCENARIOS


@router.post("/generate-transaction")
def generate_transaction(payload: dict, db: Session = Depends(get_db)) -> dict:
    scenario_id = payload.get("scenario_id") or payload.get("scenario")
    scenario = next((s for s in SCENARIOS if s["id"] == scenario_id), None)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Demo scenario '{scenario_id}' not found.")

    rng = random.Random()
    p = _band_payload(scenario["band"], rng)

    user = user_repository.get_user_by_phone_hash(db, hash_identifier(p["phone_number"]))
    if not user:
        user = user_repository.create_user(db, name=p["user_name"], phone_hash=hash_identifier(p["phone_number"]))
    user.risk_profile = p["user_profile"]
    db.commit()

    txn = transaction_service.create_transaction(
        db,
        TransactionCreate(
            user_id=user.id,
            recipient_identifier=p["recipient_vpa"],
            recipient_display_name=p["recipient_vpa"].split("@")[0].title(),
            device_identifier=p["device_name"],
            amount=Decimal(str(p["amount"])),
            location=p["location"],
            payment_method="UPI",
        ),
    )
    txn.is_demo = True
    txn.source = "PAYMENT_REQUEST"
    db.commit()

    decision_package = risk_service.evaluate(db, txn.id)
    SecurityAuditService.log_event(
        "DEMO_TRANSACTION_GENERATED",
        user_id=user.id,
        transaction_id=txn.id,
        details={"scenario_id": scenario_id, "risk_level": decision_package.get("risk_level")},
        db=db,
    )
    notification_service.notify(
        db,
        user_id=user.id,
        type="DEMO_TRANSACTION_GENERATED",
        title="Demo transaction generated",
        body=f"Demo scenario '{scenario_id}' generated a ₹{p['amount']} transaction.",
        transaction_id=txn.id,
    )

    guardian_request_id = None
    if scenario["band"] == "HIGH":
        contacts = guardian_repository.get_trusted_contacts_by_user(db, user.id)
        if not contacts:
            contact = guardian_repository.create_trusted_contact(
                db,
                user_id=user.id,
                contact_name="Demo Family Guardian",
                contact_phone_hash=hash_identifier(f"+91-99999-{rng.randint(10000, 99999)}"),
                phone_masked="+91-99999-XXXXX",
                relationship="Child",
            )
        else:
            contact = contacts[0]

        req = guardian_repository.create_guardian_request(
            db, transaction_id=txn.id, trusted_contact_id=contact.id, expires_in_seconds=120
        )
        db.refresh(txn)
        txn = transition(db, txn, S.PENDING_GUARDIAN_APPROVAL, idempotent_ok=True)
        guardian_request_id = req.id
        SecurityAuditService.log_event(
            "GUARDIAN_REQUESTED", user_id=user.id, transaction_id=txn.id,
            details={"trusted_contact_id": contact.id}, db=db,
        )

        if scenario["id"] == "high_guardian_approved":
            guardian_repository.resolve_guardian_request(db, req.id, GuardianOutcome.APPROVED, "Approved (demo)")
            txn = transition(db, txn, S.GUARDIAN_APPROVED)
            g_hash = TransactionIntegrityService.compute_integrity_hash(txn)
            txn.guardian_integrity_hash = g_hash
            txn.integrity_hash = g_hash
            txn.authorization_status = "AUTHORIZED"
            txn.authorized_at = datetime.now(timezone.utc)
            db.commit()
            payment_lifecycle_service.launch_upi(
                db, txn.id, app="GPAY", amount=Decimal(str(p["amount"])), recipient_identifier=p["recipient_vpa"]
            )
            result = payment_lifecycle_service.confirm(db, txn.id)
            txn = result.transaction
        elif scenario["id"] == "high_guardian_rejected":
            guardian_repository.resolve_guardian_request(db, req.id, GuardianOutcome.REJECTED, "Rejected (demo)")
            txn = transition(db, txn, S.GUARDIAN_REJECTED)
        elif scenario["id"] == "high_guardian_timeout":
            # Fast-forward the real 120s expiry window for demo purposes,
            # then run it through the same expiry check the background
            # worker uses (app/services/guardian_service.py) rather than
            # stamping TIMEOUT directly.
            req.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            db.commit()
            guardian_service.check_and_expire_request(db, req)
            db.refresh(txn)
    else:
        if scenario["id"] in ("low_cancel", "medium_cancel", "cancel_before_launch"):
            result = payment_lifecycle_service.cancel(db, txn.id)
            txn = result.transaction
        elif scenario["id"] in ("low_continue", "medium_continue", "upi_launch_then_complete"):
            payment_lifecycle_service.launch_upi(
                db, txn.id, app="GPAY", amount=Decimal(str(p["amount"])), recipient_identifier=p["recipient_vpa"]
            )
            result = payment_lifecycle_service.confirm(db, txn.id)
            txn = result.transaction
        elif scenario["id"] == "duplicate_confirmation_attempt":
            payment_lifecycle_service.launch_upi(
                db, txn.id, app="GPAY", amount=Decimal(str(p["amount"])), recipient_identifier=p["recipient_vpa"]
            )
            payment_lifecycle_service.confirm(db, txn.id)
            dup = payment_lifecycle_service.confirm(db, txn.id)
            txn = dup.transaction

    db.refresh(txn)
    return {
        "transaction_id": txn.id,
        "scenario_id": scenario_id,
        "source": txn.source,
        "amount": float(txn.amount),
        "recipient": p["recipient_vpa"],
        "status": txn.status.value,
        "guardian_required": guardian_request_id is not None,
        "guardian_request_id": guardian_request_id,
        "created_at": txn.timestamp.isoformat() if txn.timestamp else None,
        "is_demo": True,
    }


@router.get("/transactions")
def list_demo_transactions(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)) -> list[dict]:
    rows = (
        db.query(Transaction)
        .filter(Transaction.is_demo.is_(True))
        .order_by(Transaction.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "transaction_id": t.id,
            "amount": float(t.amount),
            "status": t.status.value,
            "source": t.source,
            "created_at": t.timestamp.isoformat() if t.timestamp else None,
        }
        for t in rows
    ]


@router.post("/reset")
def reset_demo_data(db: Session = Depends(get_db)) -> dict:
    """Deletes all is_demo=True transactions and their dependent rows for a
    clean, repeatable presentation state. Real (non-demo) data is untouched."""
    demo_txn_ids = [t.id for t in db.query(Transaction.id).filter(Transaction.is_demo.is_(True)).all()]
    if not demo_txn_ids:
        return {"deleted_transactions": 0}

    risk_score_ids = [
        r.id for r in db.query(RiskScore.id).filter(RiskScore.transaction_id.in_(demo_txn_ids)).all()
    ]
    if risk_score_ids:
        db.query(RiskFactor).filter(RiskFactor.risk_score_id.in_(risk_score_ids)).delete(synchronize_session=False)
    db.query(Alert).filter(Alert.transaction_id.in_(demo_txn_ids)).delete(synchronize_session=False)
    db.query(RiskScore).filter(RiskScore.transaction_id.in_(demo_txn_ids)).delete(synchronize_session=False)
    db.query(GuardianRequest).filter(GuardianRequest.transaction_id.in_(demo_txn_ids)).delete(synchronize_session=False)
    resources = [f"transaction:{tid}" for tid in demo_txn_ids]
    db.query(AuditLog).filter(AuditLog.resource.in_(resources)).delete(synchronize_session=False)
    db.query(Transaction).filter(Transaction.id.in_(demo_txn_ids)).delete(synchronize_session=False)
    db.commit()

    SecurityAuditService.log_event("DEMO_RESET", details={"deleted_transactions": len(demo_txn_ids)}, db=db)
    return {"deleted_transactions": len(demo_txn_ids)}
