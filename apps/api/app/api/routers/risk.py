"""
/api/v1/risk — Authoritative real-time risk scoring endpoint powered by MLPredictor.
"""

import logging
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import PaymentWorkflowStage
from app.repositories import risk_repository, transaction_repository
from app.schemas.risk import RiskEvaluationRequest, RiskScoreRead
from app.services import recipient_profile_service, risk_service
from app.services.security_audit_service import SecurityAuditService

logger = logging.getLogger(__name__)

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
def evaluate_risk(payload: dict, db: Session = Depends(get_db)) -> dict:
    """Executes live multi-signal ML scoring (<20ms) for an existing transaction or pre-payment draft.

    When transaction_id is provided, scores the existing transaction and persists RiskScore.
    When recipient and amount are provided, performs pre-payment evaluation (advisory only, no DB mutations).
    """
    if "transaction_id" in payload:
        txn_id = payload.get("transaction_id")
        if txn_id is None or not str(txn_id).isdigit():
            raise HTTPException(status_code=422, detail="transaction_id must be a valid integer.")
        txn_id_int = int(txn_id)

        try:
            decision_package = risk_service.evaluate(db, txn_id_int, raw_payload=payload)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=503,
                detail="Risk scoring is temporarily unavailable. Please try again.",
            )

        SecurityAuditService.log_event(
            "RISK_EVALUATED",
            transaction_id=txn_id_int,
            details={"risk_level": decision_package.get("risk_level"), "risk_score": decision_package.get("risk_score")},
            db=db,
        )

        decision_package["stage"] = PaymentWorkflowStage.EVALUATION_COMPLETED.value
        return decision_package

    if "recipient" in payload or "amount" in payload:
        return risk_service.evaluate_prepayment(db, payload)

    raise HTTPException(
        status_code=422,
        detail="Either transaction_id or recipient and amount must be provided.",
    )


@router.post("/{transaction_id}/recipient-evaluate")
def evaluate_recipient_risk(transaction_id: int, db: Session = Depends(get_db)) -> dict:
    """
    Real-data, recipient-centric second opinion (s40_transaction_fraud_real /
    s40_behaviour_anomaly_real — see docs/FRAUD_MODEL_CARD_REAL.md).

    Deliberately ADDITIVE, not a replacement for POST /evaluate: this is a
    newly-trained model with materially weaker validated real-data support
    (see the model cards' own honesty sections) and a different feature
    contract. It is not wired into the authoritative risk decision
    (app/services/risk_service.py) or the payment state machine — callers
    get a second, clearly-separate signal, not a second authority.
    """
    from ml.inference.recipient_predictor import get_recipient_predictor

    txn = transaction_repository.get_transaction(db, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")
    if txn.recipient is None or not txn.recipient.recipient_hash:
        raise HTTPException(status_code=422, detail="Transaction has no recipient to evaluate.")

    features = recipient_profile_service.compute_recipient_features(
        db,
        recipient_hash=txn.recipient.recipient_hash,
        amount=float(txn.amount),
        as_of=txn.timestamp,
        exclude_transaction_id=txn.id,
    )

    predictor = get_recipient_predictor()
    if not predictor.available:
        raise HTTPException(
            status_code=503,
            detail="Real-data recipient model is not trained/registered yet.",
        )

    result = predictor.predict(features)
    result["transaction_id"] = transaction_id
    result["features_used"] = features
    return result

