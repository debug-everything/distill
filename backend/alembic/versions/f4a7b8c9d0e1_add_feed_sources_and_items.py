"""add feed_sources and feed_items tables

Revision ID: f4a7b8c9d0e1
Revises: 3c19fe70b3c6
Create Date: 2026-03-15 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f4a7b8c9d0e1'
down_revision: Union[str, None] = '3c19fe70b3c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'feed_sources',
        sa.Column('id', sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column('source_type', sa.Text(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('url', sa.Text(), nullable=True),
        sa.Column('config', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('last_fetched', sa.DateTime(timezone=True), nullable=True),
        sa.Column('item_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        'feed_items',
        sa.Column('id', sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column('feed_source_id', sa.UUID(), sa.ForeignKey('feed_sources.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_type', sa.Text(), nullable=False),
        sa.Column('guid', sa.Text(), nullable=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('url', sa.Text(), nullable=True),
        sa.Column('source_domain', sa.Text(), nullable=True),
        sa.Column('image_url', sa.Text(), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('bullets', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('content_style', sa.Text(), nullable=True),
        sa.Column('information_density', sa.Integer(), nullable=True),
        sa.Column('topic_tags', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('topic_match_score', sa.Integer(), server_default='0', nullable=False),
        sa.Column('source_name', sa.Text(), nullable=True),
        sa.Column('status', sa.Text(), server_default='unread', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Dedup index: one guid per source
    op.execute(
        """
        CREATE UNIQUE INDEX feed_items_dedup
        ON feed_items (feed_source_id, guid)
        WHERE guid IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_table('feed_items')
    op.drop_table('feed_sources')
