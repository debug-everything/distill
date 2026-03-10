"""Initial schema — articles, clusters, knowledge_items, embeddings

Revision ID: 001
Revises:
Create Date: 2026-03-09
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Articles table
    op.create_table(
        "articles",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("url_hash", sa.Text(), unique=True, nullable=False),
        sa.Column("title", sa.Text()),
        sa.Column("raw_html", sa.Text()),
        sa.Column("clean_text", sa.Text()),
        sa.Column("content_type", sa.Text(), server_default="article", nullable=False),
        sa.Column("mode", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default="queued", nullable=False),
        sa.Column("extraction_quality", sa.Text(), server_default="ok"),
        sa.Column("source_domain", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
    )

    # Clusters table
    op.create_table(
        "clusters",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("digest_date", sa.Date(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("headline", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("bullets", postgresql.JSONB(), nullable=False),
        sa.Column("quotes", postgresql.JSONB()),
        sa.Column("topic_tags", postgresql.ARRAY(sa.Text())),
        sa.Column("source_count", sa.Integer(), server_default="1"),
        sa.Column("is_merged", sa.Boolean(), server_default="false"),
        sa.Column("status", sa.Text(), server_default="unread"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Cluster sources join table
    op.create_table(
        "cluster_sources",
        sa.Column(
            "cluster_id",
            sa.UUID(),
            sa.ForeignKey("clusters.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "article_id",
            sa.UUID(),
            sa.ForeignKey("articles.id"),
            primary_key=True,
        ),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("source_name", sa.Text()),
        sa.Column("content_type", sa.Text(), server_default="article", nullable=False),
    )

    # Knowledge items table
    op.create_table(
        "knowledge_items",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("source_type", sa.Text(), nullable=False),
        sa.Column("source_id", sa.UUID()),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("url", sa.Text()),
        sa.Column("topic_tags", postgresql.ARRAY(sa.Text())),
        sa.Column("full_text", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Embeddings table with pgvector
    op.execute(
        """
        CREATE TABLE embeddings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            knowledge_item_id UUID REFERENCES knowledge_items(id) ON DELETE CASCADE,
            chunk_index INT NOT NULL,
            chunk_text TEXT NOT NULL,
            embedding VECTOR(768),
            created_at TIMESTAMPTZ DEFAULT now()
        )
        """
    )

    # HNSW index for fast cosine similarity search
    op.execute(
        """
        CREATE INDEX embeddings_embedding_idx ON embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
        """
    )


def downgrade() -> None:
    op.drop_table("embeddings")
    op.drop_table("cluster_sources")
    op.drop_table("clusters")
    op.drop_table("knowledge_items")
    op.drop_table("articles")
    op.execute("DROP EXTENSION IF EXISTS vector")
