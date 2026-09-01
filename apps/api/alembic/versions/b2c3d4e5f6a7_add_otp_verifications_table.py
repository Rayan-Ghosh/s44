"""add otp_verifications table and user is_verified column

Revision ID: b2c3d4e5f6a7
Revises: 83d2e9f1a04b
Create Date: 2026-09-01 10:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = '83d2e9f1a04b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add is_verified to users and create otp_verifications table."""
    op.add_column('users', sa.Column('is_verified', sa.Boolean(), server_default='1', nullable=False))
    op.create_table(
        'otp_verifications',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('otp_hash', sa.String(length=128), nullable=False),
        sa.Column('purpose', sa.String(length=64), server_default='ACCOUNT_VERIFICATION', nullable=False),
        sa.Column('contact_target', sa.String(length=255), nullable=True),
        sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('max_attempts', sa.Integer(), server_default='5', nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('resend_available_at', sa.DateTime(), nullable=False),
        sa.Column('is_used', sa.Boolean(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_otp_verifications_user_id'), 'otp_verifications', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_otp_verifications_user_id'), table_name='otp_verifications')
    op.drop_table('otp_verifications')
    op.drop_column('users', 'is_verified')
