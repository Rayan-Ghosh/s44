from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import FraudCaseStatus, TransactionStatus
from app.models.fraud_case import FraudCase
from app.repositories import transaction_repository
from app.schemas.transaction import TransactionCreate, TransactionRead
from app.services import transaction_service
from app.services.exceptions import TransactionNotFoundError, UserNotFoundError

router = APIRouter(prefix="/api/v1/transactions", tags=["transactions"])


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreate, db: Session = Depends(get_db)
) -> TransactionRead:
    try:
        return transaction_service.create_transaction(db, payload)
    except UserNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get("/{transaction_id}", response_model=TransactionRead)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)) -> TransactionRead:
    try:
        return transaction_service.get_transaction(db, transaction_id)
    except TransactionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc



@router.post("/{transaction_id}/confirm")
def confirm_transaction(transaction_id: int, db: Session = Depends(get_db)) -> dict:
    """User confirms payment after review."""
    txn = transaction_repository.get_transaction(db, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")
    transaction_repository.update_transaction_status(db, transaction_id, TransactionStatus.CONFIRMED)
    return {"transaction_id": transaction_id, "status": TransactionStatus.CONFIRMED.value, "message": "Payment confirmed and released."}


@router.post("/{transaction_id}/cancel")
def cancel_transaction(transaction_id: int, db: Session = Depends(get_db)) -> dict:
    """User cancels payment during hold window."""
    txn = transaction_repository.get_transaction(db, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")
    transaction_repository.update_transaction_status(db, transaction_id, TransactionStatus.CANCELLED)
    return {"transaction_id": transaction_id, "status": TransactionStatus.CANCELLED.value, "message": "Payment cancelled. Money remains in your account."}


@router.post("/{transaction_id}/report")
def report_transaction(transaction_id: int, reason: Optional[str] = "Suspected fraud reported by user", db: Session = Depends(get_db)) -> dict:
    """User reports suspicious payment / scam attempt."""
    txn = transaction_repository.get_transaction(db, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found.")
    transaction_repository.update_transaction_status(db, transaction_id, TransactionStatus.REPORTED)
    
    fraud_case = FraudCase(
        transaction_id=transaction_id,
        reviewer="user_report",
        review_notes=f"User Report: {reason}",
        status=FraudCaseStatus.OPEN,
    )
    db.add(fraud_case)
    db.commit()


    return {"transaction_id": transaction_id, "status": TransactionStatus.REPORTED.value, "case_id": fraud_case.id, "message": "Payment reported and fraud case opened for investigation."}
