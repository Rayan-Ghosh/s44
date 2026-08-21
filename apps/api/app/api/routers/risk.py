"""
/api/v1/risk — Authoritative real-time risk scoring endpoint powered by MLPredictor.
"""

from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.alert import Alert
from app.models.enums import AlertStatus, RiskDecision, RiskLevel, TransactionStatus
from app.repositories import risk_repository, transaction_repository
from app.schemas.risk import RiskEvaluationRequest, RiskScoreRead
from ml.inference.predict import get_predictor

router = APIRouter(prefix="/api/v1/risk", tags=["risk"])


@router.get("/{transaction_id}", response_model=RiskScoreRead)
def get_risk_score(transaction_id: int, db: Session = Depends(get_db)) -> RiskScoreRead:
    if transaction_repository.get_transaction(db, transaction_id) is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")

    risk_score = risk_repository.get_latest_risk_score(db, transaction_id)
    if risk_score is None:
        raise HTTPException(
            status_code=404,
            detail=f"No risk evaluation exists yet for transaction {transaction_id}.",
        )
    return risk_score


@router.post("/evaluate")
def evaluate_risk(payload: RiskEvaluationRequest, db: Session = Depends(get_db)) -> dict:
    """
    Executes live multi-signal ML scoring (<20ms) for an existing transaction.
    Persists RiskScore and RiskFactor rows and returns the authoritative RiskDecisionPackage.
    """
    txn = transaction_repository.get_transaction(db, payload.transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {payload.transaction_id} not found.")

    predictor = get_predictor()

    user_risk_profile = txn.user.risk_profile if txn.user and txn.user.risk_profile else {}

    inference_input = {
        "transaction": {
            "transaction_id": str(txn.id),
            "amount": float(txn.amount),
            "recipient_id": str(txn.recipient_id),
            "timestamp": txn.timestamp.isoformat() if txn.timestamp else "",
            "device_id": str(txn.device_id),
            "location": txn.location or "",
            "voice_transcript": "",
        },
        "user_profile": user_risk_profile,
    }

    decision_package = predictor.predict(inference_input)

    # Map decision package to DB enums
    level_map = {"LOW": RiskLevel.LOW, "MEDIUM": RiskLevel.MEDIUM, "HIGH": RiskLevel.HIGH}
    decision_map = {
        "ALLOW": RiskDecision.ALLOW,
        "WARN_CHOICE": RiskDecision.WARN,
        "CONFIRM_OR_CANCEL": RiskDecision.CONFIRM_OR_CANCEL,
    }

    r_level = level_map.get(decision_package["risk_level"], RiskLevel.LOW)
    r_dec = decision_map.get(decision_package["decision"], RiskDecision.ALLOW)

    # Format risk factors for storage
    factors_to_save = []
    for factor_name in decision_package.get("risk_factors", []):
        pct = decision_package.get("risk_contributions_pct", {}).get(factor_name, 0.0)
        factors_to_save.append({
            "factor_type": "ml_signal",
            "name": factor_name,
            "contribution": pct,
            "explanation": factor_name.replace("_", " ").title(),
        })

    # Save to database
    saved_score = risk_repository.save_risk_evaluation(
        db,
        transaction_id=txn.id,
        fraud_probability=float(decision_package.get("sub_scores", {}).get("transaction_fraud", 0.0)),
        final_score=float(decision_package["risk_score"]),
        risk_level=r_level,
        decision=r_dec,
        risk_factors=factors_to_save,
    )

    # If HIGH or MEDIUM, create an Alert for analyst console
    if r_level in (RiskLevel.HIGH, RiskLevel.MEDIUM):
        alert = Alert(
            transaction_id=txn.id,
            risk_score_id=saved_score.id,
            severity=r_level,
            summary="; ".join(decision_package.get("plain_language_reasons", [])) or f"Flagged {r_level.value} Risk UPI Payment (₹{txn.amount})",
            status=AlertStatus.OPEN,
        )
        db.add(alert)
        db.commit()

    return decision_package

