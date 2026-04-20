from __future__ import annotations

import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.config import Settings
from app.services.mws_client import MWSClient
from app.services.research.contracts import ResearchCreateRequest
from app.services.research.service import ResearchService
from app.services.web_parser import WebParserService
from app.services.web_search import WebSearchService

pytestmark = [pytest.mark.live, pytest.mark.slow]


def get_settings() -> Settings:
    return Settings(
        _env_file=os.path.join(os.path.dirname(__file__), "..", ".env"),
    )


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def collect_session(query: str):
    settings = get_settings()
    service = ResearchService(settings)
    session = await service.create_session(
        ResearchCreateRequest(query=query, max_iterations=1, max_sources=4),
        mws=MWSClient(settings),
        search_svc=WebSearchService(),
        parser_svc=WebParserService(),
    )
    events = [event async for event in service.stream_session(session.session_id)]
    final = await service.get_session(session.session_id)
    return final, events


def test_research_live_streams_plan_and_terminal_event() -> None:
    session, events = run(collect_session("what is retrieval augmented generation"))
    event_types = [event.type for event in events]

    assert "plan_ready" in event_types
    assert session is not None
    assert session.status in {"completed", "failed"}


def test_research_live_session_contains_result_or_error() -> None:
    session, _ = run(collect_session("FastAPI versus Django for new backends"))

    assert session is not None
    if session.status == "completed":
        assert session.result is not None
        assert session.result.answer
        assert isinstance(session.result.sources, list)
    else:
        assert session.error is not None


def test_research_live_short_query_does_not_hang() -> None:
    session, events = run(collect_session("Python"))

    assert session is not None
    assert session.status in {"completed", "failed"}
    assert events
