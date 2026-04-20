"""Partition messages table by conversation_id hash

Revision ID: 002
Create Date: 2026-04-11
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Переименовываем старую таблицу
    op.execute("ALTER TABLE messages RENAME TO messages_old")

    # 2. Создаём новую партиционированную таблицу
    # HASH-партиционирование по conversation_id — равномерное распределение
    # PRIMARY KEY должен включать ключ партиции (требование PostgreSQL)
    op.execute("""
        CREATE TABLE messages (
            id              VARCHAR NOT NULL,
            conversation_id VARCHAR NOT NULL,
            role            VARCHAR(16) NOT NULL,
            content         TEXT NOT NULL,
            token_count     INTEGER,
            created_at      TIMESTAMP DEFAULT now(),
            PRIMARY KEY (id, conversation_id)
        ) PARTITION BY HASH (conversation_id)
    """)

    # 3. Создаём 8 партиций (степень двойки — хорошо для равномерности)
    for i in range(8):
        op.execute(f"""
            CREATE TABLE messages_p{i}
            PARTITION OF messages
            FOR VALUES WITH (MODULUS 8, REMAINDER {i})
        """)

    # 4. Переносим данные из старой таблицы
    op.execute("INSERT INTO messages SELECT * FROM messages_old")

    # 5. Удаляем старую таблицу
    op.execute("DROP TABLE messages_old")

    # 6. Индекс на conversation_id (для быстрой выборки истории чата)
    op.execute(
        "CREATE INDEX messages_conversation_id_idx ON messages (conversation_id)"
    )

    # 7. Индекс на created_at (для сортировки по времени)
    op.execute(
        "CREATE INDEX messages_created_at_idx ON messages (created_at)"
    )


def downgrade() -> None:
    # Собираем все данные обратно в обычную таблицу
    op.execute("ALTER TABLE messages RENAME TO messages_partitioned")

    op.create_table(
        "messages",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("conversation_id", sa.String,
                  sa.ForeignKey("conversations.id"), index=True),
        sa.Column("role", sa.String(16)),
        sa.Column("content", sa.Text),
        sa.Column("token_count", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    op.execute("INSERT INTO messages SELECT * FROM messages_partitioned")
    op.execute("DROP TABLE messages_partitioned")
