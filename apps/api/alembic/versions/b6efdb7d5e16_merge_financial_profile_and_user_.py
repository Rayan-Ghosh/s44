"""merge financial-profile and user-credentials heads

Revision ID: b6efdb7d5e16
Revises: 2a01b580941b, ca8bab54bbd3
Create Date: 2026-09-09 23:24:51.967650

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b6efdb7d5e16'
down_revision: Union[str, Sequence[str], None] = ('2a01b580941b', 'ca8bab54bbd3')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
