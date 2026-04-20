"""
TTS Service — edge-tts only.

Uses Microsoft edge-tts (no local models, no torch).
Voice is configured via TTS_VOICE in .env (default: ru-RU-SvetlanaNeural).

Available Russian voices:
  ru-RU-SvetlanaNeural   — female (default)
  ru-RU-DmitryNeural     — male
"""
import io
import logging

from fastapi import Depends
from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


class TTSService:
    def __init__(self, settings: Settings):
        self.voice = settings.TTS_VOICE  # e.g. "ru-RU-SvetlanaNeural"

    async def synthesize(self, text: str) -> tuple[bytes, str]:
        """
        Synthesize text to speech using edge-tts.
        Returns (audio_bytes, mime_type).
        mime_type is always "audio/mpeg" (MP3).
        """
        import edge_tts
        communicate = edge_tts.Communicate(text[:1000], self.voice)
        buf = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                buf.write(chunk["data"])
        audio = buf.getvalue()
        if not audio:
            raise RuntimeError("edge-tts returned empty audio")
        return audio, "audio/mpeg"


def get_tts_service(settings: Settings = Depends(get_settings)) -> TTSService:
    return TTSService(settings)
