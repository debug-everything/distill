"""add_image_url_columns

Revision ID: 6734c85554a0
Revises: 001
Create Date: 2026-03-10 09:58:42.793880

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '6734c85554a0'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('articles', sa.Column('image_url', sa.Text(), nullable=True))
    op.add_column('cluster_sources', sa.Column('image_url', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('cluster_sources', 'image_url')
    op.drop_column('articles', 'image_url')
