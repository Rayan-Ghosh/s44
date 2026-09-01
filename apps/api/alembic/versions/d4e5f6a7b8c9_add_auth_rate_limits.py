"""add auth_rate_limits table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-01 11:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: create auth_rate_limits."""
    op.create_table(
        'auth_rate_limits',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('key_hash', sa.String(length=64), nullable=False),
        sa.Column('key_type', sa.String(length=32), nullable=False),
        sa.Column('failed_attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('request_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('first_seen_at', sa.DateTime(), nullable=False),
        sa.Column('last_attempt_at', sa.DateTime(), nullable=False),
        sa.Column('locked_until', sa.DateTime(), nullable=True),
        sa.Column('lockout_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key_hash', 'key_type', name='uq_auth_rate_limit_key_type')
    )
    op.create_index(op.f('ix_auth_rate_limits_key_hash'), 'auth_rate_limits', ['key_hash'], unique=False)
    op.create_index(op.f('ix_auth_rate_limits_key_type'), 'auth_rate_limits', ['key_type'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_auth_rate_limits_key_type'), table_name='auth_rate_limits')
    op.drop_index(op.f('ix_auth_rate_limits_key_hash'), table_name='auth_rate_limits')
    op.drop_table('auth_rate_limits')
