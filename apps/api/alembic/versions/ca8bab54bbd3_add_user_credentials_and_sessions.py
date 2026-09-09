"""add user credentials and sessions

Revision ID: ca8bab54bbd3
Revises: e1d2c3b4a5f6
Create Date: 2026-09-01 00:57:25.595037

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ca8bab54bbd3'
down_revision: Union[str, Sequence[str], None] = 'e1d2c3b4a5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: add user_credentials table and extend user_sessions."""
    op.create_table(
        'user_credentials',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('failed_login_attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('lockout_until', sa.DateTime(), nullable=True),
        sa.Column('last_password_change', sa.DateTime(), nullable=False),
        sa.Column('two_factor_secret', sa.String(length=255), nullable=True),
        sa.Column('two_factor_enabled', sa.Boolean(), server_default='0', nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_credentials_user_id'), 'user_credentials', ['user_id'], unique=True)

    with op.batch_alter_table('user_sessions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('refresh_token_hash', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('device_id', sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column('user_agent', sa.String(length=512), nullable=True))
        batch_op.add_column(sa.Column('ip_address', sa.String(length=45), nullable=True))
        batch_op.create_index(op.f('ix_user_sessions_refresh_token_hash'), ['refresh_token_hash'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('user_sessions', schema=None) as batch_op:
        batch_op.drop_index(op.f('ix_user_sessions_refresh_token_hash'))
        batch_op.drop_column('ip_address')
        batch_op.drop_column('user_agent')
        batch_op.drop_column('device_id')
        batch_op.drop_column('refresh_token_hash')
    op.drop_index(op.f('ix_user_credentials_user_id'), table_name='user_credentials')
    op.drop_table('user_credentials')

