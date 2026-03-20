"""add_feed_item_sub_items

Revision ID: 45a1fe7ea7c4
Revises: f4a7b8c9d0e1
Create Date: 2026-03-20 10:40:08.787401

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '45a1fe7ea7c4'
down_revision: Union[str, None] = 'f4a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('feed_items', sa.Column('sub_items', postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('feed_items', 'sub_items')
