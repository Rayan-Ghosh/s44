"""API contracts for /api/v1/users. Kept separate from app.models.User so
the database shape and the wire format can evolve independently."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    # Raw phone number. Hashed by app/services/user_service.py before it
    # ever reaches the database — never persisted or echoed back in plain
    # form (see app/core/security.py, docs/SECURITY.md).
    phone_number: str = Field(..., min_length=6, max_length=20)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime
    # phone_hash is intentionally NOT exposed here — data minimization
    # applies even to already-hashed identifiers (docs/SECURITY.md).
