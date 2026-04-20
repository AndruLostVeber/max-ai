"""Fetch a URL and extract structured text content."""

from __future__ import annotations

import asyncio
from functools import partial

import httpx
from bs4 import BeautifulSoup


class WebParserService:
    _HEADERS = {
        "User-Agent": "Mozilla/5.0 (compatible; MireaBot/1.0)",
    }

    async def parse(self, url: str, extract_links: bool = False) -> dict:
        try:
            async with httpx.AsyncClient(
                headers=self._HEADERS,
                timeout=15,
                follow_redirects=True,
            ) as client:
                response = await client.get(url)
                response.raise_for_status()
                html = response.text
        except Exception as e:
            return {"url": url, "error": str(e), "title": "", "text": "", "links": []}

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            partial(self._parse_html, html, url, extract_links),
        )

    @staticmethod
    def _parse_html(html: str, url: str, extract_links: bool) -> dict:
        soup = BeautifulSoup(html, "lxml")
        title = soup.title.string.strip() if soup.title and soup.title.string else ""

        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)
        lines = [line for line in text.splitlines() if line.strip()]
        clean = "\n".join(lines)

        links = []
        if extract_links:
            links = [
                anchor["href"]
                for anchor in soup.find_all("a", href=True)
                if anchor["href"].startswith("http")
            ][:20]

        return {"url": url, "title": title, "text": clean[:8000], "links": links}
