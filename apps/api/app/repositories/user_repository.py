"""Narrow, dependency-free CRUD access to the users table. No hashing, no
validation, no HTTP concerns — those live in app/services and
app/api/routers respectively."""

from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User


def create_user(db: Session, *, name: str, phone_hash: str, is_verified: bool = True) -> User:
    user = User(name=name, phone_hash=phone_hash, is_verified=is_verified)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user(db: Session, user_id: int) -> Optional[User]:
    return db.get(User, user_id)


def get_user_by_phone_hash(db: Session, phone_hash: str) -> Optional[User]:
    return db.query(User).filter(User.phone_hash == phone_hash).first()
