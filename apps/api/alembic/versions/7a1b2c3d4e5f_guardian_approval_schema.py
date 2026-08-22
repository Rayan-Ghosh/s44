"""guardian approval schema

Revision ID: 7a1b2c3d4e5f
Revises: 0cf5eef39efd
Create Date: 2026-08-20 20:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '7a1b2c3d4e5f'
down_revision: Union[str, Sequence[str], None] = '0cf5eef39efd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        'trusted_contacts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('contact_name', sa.String(length=100), nullable=False),
        sa.Column('contact_phone_hash', sa.String(length=64), nullable=False),
        sa.Column('phone_masked', sa.String(length=20), nullable=False),
        sa.Column('relationship', sa.String(length=50), nullable=False),
        sa.Column('consent_status', sa.String(length=32), nullable=False),
        sa.Column('consented_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_trusted_contacts_user_id'), 'trusted_contacts', ['user_id'], unique=False)
    op.create_index(op.f('ix_trusted_contacts_contact_phone_hash'), 'trusted_contacts', ['contact_phone_hash'], unique=False)

    op.create_table(
        'guardian_requests',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('transaction_id', sa.Integer(), nullable=False),
        sa.Column('trusted_contact_id', sa.Integer(), nullable=False),
        sa.Column('requested_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('outcome', sa.String(length=32), nullable=False),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('resolution_channel', sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trusted_contact_id'], ['trusted_contacts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_guardian_requests_transaction_id'), 'guardian_requests', ['transaction_id'], unique=False)
    op.create_index(op.f('ix_guardian_requests_trusted_contact_id'), 'guardian_requests', ['trusted_contact_id'], unique=False)
    op.create_index(op.f('ix_guardian_requests_expires_at'), 'guardian_requests', ['expires_at'], unique=False)

def downgrade() -> None:
    op.drop_index(op.f('ix_guardian_requests_expires_at'), table_name='guardian_requests')
    op.drop_index(op.f('ix_guardian_requests_trusted_contact_id'), table_name='guardian_requests')
    op.drop_index(op.f('ix_guardian_requests_transaction_id'), table_name='guardian_requests')
    op.drop_table('guardian_requests')
    op.drop_index(op.f('ix_trusted_contacts_contact_phone_hash'), table_name='trusted_contacts')
    op.drop_index(op.f('ix_trusted_contacts_user_id'), table_name='trusted_contacts')
    op.drop_table('trusted_contacts')
