"""add AVARAN PAY payment fields to transactions

Revision ID: f9e8d7c6b5a4
Revises: b3c4d5e6f7a8
Create Date: 2026-09-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f9e8d7c6b5a4'
down_revision: Union[str, Sequence[str], None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add unified-intake / idempotency / demo / UPI-handoff
    fields to transactions (AVARAN PAY spec §3, §8, §9, §12)."""
    op.add_column('transactions', sa.Column('source', sa.String(length=20), nullable=True))
    op.add_column('transactions', sa.Column('idempotency_key', sa.String(length=120), nullable=True))
    op.create_index(op.f('ix_transactions_idempotency_key'), 'transactions', ['idempotency_key'], unique=False)
    op.add_column('transactions', sa.Column('is_demo', sa.Boolean(), server_default='0', nullable=False))
    op.add_column('transactions', sa.Column('upi_app', sa.String(length=50), nullable=True))
    op.add_column('transactions', sa.Column('upi_launch_at', sa.DateTime(), nullable=True))
    op.add_column('transactions', sa.Column('upi_launch_count', sa.Integer(), server_default='0', nullable=False))
    op.add_column('transactions', sa.Column('utr_reference', sa.String(length=64), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('transactions', 'utr_reference')
    op.drop_column('transactions', 'upi_launch_count')
    op.drop_column('transactions', 'upi_launch_at')
    op.drop_column('transactions', 'upi_app')
    op.drop_column('transactions', 'is_demo')
    op.drop_index(op.f('ix_transactions_idempotency_key'), table_name='transactions')
    op.drop_column('transactions', 'idempotency_key')
    op.drop_column('transactions', 'source')
