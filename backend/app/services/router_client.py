from __future__ import annotations

"""
Task Router — трёхпроходная классификация запросов.

Проход 1 — MIME / расширение (O(1), confidence=1.0)
Проход 2 — структурный анализ текста (O(n), confidence=0.9)
Проход 3 — LLM-классификатор meta/llama-3.1-8b-instruct (fallback, confidence из LLM)

Возвращает: RouteResult(task_type, model_id, confidence, which_pass)
"""
import json
import logging
import re
from dataclasses import dataclass

import httpx
from fastapi import Depends

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

# ── Модели по task_type ───────────────────────────────────────────

TASK_MODELS: dict[str, str] = {
    "text":          "mistralai/mistral-small-4-119b-2603",
    "code":          "qwen/qwen3-coder-480b-a35b-instruct",
    "asr":           "whisper-turbo-local",
    "vlm":           "meta/llama-3.2-90b-vision-instruct",
    "web_search":    "mistralai/mistral-small-4-119b-2603",
    "web_parse":     "mistralai/mistral-small-4-119b-2603",
    "file_qa":       "nvidia/nemoretriever-parse",
}

AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".m4a", ".flac"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
DOC_EXTS   = {".pdf", ".docx", ".txt"}

# ── Паттерны Прохода 2 ────────────────────────────────────────────

CODE_RE = re.compile(
    r"(код\b|функци|class |def |реализу|напиши (функцию|скрипт|код|программу)"
    r"|алгоритм|скрипт\b|программ|SELECT |INSERT |CREATE TABLE)",
    re.IGNORECASE,
)

URL_RE = re.compile(r"https?://\S+")

# Явный запрос парсить URL
WEB_PARSE_RE = re.compile(
    r"(открой|прочитай|проанализируй|разбери|перейди по|summarize|parse|read) .{0,60}https?://",
    re.IGNORECASE,
)

# Поисковый intent при наличии URL (ищи / найди + url)
WEB_SEARCH_RE = re.compile(
    r"(найди|поищи|search|look up|find)",
    re.IGNORECASE,
)

# ── LLM prompt ───────────────────────────────────────────────────

_LLM_SYSTEM = (
    "You are a request classifier. Given a user message, output ONLY valid JSON:\n"
    '{"task_type": "<type>", "confidence": <0.0-1.0>}\n\n'
    "Valid types: text, code, web_search, web_parse, file_qa, asr, vlm\n\n"
    "Examples:\n"
    '{"message":"Привет"} → {"task_type":"text","confidence":0.99}\n'
    '{"message":"Напиши merge sort на Python"} → {"task_type":"code","confidence":0.97}\n'
    '{"message":"Найди последние новости о GPT-5"} → {"task_type":"web_search","confidence":0.92}\n'
    '{"message":"Расскажи подробно про квантовые вычисления"} → {"task_type":"text","confidence":0.72}\n'
)

LLM_ROUTER_MODEL = "mistralai/mistral-small-4-119b-2603"
LLM_ROUTER_TIMEOUT = 60.0


# ── Результат роутинга ────────────────────────────────────────────

@dataclass
class RouteResult:
    task_type:  str
    model_id:   str
    confidence: float
    which_pass: int   # 1, 2 или 3


# ── Роутер ────────────────────────────────────────────────────────

class RouterClient:
    def __init__(self, settings: Settings):
        self._base_url = settings.MWS_BASE_URL
        self._api_key  = settings.MWS_API_KEY

    # ── Проход 1 ─────────────────────────────────────────────────

    def _pass1(self, attachments: list[dict]) -> RouteResult | None:
        for att in attachments:
            name: str = att.get("name", "").lower()
            mime: str = att.get("mime", "").lower()
            ext = ("." + name.rsplit(".", 1)[-1]) if "." in name else ""

            if ext in AUDIO_EXTS or mime.startswith("audio/"):
                return RouteResult("asr", TASK_MODELS["asr"], 1.0, 1)

            if ext in IMAGE_EXTS or mime.startswith("image/"):
                return RouteResult("vlm", TASK_MODELS["vlm"], 1.0, 1)

            if ext in DOC_EXTS:
                return RouteResult("file_qa", TASK_MODELS["file_qa"], 1.0, 1)

        return None

    # ── Проход 2 ─────────────────────────────────────────────────

    def _pass2(self, message: str) -> RouteResult | None:
        # URL-проверка идёт ДО research: "проанализируй ссылку https://..." → web_parse
        if URL_RE.search(message):
            if WEB_PARSE_RE.search(message):
                return RouteResult("web_parse", TASK_MODELS["web_parse"], 0.9, 2)
            if WEB_SEARCH_RE.search(message):
                return RouteResult("web_search", TASK_MODELS["web_search"], 0.9, 2)

        if CODE_RE.search(message):
            return RouteResult("code", TASK_MODELS["code"], 0.9, 2)

        return None

    # ── Проход 3 (LLM) ───────────────────────────────────────────

    async def _pass3(self, message: str) -> RouteResult:
        try:
            async with httpx.AsyncClient(timeout=LLM_ROUTER_TIMEOUT) as client:
                r = await client.post(
                    f"{self._base_url}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": LLM_ROUTER_MODEL,
                        "messages": [
                            {"role": "system", "content": _LLM_SYSTEM},
                            {"role": "user", "content": message},
                        ],
                        "max_tokens": 64,
                        "temperature": 0.0,
                    },
                )
                r.raise_for_status()
                content = r.json()["choices"][0]["message"]["content"]
                m = re.search(r"\{.*?\}", content, re.DOTALL)
                parsed = json.loads(m.group() if m else content)
                task_type  = parsed.get("task_type", "text")
                confidence = float(parsed.get("confidence", 0.5))

        except Exception as exc:
            logger.warning("LLM router error (pass 3): %s", exc)
            return RouteResult("text", TASK_MODELS["text"], 0.5, 3)

        if confidence < 0.7:
            task_type = "text"

        model_id = TASK_MODELS.get(task_type, TASK_MODELS["text"])
        return RouteResult(task_type, model_id, confidence, 3)

    # ── Публичный метод ───────────────────────────────────────────

    async def route(self, message: str, attachments: list[dict]) -> RouteResult:
        result = self._pass1(attachments)
        if result:
            return result

        result = self._pass2(message)
        if result:
            return result

        return await self._pass3(message)


def get_router_client(settings: Settings = Depends(get_settings)) -> RouterClient:
    return RouterClient(settings)
