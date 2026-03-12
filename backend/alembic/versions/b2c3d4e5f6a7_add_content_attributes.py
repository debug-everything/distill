"""add content_attributes, content_style, information_density columns

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Articles: extraction-time attributes (e.g., video demo cues)
    op.add_column('articles', sa.Column('content_attributes', postgresql.JSONB(), nullable=True))

    # Clusters: LLM-generated content classification
    op.add_column('clusters', sa.Column('content_style', sa.Text(), nullable=True))
    op.add_column('clusters', sa.Column('information_density', sa.Integer(), nullable=True))
    op.add_column('clusters', sa.Column('content_attributes', postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('clusters', 'content_attributes')
    op.drop_column('clusters', 'information_density')
    op.drop_column('clusters', 'content_style')
    op.drop_column('articles', 'content_attributes')
