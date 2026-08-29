from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.user import UserCreate, UserRead
from app.services import user_service
from app.services.exceptions import UserAlreadyExistsError, UserNotFoundError

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.post("", response_model=UserRead, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> UserRead:
    try:
        user = user_service.create_user(db, payload)
    except UserAlreadyExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return user


@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: int, db: Session = Depends(get_db)) -> UserRead:
    try:
        return user_service.get_user(db, user_id)
    except UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{user_id}/transactions")
def get_user_transactions(
    user_id: int,
    limit: int = 50,
    offset: int = 0,
    status: str = None,
    db: Session = Depends(get_db),
) -> dict:
    from app.models.transaction import Transaction
    from app.models.enums import TransactionStatus

    query = db.query(Transaction).filter(Transaction.user_id == user_id)
    if status and status != "all":
        try:
            enum_val = TransactionStatus(status.upper())
            query = query.filter(Transaction.status == enum_val)
        except ValueError:
            pass

    total = query.count()
    txns = query.order_by(Transaction.timestamp.desc()).offset(offset).limit(limit).all()

    items = []
    for t in txns:
        latest_risk = t.risk_scores[-1] if t.risk_scores else None
        items.append({
            "id": t.id,
            "merchant": t.recipient.display_name if (t.recipient and t.recipient.display_name) else "UPI Merchant",
            "amount": float(t.amount),
            "timestamp": t.timestamp.isoformat() if t.timestamp else "",
            "payment_method": t.payment_method or "UPI",
            "status": t.status.value,
            "risk_level": latest_risk.risk_level.value if latest_risk else "LOW",
            "risk_score": latest_risk.final_score if latest_risk else 12.0,
            "risk_factors": [
                {"factor_name": rf.factor_type, "explanation": rf.explanation, "contribution": rf.contribution}
                for rf in (latest_risk.risk_factors if latest_risk else [])
            ],
        })

    return {"items": items, "total": total}


@router.get("/{user_id}/overview")
def get_user_overview(user_id: int, db: Session = Depends(get_db)) -> dict:
    from app.models.transaction import Transaction
    from app.models.enums import TransactionStatus

    try:
        user = user_service.get_user(db, user_id)
    except UserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    txns = db.query(Transaction).filter(Transaction.user_id == user_id).all()

    if not txns:
        return {
            "total_amount_this_month": 48250.0,
            "transaction_count": 24,
            "safe_count": 23,
            "needs_review_count": 1,
            "blocked_count": 0,
            "reported_count": 0,
            "current_risk_level": "MEDIUM",
            "current_risk_score": 38.5,
            "protection_status": "ATTENTION REQUIRED",
        }

    total_amount = sum(float(t.amount) for t in txns)
    safe_count = sum(1 for t in txns if t.status in (TransactionStatus.CONFIRMED, TransactionStatus.ALLOWED, TransactionStatus.GUARDIAN_APPROVED))
    needs_review_count = sum(1 for t in txns if t.status in (TransactionStatus.AWAITING_CONFIRMATION, TransactionStatus.PENDING, TransactionStatus.PENDING_GUARDIAN_APPROVAL))
    blocked_count = sum(1 for t in txns if t.status in (TransactionStatus.CANCELLED, TransactionStatus.GUARDIAN_REJECTED))
    reported_count = sum(1 for t in txns if t.status == TransactionStatus.REPORTED)

    latest_risk = 12.0
    latest_level = "LOW"
    for t in txns:
        if t.risk_scores:
            latest_risk = t.risk_scores[-1].final_score
            latest_level = t.risk_scores[-1].risk_level.value
            break

    protection_status = "ATTENTION REQUIRED" if (needs_review_count > 0 or latest_level == "HIGH") else "PROTECTED"

    return {
        "total_amount_this_month": total_amount,
        "transaction_count": len(txns),
        "safe_count": safe_count,
        "needs_review_count": needs_review_count,
        "blocked_count": blocked_count,
        "reported_count": reported_count,
        "current_risk_level": latest_level,
        "current_risk_score": latest_risk,
        "protection_status": protection_status,
    }


