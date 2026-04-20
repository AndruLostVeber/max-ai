"""
SSE / streaming utilities.
"""
import json
from typing import AsyncIterator


def sse_event(event: str, data: dict) -> str:
    """Format a single SSE event string."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def parse_sse_tokens(raw_lines: AsyncIterator[str]) -> AsyncIterator[str]:
    """
    Given an async iterator of raw SSE lines (e.g. 'data: {...}'),
    yield plain text content tokens.
    """
    async for line in raw_lines:
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


def build_openai_chunk(content: str, model: str, finish_reason: str | None = None) -> str:
    """
    Build a synthetic SSE data line in OpenAI streaming format.
    Useful for wrapping non-OpenAI responses into SSE.
    """
    payload = {
        "object": "chat.completion.chunk",
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": {"content": content} if content else {},
                "finish_reason": finish_reason,
            }
        ],
    }
    return f"data: {json.dumps(payload)}\n\n"
