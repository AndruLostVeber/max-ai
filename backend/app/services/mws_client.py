from __future__ import annotations

"""
Async client for MWS GPT API.
  - chat / completion / embeddings (regular + streaming)
  - stream_tokens(): parses SSE → yields plain text tokens (for WebSocket)
  - Exponential backoff on 429 / 503
"""
import json
import logging
from typing import AsyncIterator

import httpx
from fastapi import Depends

from app.config import Settings, get_settings
from app.models.mws import ChatCompletionRequest, CompletionRequest, EmbeddingRequest

logger = logging.getLogger(__name__)
from app.utils.retry import with_retry


class MWSClient:
    def __init__(self, settings: Settings):
        self._base_url = settings.MWS_BASE_URL
        self._headers = {
            "Authorization": f"Bearer {settings.MWS_API_KEY}",
            "Content-Type": "application/json",
        }

    def _http(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._base_url,
            headers=self._headers,
            timeout=300,  # 5 минут — тяжёлые модели могут долго отвечать
        )

    # ── Regular (non-streaming) ───────────────────────────────────

    @with_retry(retries=3, retry_on={429, 503})
    async def chat(self, request: ChatCompletionRequest) -> dict:
        async with self._http() as c:
            r = await c.post(
                "/v1/chat/completions",
                json=request.model_dump(exclude_none=True),
            )
            r.raise_for_status()
            if not r.content:
                logger.error(
                    "MWS returned empty body for model=%s status=%s",
                    request.model, r.status_code,
                )
                raise ValueError(
                    f"MWS returned empty response body (status={r.status_code}, model={request.model})"
                )
            try:
                return r.json()
            except Exception as exc:
                logger.error(
                    "MWS JSON parse error for model=%s status=%s body=%r",
                    request.model, r.status_code, r.text[:500],
                )
                raise ValueError(
                    f"MWS returned non-JSON body (status={r.status_code}, model={request.model}): {r.text[:200]}"
                ) from exc

    @with_retry(retries=3, retry_on={429, 503})
    async def completion(self, request: CompletionRequest) -> dict:
        async with self._http() as c:
            r = await c.post(
                "/v1/completions",
                json=request.model_dump(exclude_none=True),
            )
            r.raise_for_status()
            return r.json()

    @with_retry(retries=3, retry_on={429, 503})
    async def embed(self, request: EmbeddingRequest) -> dict:
        async with self._http() as c:
            r = await c.post(
                "/v1/embeddings",
                json=request.model_dump(exclude_none=True),
            )
            r.raise_for_status()
            return r.json()

    async def list_models(self) -> dict:
        async with self._http() as c:
            r = await c.get("/v1/models")
            r.raise_for_status()
            return r.json()

    # ── Streaming: raw SSE lines (for HTTP proxy) ─────────────────

    async def stream_chat(
        self, request: ChatCompletionRequest
    ) -> AsyncIterator[bytes]:
        """
        Yields raw SSE bytes forwarded directly to the HTTP client.
        Each chunk is like b'data: {...}\\n\\n'.
        """
        payload = request.model_dump(exclude_none=True)
        payload["stream"] = True
        async with self._http() as c:
            async with c.stream("POST", "/v1/chat/completions", json=payload) as r:
                r.raise_for_status()
                async for chunk in r.aiter_bytes():
                    if chunk:
                        yield chunk

    async def stream_completion(
        self, request: CompletionRequest
    ) -> AsyncIterator[bytes]:
        payload = request.model_dump(exclude_none=True)
        payload["stream"] = True
        async with self._http() as c:
            async with c.stream("POST", "/v1/completions", json=payload) as r:
                r.raise_for_status()
                async for chunk in r.aiter_bytes():
                    if chunk:
                        yield chunk

    # ── Streaming: parsed tokens (for WebSocket / internal use) ───

    async def stream_tokens(
        self, request: ChatCompletionRequest
    ) -> AsyncIterator[str]:
        """
        Parses the SSE stream and yields plain text content tokens.
        Skips [DONE] and empty deltas.
        """
        payload = request.model_dump(exclude_none=True)
        payload["stream"] = True
        async with self._http() as c:
            async with c.stream("POST", "/v1/chat/completions", json=payload) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        return
                    try:
                        data = json.loads(data_str)
                        token = (
                            data.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content", "")
                        )
                        if token:
                            yield token
                    except (json.JSONDecodeError, IndexError, KeyError):
                        continue

    # ── Convenience ───────────────────────────────────────────────

    async def chat_simple(self, model: str, system: str, user: str) -> str:
        """Single-turn chat — returns assistant text."""
        from app.models.mws import Message

        req = ChatCompletionRequest(
            model=model,
            messages=[
                Message(role="system", content=system),
                Message(role="user", content=user),
            ],
        )
        resp = await self.chat(req)
        return resp["choices"][0]["message"]["content"]


def get_mws_client(settings: Settings = Depends(get_settings)) -> MWSClient:
    return MWSClient(settings)
