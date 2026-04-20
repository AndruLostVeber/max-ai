from __future__ import annotations

import asyncio
from ddgs import DDGS


class WebSearchService:
    async def search(self, query: str, max_results: int = 5) -> list[dict]:
        """DuckDuckGo search — runs sync DDGS in a thread pool."""

        def _sync() -> list[dict]:
            with DDGS() as ddgs:
                return list(ddgs.text(query, max_results=max_results))

        raw = await asyncio.to_thread(_sync)
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", ""),
            }
            for r in (raw or [])
        ]
