"""add password_hash to user_contact_info

Revision ID: 83d2e9f1a04b
Revises: 62c167040c8b
Create Date: 2026-09-01 10:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '83d2e9f1a04b'
down_revision: Union[str, Sequence[str], None] = '62c167040c8b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add password_hash column to user_contact_info."""
    op.add_column('user_contact_info', sa.Column('password_hash', sa.String(length=512), nullable=True))


def downgrade() -> None:
    """Remove password_hash column from user_contact_info."""
    op.drop_column('user_contact_info', 'password_hash')
