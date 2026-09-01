"""add transaction and guardian integrity hashes

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-09-01 11:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add integrity hash fields to transactions and guardian_requests."""
    op.add_column('transactions', sa.Column('integrity_hash', sa.String(length=64), nullable=True))
    op.add_column('transactions', sa.Column('guardian_integrity_hash', sa.String(length=64), nullable=True))
    op.add_column('guardian_requests', sa.Column('integrity_hash', sa.String(length=64), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('guardian_requests', 'integrity_hash')
    op.drop_column('transactions', 'guardian_integrity_hash')
    op.drop_column('transactions', 'integrity_hash')
