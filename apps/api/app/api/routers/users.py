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
            "merchant": t.recipient.vpa if t.recipient else "UPI Merchant",
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

