import asyncio
import httpx
from fastapi import APIRouter
from sqlalchemy import text

from app.config import get_settings
from app.db.database import SessionLocal

router = APIRouter()
settings = get_settings()


async def _ping(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=2) as c:
            r = await c.get(url)
            return r.status_code < 500
    except Exception:
        return False


async def _db_ok() -> bool:
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@router.get("/health")
async def health():
    db, mws_ok = await asyncio.gather(_db_ok(), _ping(f"{settings.MWS_BASE_URL}/v1/models"))

    services = {
        "postgres":  db,
        "mws_api":   mws_ok,
        "image_gen": "media-service (SD)" if db else False,  # зависит от media-service
        "asr":       "mws(whisper-turbo-local)" if mws_ok else False,
    }
    status = "ok" if (db and mws_ok) else "degraded"
    return {"status": status, "services": services}
