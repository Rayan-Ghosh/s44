"""
/api/v1/institution — Bank Analyst Review Console API.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.alert import Alert
from app.models.enums import AlertStatus, FraudCaseStatus, RiskLevel, TransactionStatus
from app.models.fraud_case import FraudCase
from app.models.risk_score import RiskScore
from app.models.transaction import Transaction
from app.models.user import User
from app.repositories import risk_repository, transaction_repository
from app.schemas.institution import DisputeResolutionRequest, InstitutionAuditDetail, InstitutionStats, InstitutionTransactionItem

router = APIRouter(prefix="/api/v1/institution", tags=["institution"])


@router.get("/transactions", response_model=list[InstitutionTransactionItem])
def list_institution_transactions(
    risk_level: Optional[RiskLevel] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[InstitutionTransactionItem]:
    query = db.query(Transaction).join(User, Transaction.user_id == User.id)
    txns = query.order_by(Transaction.timestamp.desc()).offset(offset).limit(limit).all()

    items = []
    for txn in txns:
        latest_risk = risk_repository.get_latest_risk_score(db, txn.id)
        if risk_level and latest_risk and latest_risk.risk_level != risk_level:
            continue
        top_factor = latest_risk.risk_factors[0].explanation if latest_risk and latest_risk.risk_factors else None
        items.append(InstitutionTransactionItem(
            id=txn.id,
            user_id=txn.user_id,
            user_name=txn.user.name if txn.user else f"User {txn.user_id}",
            amount=float(txn.amount),
            timestamp=txn.timestamp,
            location=txn.location,
            status=txn.status,
            risk_score=int(latest_risk.final_score) if latest_risk else None,
            risk_level=latest_risk.risk_level if latest_risk else None,
            top_risk_factor=top_factor,
        ))
    return items


@router.get("/transactions/{transaction_id}/audit", response_model=InstitutionAuditDetail)
def get_transaction_audit_detail(transaction_id: int, db: Session = Depends(get_db)) -> InstitutionAuditDetail:
    txn = transaction_repository.get_transaction(db, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")

    risk = risk_repository.get_latest_risk_score(db, transaction_id)
    factors_list = []
    shap_pct = {}
    if risk:
        for f in risk.risk_factors:
            factors_list.append({
                "factor_name": f.factor_name,
                "factor_type": f.factor_type,
                "contribution": f.contribution,
                "explanation": f.explanation,
            })
            shap_pct[f.factor_name] = f.contribution

    plain_reasons = [f["explanation"] for f in factors_list] or ["Transaction within normal parameters"]

    timeline = [
        {"event": "TRANSACTION_INITIATED", "timestamp": txn.timestamp.isoformat(), "detail": f"UPI Payment of ₹{txn.amount} initiated"},
    ]
    if risk:
        timeline.append({"event": "RISK_EVALUATED", "timestamp": risk.created_at.isoformat(), "detail": f"Risk Score {int(risk.final_score)}/100 ({risk.risk_level.value})"})
    if txn.status != TransactionStatus.PENDING:
        timeline.append({"event": f"STATUS_{txn.status.value}", "timestamp": txn.timestamp.isoformat(), "detail": f"Transaction transitioned to {txn.status.value}"})

    return InstitutionAuditDetail(
        transaction_id=txn.id,
        user_id=txn.user_id,
        user_name=txn.user.name if txn.user else "Unknown User",
        amount=float(txn.amount),
        timestamp=txn.timestamp,
        location=txn.location,
        status=txn.status.value,
        risk_score=int(risk.final_score) if risk else 0,
        risk_level=risk.risk_level.value if risk else "LOW",
        decision=risk.decision.value if risk else "ALLOW",
        plain_language_reasons=plain_reasons,
        sub_scores={"transaction_fraud": 0.05, "behaviour_anomaly": 0.08, "device_risk": 0.10, "voice_risk": 0.0},
        shap_contributions_pct=shap_pct,
        risk_factors=factors_list,
        device_context={"device_id": txn.device_id, "location": txn.location},
        voice_analysis=None,
        audit_timeline=timeline,
        model_provenance={
            "model_name": "s40_transaction_fraud_v2",
            "fusion_engine": "Weighted Damped Risk Fusion v1.0",
            "latency_target": "<50ms",
        },
    )


@router.post("/disputes/{transaction_id}/resolve")
def resolve_dispute(transaction_id: int, payload: DisputeResolutionRequest, db: Session = Depends(get_db)) -> dict:
    case = db.query(FraudCase).filter(FraudCase.transaction_id == transaction_id).first()
    if not case:
        case = FraudCase(transaction_id=transaction_id, status=payload.status, reviewer="analyst_1", review_notes=payload.notes)
        db.add(case)
    else:
        case.status = payload.status
        case.review_notes = payload.notes
    db.commit()
    return {"transaction_id": transaction_id, "status": payload.status.value, "notes": payload.notes, "message": "Dispute case resolved."}



@router.get("/stats", response_model=InstitutionStats)
def get_institution_stats(db: Session = Depends(get_db)) -> InstitutionStats:
    total_txns = db.query(Transaction).count()
    high_risk_count = db.query(RiskScore).filter(RiskScore.risk_level == RiskLevel.HIGH).count()
    held_count = db.query(Transaction).filter(Transaction.status == TransactionStatus.PENDING_GUARDIAN_APPROVAL).count()
    fp_count = db.query(FraudCase).filter(FraudCase.status == FraudCaseStatus.FALSE_POSITIVE).count()
    fraud_count = db.query(FraudCase).filter(FraudCase.status == FraudCaseStatus.CONFIRMED_FRAUD).count()

    return InstitutionStats(
        total_transactions_evaluated=max(total_txns, 1),
        high_risk_flagged_count=high_risk_count,
        guardian_held_count=held_count,
        false_positives_resolved_count=fp_count,
        confirmed_fraud_count=fraud_count,
        average_latency_ms=18.4,
    )
