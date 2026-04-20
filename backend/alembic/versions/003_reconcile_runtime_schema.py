"""Reconcile runtime schema with the application models.

Revision ID: 003
Revises: 002
Create Date: 2026-04-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def _has_table(bind, table_name: str) -> bool:
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _has_column(bind, table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(bind)
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _ensure_users(bind) -> None:
    if not _has_table(bind, "users"):
        return

    if not _has_column(bind, "users", "email"):
        op.add_column("users", sa.Column("email", sa.String(), nullable=True))
        op.execute(
            "UPDATE users "
            "SET email = id || '@legacy.local' "
            "WHERE email IS NULL OR email = ''"
        )

    if not _has_column(bind, "users", "password_hash"):
        op.add_column("users", sa.Column("password_hash", sa.String(), nullable=True))
        op.execute(
            "UPDATE users "
            "SET password_hash = '!' "
            "WHERE password_hash IS NULL OR password_hash = ''"
        )

    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_unique ON users (email)")
    op.alter_column("users", "email", existing_type=sa.String(), nullable=False)
    op.alter_column("users", "password_hash", existing_type=sa.String(), nullable=False)


def _rebuild_messages(bind) -> None:
    if _has_table(bind, "messages_next"):
        op.execute("DROP TABLE messages_next CASCADE")

    model_used_expr = "NULL::VARCHAR"
    if _has_table(bind, "messages") and _has_column(bind, "messages", "model_used"):
        model_used_expr = "CAST(model_used AS VARCHAR)"

    op.execute(
        """
        CREATE TABLE messages_next (
            id              VARCHAR NOT NULL,
            conversation_id VARCHAR NOT NULL,
            role            VARCHAR(16) NOT NULL,
            content         TEXT NOT NULL,
            model_used      VARCHAR,
            created_at      TIMESTAMP DEFAULT now(),
            PRIMARY KEY (id, conversation_id),
            CONSTRAINT fk_messages_conversation
                FOREIGN KEY (conversation_id)
                REFERENCES conversations(id)
                ON DELETE CASCADE
        ) PARTITION BY HASH (conversation_id)
        """
    )

    for index in range(8):
        op.execute(
            f"""
            CREATE TABLE messages_next_p{index}
            PARTITION OF messages_next
            FOR VALUES WITH (MODULUS 8, REMAINDER {index})
            """
        )

    if _has_table(bind, "messages"):
        op.execute(
            f"""
            INSERT INTO messages_next (id, conversation_id, role, content, model_used, created_at)
            SELECT
                m.id,
                m.conversation_id,
                m.role,
                m.content,
                {model_used_expr},
                m.created_at
            FROM messages AS m
            JOIN conversations AS c
              ON c.id = m.conversation_id
            """
        )
        op.execute("DROP TABLE messages CASCADE")

    op.execute("ALTER TABLE messages_next RENAME TO messages")
    op.execute(
        "CREATE INDEX IF NOT EXISTS messages_conversation_id_idx "
        "ON messages (conversation_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS messages_created_at_idx "
        "ON messages (created_at)"
    )


def _ensure_messages(bind) -> None:
    if not _has_table(bind, "messages"):
        _rebuild_messages(bind)
        return

    message_columns = {column["name"] for column in sa.inspect(bind).get_columns("messages")}
    message_fks = sa.inspect(bind).get_foreign_keys("messages")
    has_conversation_fk = any(
        foreign_key.get("referred_table") == "conversations"
        and "conversation_id" in (foreign_key.get("constrained_columns") or [])
        for foreign_key in message_fks
    )

    needs_rebuild = (
        "model_used" not in message_columns
        or "token_count" in message_columns
        or not has_conversation_fk
    )
    if needs_rebuild:
        _rebuild_messages(bind)


def _ensure_user_memory(bind) -> None:
    if _has_table(bind, "memories") and not _has_table(bind, "memories_legacy_vector"):
        op.execute("ALTER TABLE memories RENAME TO memories_legacy_vector")

    if not _has_table(bind, "user_memory"):
        op.create_table(
            "user_memory",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "user_id",
                sa.String(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("key", sa.String(), nullable=False),
            sa.Column("value", sa.Text(), nullable=False),
            sa.Column("category", sa.String(), nullable=True, server_default="general"),
            sa.Column("score", sa.Float(), nullable=True, server_default="1.0"),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'uq_user_memory'
            ) THEN
                ALTER TABLE user_memory
                ADD CONSTRAINT uq_user_memory UNIQUE (user_id, key);
            END IF;
        END $$;
        """
    )


def _ensure_router_log(bind) -> None:
    if _has_table(bind, "router_logs") and not _has_table(bind, "router_log"):
        op.execute("ALTER TABLE router_logs RENAME TO router_log")

    if not _has_table(bind, "router_log"):
        op.create_table(
            "router_log",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), nullable=True),
            sa.Column("message_preview", sa.Text(), nullable=True),
            sa.Column("task_type", sa.String(), nullable=False),
            sa.Column("model_id", sa.String(), nullable=False),
            sa.Column("confidence", sa.Float(), nullable=True),
            sa.Column("which_pass", sa.Integer(), nullable=True),
            sa.Column("latency_ms", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
        return

    if not _has_column(bind, "router_log", "which_pass"):
        op.add_column("router_log", sa.Column("which_pass", sa.Integer(), nullable=True))


def upgrade() -> None:
    bind = op.get_bind()
    _ensure_users(bind)
    _ensure_messages(bind)
    _ensure_user_memory(bind)
    _ensure_router_log(bind)


def downgrade() -> None:
    pass
