"""
/api/v1/simulator — 1-Click judge demonstration scenario presets.
"""

from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_identifier, mask_phone
from app.models.enums import RiskDecision, RiskLevel, TransactionStatus
from app.repositories import guardian_repository, risk_repository, transaction_repository, user_repository
from app.schemas.simulator import ScenarioExecuteResponse, ScenarioPreset
from app.schemas.transaction import TransactionCreate
from app.services import transaction_service
from ml.inference.predict import get_predictor


router = APIRouter(prefix="/api/v1/simulator", tags=["simulator"])

SCENARIOS = [
    {
        "id": "scenario_a",
        "title": "Scenario A: Routine Grocery / Chai",
        "badge": "LOW RISK",
        "description": "₹450 routine morning tea and snack at local merchant from primary trusted phone.",
        "expected_band": "LOW",
        "expected_score_range": "0 - 15",
        "payload": {
            "user_name": "Rohan Verma",
            "phone_number": "+91-98765-11111",
            "amount": 450.00,
            "recipient_vpa": "sharma.chai@upi",
            "device_name": "Rohan iPhone 15",
            "location": "Indiranagar, Bengaluru",
            "voice_transcript": "",
            "user_profile": {"normal_avg_amount": 500.0, "normal_std_amount": 150.0},
        },
    },
    {
        "id": "scenario_b",
        "title": "Scenario B: Sudden High-Value Spike",
        "badge": "HIGH RISK (HOLD)",
        "description": "₹85,000 sent to a brand new unknown UPI ID at 2:00 AM (35x user average).",
        "expected_band": "HIGH",
        "expected_score_range": "75 - 90",
        "payload": {
            "user_name": "Ananya Sen",
            "phone_number": "+91-98765-22222",
            "amount": 85000.00,
            "recipient_vpa": "unknown.crypto.trader@upi",
            "device_name": "Ananya Samsung S23",
            "location": "Kolkata",
            "voice_transcript": "",
            "user_profile": {"normal_avg_amount": 2500.0, "normal_std_amount": 800.0},
        },
    },
    {
        "id": "scenario_c",
        "title": "Scenario C: Velocity Spike Bursts",
        "badge": "MEDIUM RISK",
        "description": "4 successive rapid ₹9,999 transfers in 90 seconds (Structuring pattern).",
        "expected_band": "MEDIUM-HIGH",
        "expected_score_range": "55 - 75",
        "payload": {
            "user_name": "Vikram Malhotra",
            "phone_number": "+91-98765-33333",
            "amount": 9999.00,
            "recipient_vpa": "merchant.fastpay@upi",
            "device_name": "Vikram OnePlus",
            "location": "Mumbai",
            "voice_transcript": "",
            "user_profile": {"normal_avg_amount": 3000.0, "velocity_10m": 4},
        },
    },
    {
        "id": "scenario_d",
        "title": "Scenario D: Impossible Travel / Device Switch",
        "badge": "HIGH RISK (HOLD)",
        "description": "Brand new unrecognized phone logging in from London 15 minutes after Delhi login.",
        "expected_band": "HIGH",
        "expected_score_range": "70 - 85",
        "payload": {
            "user_name": "Priya Sharma",
            "phone_number": "+91-98765-44444",
            "amount": 35000.00,
            "recipient_vpa": "forex.transfer@upi",
            "device_name": "Unknown Linux Browser",
            "location": "London, UK",
            "voice_transcript": "",
            "user_profile": {"normal_avg_amount": 5000.0, "impossible_travel_speed_kmh": 1200.0, "new_device": 1.0},
        },
    },
    {
        "id": "scenario_e",
        "title": "Scenario E: Voice Phishing / Digital Arrest Scam",
        "badge": "HIGH RISK (GUARDIAN HOLD)",
        "description": "Caller impersonating Cyber Crime Police demanding immediate ₹45,000 settlement to avoid arrest.",
        "expected_band": "HIGH",
        "expected_score_range": "80 - 95",
        "payload": {
            "user_name": "Sunita Devi",
            "phone_number": "+91-98765-55555",
            "amount": 45000.00,
            "recipient_vpa": "cyber.police.verify@upi",
            "device_name": "Sunita Vivo Phone",
            "location": "Jaipur",
            "voice_transcript": "This is Officer Rathore from CBI Cyber Crime. Your Aadhaar is linked to illegal narcotics. A digital arrest warrant is issued. Do not disconnect the call or inform family. Immediately transfer ₹45,000 security deposit for verification.",
            "user_profile": {"normal_avg_amount": 1500.0, "normal_std_amount": 400.0},
        },
    },
    {
        "id": "scenario_f",
        "title": "Scenario F: Legitimate High-Value User (FP Suppression)",
        "badge": "LOW RISK (FALSE POSITIVE SUPPRESSED)",
        "description": "₹95,000 vendor payment by a business owner with regular large historical transactions.",
        "expected_band": "LOW-MEDIUM",
        "expected_score_range": "15 - 30",
        "payload": {
            "user_name": "Aditya Ghosh",
            "phone_number": "+91-98765-66666",
            "amount": 95000.00,
            "recipient_vpa": "steel.suppliers@upi",
            "device_name": "Aditya MacBook / Pixel",
            "location": "Bhubaneswar",
            "voice_transcript": "",
            "user_profile": {"normal_avg_amount": 80000.0, "normal_std_amount": 25000.0, "amount_zscore": 0.6},
        },
    },
    {
        "id": "scenario_g",
        "title": "Scenario G: Cold-Start New User",
        "badge": "SAFETY CAUTION",
        "description": "Day 1 user with zero historical transaction records.",
        "expected_band": "LOW-MEDIUM",
        "expected_score_range": "20 - 40",
        "payload": {
            "user_name": "New UPI Customer",
            "phone_number": "+91-98765-77777",
            "amount": 1500.00,
            "recipient_vpa": "first.transfer@upi",
            "device_name": "New Moto G",
            "location": "Pune",
            "voice_transcript": "",
            "user_profile": {"profile_is_cold": 1.0},
        },
    },
]


@router.get("/scenarios", response_model=list[ScenarioPreset])
def list_scenario_presets() -> list[ScenarioPreset]:
    return [ScenarioPreset(**s) for s in SCENARIOS]


@router.post("/scenarios/{scenario_id}/execute", response_model=ScenarioExecuteResponse)
def execute_scenario_preset(scenario_id: str, db: Session = Depends(get_db)) -> ScenarioExecuteResponse:
    match = next((s for s in SCENARIOS if s["id"] == scenario_id), None)
    if not match:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found.")

    p = match["payload"]

    # 1. Create or get user
    user = user_repository.get_user_by_phone_hash(db, hash_identifier(p["phone_number"]))
    if not user:
        user = user_repository.create_user(db, name=p["user_name"], phone_hash=hash_identifier(p["phone_number"]))
    user.risk_profile = p["user_profile"]
    db.commit()

    # 2. Create transaction via domain service
    txn = transaction_service.create_transaction(
        db,
        TransactionCreate(
            user_id=user.id,
            recipient_identifier=p["recipient_vpa"],
            device_identifier=p["device_name"],
            amount=Decimal(str(p["amount"])),
            location=p["location"],
            payment_method="UPI",
        ),
    )


    # 4. Predict
    predictor = get_predictor()
    inference_input = {
        "transaction": {
            "transaction_id": str(txn.id),
            "amount": float(p["amount"]),
            "recipient_id": str(txn.recipient_id),
            "timestamp": txn.timestamp.isoformat(),
            "device_id": str(txn.device_id),
            "location": p["location"],
            "voice_transcript": p.get("voice_transcript", ""),
        },

        "user_profile": p["user_profile"],
    }
    decision_package = predictor.predict(inference_input)

    # 5. Save RiskScore
    level_map = {"LOW": RiskLevel.LOW, "MEDIUM": RiskLevel.MEDIUM, "HIGH": RiskLevel.HIGH}
    decision_map = {"ALLOW": RiskDecision.ALLOW, "WARN_CHOICE": RiskDecision.WARN, "CONFIRM_OR_CANCEL": RiskDecision.CONFIRM_OR_CANCEL}
    r_level = level_map.get(decision_package["risk_level"], RiskLevel.LOW)
    r_dec = decision_map.get(decision_package["decision"], RiskDecision.ALLOW)

    factors_to_save = []
    for f_name in decision_package.get("risk_factors", []):
        factors_to_save.append({
            "factor_type": "ml_signal",
            "name": f_name,
            "contribution": decision_package.get("risk_contributions_pct", {}).get(f_name, 0.0),
            "explanation": f_name.replace("_", " ").title(),
        })

    risk_repository.save_risk_evaluation(
        db,
        transaction_id=txn.id,
        fraud_probability=float(decision_package.get("sub_scores", {}).get("transaction_fraud", 0.0)),
        final_score=float(decision_package["risk_score"]),
        risk_level=r_level,
        decision=r_dec,
        risk_factors=factors_to_save,
    )

    # 6. Check if Guardian hold triggered (HIGH risk)
    held_for_guardian = False
    g_req_id = None
    if r_level == RiskLevel.HIGH:
        # Enrol demo guardian if none exists
        contacts = guardian_repository.get_trusted_contacts_by_user(db, user.id)
        if not contacts:
            contact = guardian_repository.create_trusted_contact(
                db,
                user_id=user.id,
                contact_name="Family Member (Son/Daughter)",
                contact_phone_hash=hash_identifier("+91-99999-00000"),
                phone_masked="+91-99999-XXXXX",
                relationship="Child",
            )
        else:
            contact = contacts[0]

        req = guardian_repository.create_guardian_request(db, transaction_id=txn.id, trusted_contact_id=contact.id, expires_in_seconds=120)
        transaction_repository.update_transaction_status(db, txn.id, TransactionStatus.PENDING_GUARDIAN_APPROVAL)
        held_for_guardian = True
        g_req_id = req.id

    return ScenarioExecuteResponse(
        scenario_id=scenario_id,
        transaction_id=txn.id,
        user_name=p["user_name"],
        amount=float(p["amount"]),
        risk_score=int(decision_package["risk_score"]),
        risk_level=decision_package["risk_level"],
        decision=decision_package["decision"],
        plain_language_reasons=decision_package["plain_language_reasons"],
        risk_contributions_pct=decision_package["risk_contributions_pct"],
        latency_ms=decision_package["latency_ms"],
        held_for_guardian=held_for_guardian,
        guardian_request_id=g_req_id,
    )
