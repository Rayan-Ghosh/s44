"""Domain logic for user creation: hashing the raw phone number is a
domain concern (it must always happen, regardless of caller), so it lives
here rather than in the router (an HTTP concern) or the repository (a pure
persistence concern)."""

from sqlalchemy.orm import Session

from app.core.security import hash_identifier
from app.models.user import User
from app.repositories import user_repository
from app.schemas.user import UserCreate
from app.services.exceptions import UserAlreadyExistsError, UserNotFoundError


def create_user(db: Session, payload: UserCreate) -> User:
    phone_hash = hash_identifier(payload.phone_number)
    if user_repository.get_user_by_phone_hash(db, phone_hash) is not None:
        raise UserAlreadyExistsError("A user with this phone number already exists.")
    return user_repository.create_user(db, name=payload.name, phone_hash=phone_hash)


def get_user(db: Session, user_id: int) -> User:
    user = user_repository.get_user(db, user_id)
    if user is None:
        raise UserNotFoundError(f"User {user_id} not found.")
    return user
