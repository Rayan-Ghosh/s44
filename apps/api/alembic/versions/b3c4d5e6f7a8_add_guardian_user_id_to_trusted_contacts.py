"""add guardian_user_id to trusted_contacts

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-09-01 22:35:00.000000

Adds a nullable FK column `guardian_user_id` to `trusted_contacts` that
points to `users.id`.  This is the minimum schema change required to
create a real, queryable link between a TrustedContact row and the
actual Avaran User account of the guardian (e.g. Rayan).

The column is nullable so that:
  1. All existing rows continue to work without any update.
  2. When a trusted contact IS a registered Avaran user, their user id
     can be recorded here, enabling future multi-device notification
     delivery keyed on the guardian's own user account.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add nullable guardian_user_id FK column to trusted_contacts."""
    # SQLite: ADD COLUMN with plain nullable Integer is accepted.
    # Application-level FK integrity is enforced by the ORM relationship.
    op.add_column(
        'trusted_contacts',
        sa.Column('guardian_user_id', sa.Integer(), nullable=True)
    )
    op.create_index(
        'ix_trusted_contacts_guardian_user_id',
        'trusted_contacts',
        ['guardian_user_id'],
        unique=False
    )


def downgrade() -> None:
    """Remove guardian_user_id from trusted_contacts."""
    op.drop_index('ix_trusted_contacts_guardian_user_id', table_name='trusted_contacts')
    op.drop_column('trusted_contacts', 'guardian_user_id')
