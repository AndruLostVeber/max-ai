from __future__ import annotations

import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.config import Settings
from app.services.tts_service import TTSService

pytestmark = [pytest.mark.live, pytest.mark.slow]


def get_settings() -> Settings:
    return Settings(
        _env_file=os.path.join(os.path.dirname(__file__), "..", ".env"),
    )


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_tts_live_synthesizes_short_text() -> None:
    tts = TTSService(get_settings())
    audio, mime = run(tts.synthesize("Привет, это тест голоса."))

    assert mime == "audio/mpeg"
    assert len(audio) > 1000


def test_tts_live_synthesizes_long_text() -> None:
    text = "Это длинный текст для синтеза речи. " * 30
    tts = TTSService(get_settings())
    audio, mime = run(tts.synthesize(text))

    assert mime == "audio/mpeg"
    assert len(audio) > 1000


def test_tts_live_uses_configured_voice() -> None:
    settings = get_settings()
    assert settings.TTS_VOICE
    assert "ru" in settings.TTS_VOICE.lower() or settings.TTS_VOICE == "ru-RU-SvetlanaNeural"
