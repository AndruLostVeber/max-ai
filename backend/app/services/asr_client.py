"""
ASR client.

Priority:
  1. Groq Whisper API (whisper-large-v3-turbo) — fast, free tier
  2. Local faster-whisper fallback (ASR_URL)
"""
import logging
import httpx
from fastapi import Depends
from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

GROQ_ASR_URL   = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_ASR_MODEL = "whisper-large-v3-turbo"   # fastest; fallback: whisper-large-v3


class ASRClient:
    def __init__(self, settings: Settings):
        self.groq_key   = settings.GROQ_API_KEY
        self.groq_proxy = settings.GROQ_PROXY or None
        self.media_url  = settings.ASR_URL

    async def transcribe(self, audio_bytes: bytes, filename: str = "audio.wav") -> str:
        # 1. Groq Whisper
        if self.groq_key:
            try:
                client_kwargs = {"timeout": 60}
                if self.groq_proxy:
                    client_kwargs["proxy"] = self.groq_proxy
                async with httpx.AsyncClient(**client_kwargs) as client:
                    r = await client.post(
                        GROQ_ASR_URL,
                        headers={"Authorization": f"Bearer {self.groq_key}"},
                        files={"file": (filename, audio_bytes, _mime(filename))},
                        data={"model": GROQ_ASR_MODEL, "response_format": "json"},
                    )
                    r.raise_for_status()
                    return r.json()["text"]
            except Exception as exc:
                logger.warning("Groq ASR failed, trying fallback: %s", exc)

        # 2. Local faster-whisper fallback
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(
                f"{self.media_url}/transcribe",
                files={"file": (filename, audio_bytes)},
            )
            r.raise_for_status()
        return r.json()["text"]


def _mime(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return {
        "mp3": "audio/mpeg",
        "mp4": "audio/mp4",
        "m4a": "audio/mp4",
        "wav": "audio/wav",
        "ogg": "audio/ogg",
        "flac": "audio/flac",
        "webm": "audio/webm",
    }.get(ext, "audio/wav")


def get_asr_client(settings: Settings = Depends(get_settings)) -> ASRClient:
    return ASRClient(settings)
