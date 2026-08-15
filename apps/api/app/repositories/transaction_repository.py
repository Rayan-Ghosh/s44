from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.transaction import Transaction


def create_transaction(
    db: Session,
    *,
    user_id: int,
    recipient_id: int,
    device_id: int,
    amount: Decimal,
    location: Optional[str],
    payment_method: Optional[str],
) -> Transaction:
    transaction = Transaction(
        user_id=user_id,
        recipient_id=recipient_id,
        device_id=device_id,
        amount=amount,
        location=location,
        payment_method=payment_method,
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


def get_transaction(db: Session, transaction_id: int) -> Optional[Transaction]:
    return db.get(Transaction, transaction_id)
