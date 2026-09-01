"""add transaction authorization fields

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-09-01 11:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add authorization fields to transactions."""
    op.add_column('transactions', sa.Column('authorization_required', sa.Boolean(), server_default='0', nullable=False))
    op.add_column('transactions', sa.Column('authorization_status', sa.String(length=32), server_default='NONE', nullable=True))
    op.add_column('transactions', sa.Column('authorized_at', sa.DateTime(), nullable=True))
    op.add_column('transactions', sa.Column('authorization_method', sa.String(length=32), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('transactions', 'authorization_method')
    op.drop_column('transactions', 'authorized_at')
    op.drop_column('transactions', 'authorization_status')
    op.drop_column('transactions', 'authorization_required')
