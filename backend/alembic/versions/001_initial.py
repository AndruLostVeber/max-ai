"""Initial schema: users, conversations, messages, memories, file_chunks, router_logs

Revision ID: 001
Create Date: 2026-04-10
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "001"
down_revision = None
branch_labels = None
depends_on = None

EMBED_DIM = 1024


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "conversations",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("user_id", sa.String, sa.ForeignKey("users.id"), index=True),
        sa.Column("title", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column(
            "conversation_id",
            sa.String,
            sa.ForeignKey("conversations.id"),
            index=True,
        ),
        sa.Column("role", sa.String(16)),
        sa.Column("content", sa.Text),
        sa.Column("token_count", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.create_table(
        "memories",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("user_id", sa.String, sa.ForeignKey("users.id"), index=True),
        sa.Column("conversation_id", sa.String, nullable=True),
        sa.Column("text", sa.Text),
        sa.Column("embedding", Vector(EMBED_DIM)),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    # IVFFlat index for fast ANN search
    op.execute(
        "CREATE INDEX memories_embedding_idx ON memories "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )

    op.create_table(
        "file_chunks",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("file_id", sa.String, index=True),
        sa.Column("user_id", sa.String, index=True),
        sa.Column("filename", sa.String(512)),
        sa.Column("chunk_index", sa.Integer),
        sa.Column("text", sa.Text),
        sa.Column("embedding", Vector(EMBED_DIM)),
    )
    op.execute(
        "CREATE INDEX file_chunks_embedding_idx ON file_chunks "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )

    op.create_table(
        "router_logs",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("user_id", sa.String, index=True),
        sa.Column("message_preview", sa.String(512)),
        sa.Column("task_type", sa.String(64)),
        sa.Column("model_id", sa.String(128)),
        sa.Column("confidence", sa.Float),
        sa.Column("latency_ms", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("router_logs")
    op.drop_table("file_chunks")
    op.drop_table("memories")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("users")
