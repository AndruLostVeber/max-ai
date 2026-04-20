from __future__ import annotations

import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

_settings = get_settings()
engine = create_async_engine(_settings.DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def _needs_stamp() -> bool:
    """Tables exist but alembic_version is missing/empty → need to stamp."""
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_name='users' AND table_schema='public'"
            )
        )
        if not result.fetchone():
            return False  # fresh DB — normal first run
        try:
            row = (await conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))).fetchone()
            return row is None
        except Exception:
            return True  # alembic_version table doesn't exist


def _alembic_cfg() -> Config:
    root = Path(__file__).resolve().parents[2]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    return cfg


async def init_db() -> None:
    if await _needs_stamp():
        await asyncio.to_thread(command.stamp, _alembic_cfg(), "head")
    await asyncio.to_thread(command.upgrade, _alembic_cfg(), "head")


async def get_session() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
