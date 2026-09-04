"""
risk_service — shared risk-evaluation logic behind both the pre-existing
`POST /api/v1/risk/evaluate` and the new `POST /api/v1/payments/{id}/analyse`
(AVARAN PAY spec §4, §11). Extracted verbatim from app/api/routers/risk.py's
evaluate_risk handler so the two entry points can't drift — no behavior
change for the existing endpoint.
"""

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.enums import AlertStatus, RiskDecision, RiskLevel
from app.models.enums import TransactionStatus as S
from app.models.transaction import Transaction
from app.repositories import risk_repository, transaction_repository
from ml.inference.predict import get_predictor

logger = logging.getLogger(__name__)


def evaluate(db: Session, txn_id: Optional[int], raw_payload: Optional[dict] = None) -> dict:
    """Run live ML risk scoring for an existing transaction (txn_id) or a raw
    payload (raw_payload, used when no persisted transaction exists yet).
    Persists RiskScore/RiskFactor rows and mutates the transaction's status/
    authorization flags by risk band when a transaction is given. Returns the
    raw decision package from the predictor."""
    predictor = get_predictor()

    txn: Optional[Transaction] = transaction_repository.get_transaction(db, txn_id) if txn_id else None

    if txn:
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
    else:
        payload = raw_payload or {}
        inference_input = payload if "transaction" in payload else {"transaction": payload, "user_profile": payload.get("user_profile", {})}

    try:
        decision_package = predictor.predict(inference_input)
    except Exception:
        logger.exception("ML risk scoring failed for transaction_id=%s", txn.id if txn else txn_id)
        raise

    level_map = {"LOW": RiskLevel.LOW, "MEDIUM": RiskLevel.MEDIUM, "HIGH": RiskLevel.HIGH}
    decision_map = {
        "ALLOW": RiskDecision.ALLOW,
        "WARN_CHOICE": RiskDecision.WARN,
        "CONFIRM_OR_CANCEL": RiskDecision.CONFIRM_OR_CANCEL,
    }
    r_level = level_map.get(decision_package["risk_level"], RiskLevel.LOW)
    r_dec = decision_map.get(decision_package["decision"], RiskDecision.ALLOW)

    factors_to_save = []
    for factor_name in decision_package.get("risk_factors", []):
        pct = decision_package.get("risk_contributions_pct", {}).get(factor_name, 0.0)
        factors_to_save.append(
            {
                "factor_type": "ml_signal",
                "name": factor_name,
                "contribution": pct,
                "explanation": factor_name.replace("_", " ").title(),
            }
        )

    if txn:
        saved_score = risk_repository.save_risk_evaluation(
            db,
            transaction_id=txn.id,
            fraud_probability=float(decision_package.get("sub_scores", {}).get("transaction_fraud", 0.0)),
            final_score=float(decision_package["risk_score"]),
            risk_level=r_level,
            decision=r_dec,
            risk_factors=factors_to_save,
        )

        if r_level == RiskLevel.HIGH:
            txn.authorization_required = True
            txn.authorization_status = "PENDING"
            txn.status = S.PENDING_AUTHORIZATION
        elif r_level == RiskLevel.LOW and txn.status == S.PENDING:
            txn.authorization_required = False
            txn.authorization_status = "NONE"
            txn.status = S.ALLOWED
        elif r_level == RiskLevel.MEDIUM and txn.status == S.PENDING:
            txn.authorization_required = False
            txn.authorization_status = "NONE"
            txn.status = S.AWAITING_CONFIRMATION

        if r_level in (RiskLevel.HIGH, RiskLevel.MEDIUM):
            alert = Alert(
                transaction_id=txn.id,
                risk_score_id=saved_score.id,
                severity=r_level,
                summary="; ".join(decision_package.get("plain_language_reasons", []))
                or f"Flagged {r_level.value} Risk UPI Payment (₹{txn.amount})",
                status=AlertStatus.OPEN,
            )
            db.add(alert)
        db.commit()

    return decision_package
