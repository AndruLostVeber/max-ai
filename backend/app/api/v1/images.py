from fastapi import APIRouter
from pydantic import BaseModel
import httpx

from app.config import get_settings

router = APIRouter()
settings = get_settings()


class VisionRequest(BaseModel):
    image_url: str
    question: str
    model: str = "meta/llama-3.2-90b-vision-instruct"


@router.post("/vlm/analyze")
async def vlm_analyze(req: VisionRequest):
    """NVIDIA vision model — анализ картинки по URL."""
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            r = await client.post(
                f"{settings.MWS_BASE_URL}/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.MWS_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": req.model,
                    "messages": [{"role": "user", "content": [
                        {"type": "text", "text": req.question},
                        {"type": "image_url", "image_url": {"url": req.image_url}},
                    ]}],
                    "max_tokens": 300,
                },
            )
            r.raise_for_status()
            return r.json()
        except Exception as e:
            return {"answer": None, "fallback": True, "message": str(e)}
