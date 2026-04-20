from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, String, Float, Integer, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# ── Auth ──────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id            = Column(String, primary_key=True)   # UUID str
    email         = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow)


# ── Chat history ──────────────────────────────────────────────────

class Conversation(Base):
    __tablename__ = "conversations"

    id         = Column(String, primary_key=True)
    user_id    = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title      = Column(String, default="Новый чат")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class Message(Base):
    __tablename__ = "messages"

    id         = Column(String, primary_key=True)
    conv_id    = Column(
        "conversation_id",
        String,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        primary_key=True,
    )
    role       = Column(String, nullable=False)   # user | assistant | system
    content    = Column(Text, nullable=False)
    model_used = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ── Long-term memory ──────────────────────────────────────────────

class UserMemory(Base):
    __tablename__ = "user_memory"

    id         = Column(String, primary_key=True)
    user_id    = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    key        = Column(String, nullable=False)
    value      = Column(Text, nullable=False)
    category   = Column(String, default="general")   # preferences|projects|facts|links
    score      = Column(Float, default=1.0)
    updated_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_memory"),)


# ── Router observability ──────────────────────────────────────────

class RouterLog(Base):
    __tablename__ = "router_log"

    id              = Column(String, primary_key=True)
    user_id         = Column(String, nullable=True)
    message_preview = Column(Text, nullable=True)   # первые 512 символов
    task_type       = Column(String, nullable=False)
    model_id        = Column(String, nullable=False)
    confidence      = Column(Float, nullable=True)
    which_pass      = Column(Integer, nullable=True)  # 1, 2 или 3
    latency_ms      = Column(Integer, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
