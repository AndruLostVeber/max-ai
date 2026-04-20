from __future__ import annotations

import asyncio
import json
import os
import sys
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.api.v1 import research_v2 as research_api
from app.config import Settings
from app.services.message_payloads import STORED_MESSAGE_PREFIX, build_context_content_from_stored_message
from app.services.research.contracts import ResearchCreateRequest, ResearchIntent, ResearchTable
from app.services.research.market_data import MarketDataPoint
from app.services.research.presentation import build_research_presentation
from app.services.research.service import ResearchService, get_research_service


def make_settings(**overrides) -> Settings:
    base = {
        "MWS_API_KEY": "test-key",
        "MWS_BASE_URL": "https://example.test",
        "MODEL_RESEARCH_PLANNER": "planner-model",
        "MODEL_RESEARCH_EXTRACTOR": "extractor-model",
        "MODEL_RESEARCH_WRITER": "writer-model",
        "RESEARCH_SEARCH_RESULTS": 2,
        "RESEARCH_SAFE_MODE": False,
        "RESEARCH_HTTP_CONCURRENCY": 2,
        "RESEARCH_LLM_CONCURRENCY": 2,
        "RESEARCH_SOURCE_TEXT_CHARS": 500,
        "RESEARCH_MAX_EVIDENCE_PER_SOURCE": 2,
        "RESEARCH_MIN_EVIDENCE_PER_FACET": 1,
        "RESEARCH_MIN_DOMAINS_PER_FACET": 1,
    }
    base.update(overrides)
    return Settings(**base)


class FakeMWS:
    def __init__(
        self,
        *,
        planner_error: Exception | None = None,
        final_answer: str = "Structured research answer with citations [E1].",
    ) -> None:
        self.planner_error = planner_error
        self.final_answer = final_answer
        self.calls: list[dict] = []

    async def chat_simple(self, model: str, system: str, user: str) -> str:
        self.calls.append({"model": model, "system": system, "user": user})
        if "research planner" in system:
            if self.planner_error:
                raise self.planner_error
            return json.dumps(
                {
                    "facets": [
                        {
                            "title": "Definition",
                            "questions": ["What is a vector database?"],
                            "queries": ["vector database definition"],
                        },
                        {
                            "title": "Use cases",
                            "questions": ["Where are vector databases used?"],
                            "queries": ["vector database use cases"],
                        },
                    ]
                },
                ensure_ascii=False,
            )
        if "extract research evidence" in system:
            return json.dumps(
                [
                    {
                        "claim": "Vector databases store and search embeddings efficiently.",
                        "excerpt": "Vector databases are optimized for similarity search over embeddings.",
                        "confidence": 0.81,
                        "stance": "supports",
                    }
                ],
                ensure_ascii=False,
            )
        if "research analyst" in system:
            return self.final_answer
        return "ok"


class FakeSearchService:
    def __init__(self, mapping: dict[str, list[dict]], *, delay: float = 0.0) -> None:
        self.mapping = mapping
        self.delay = delay

    async def search(self, query: str, max_results: int = 5) -> list[dict]:
        if self.delay:
            await asyncio.sleep(self.delay)
        return list(self.mapping.get(query, []))[:max_results]


class FakeParserService:
    def __init__(self, mapping: dict[str, dict]) -> None:
        self.mapping = mapping

    async def parse(self, url: str) -> dict:
        return self.mapping[url]


class FakeMarketDataService:
    def __init__(self, mapping: dict[str, list[float]]) -> None:
        self.mapping = mapping

    async def get_history(self, entity: str, *, start_date: str, end_date: str) -> list[MarketDataPoint]:
        prices = self.mapping.get(entity, [])
        return [
            MarketDataPoint(timestamp_ms=1_700_000_000_000 + (index * 86_400_000), price=price)
            for index, price in enumerate(prices)
        ]


def build_fake_services():
    search = FakeSearchService(
        {
            "vector database definition": [
                {
                    "title": "Vector DB overview",
                    "url": "https://example.test/vector-db",
                    "snippet": "Overview snippet",
                },
                {
                    "title": "Similarity search guide",
                    "url": "https://docs.example.org/similarity-search",
                    "snippet": "Similarity snippet",
                },
            ],
            "vector database use cases": [
                {
                    "title": "Embeddings in production",
                    "url": "https://blog.example.net/embeddings",
                    "snippet": "Use cases snippet",
                }
            ],
            "fallback query": [
                {
                    "title": "Fallback source",
                    "url": "https://fallback.example.test/source",
                    "snippet": "Fallback snippet",
                }
            ],
        }
    )
    parser = FakeParserService(
        {
            "https://example.test/vector-db": {
                "url": "https://example.test/vector-db",
                "title": "Vector DB overview",
                "text": "Vector databases are optimized for embedding similarity search. " * 8,
            },
            "https://docs.example.org/similarity-search": {
                "url": "https://docs.example.org/similarity-search",
                "title": "Similarity search guide",
                "text": "Similarity search is a common retrieval pattern for embeddings. " * 7,
            },
            "https://blog.example.net/embeddings": {
                "url": "https://blog.example.net/embeddings",
                "title": "Embeddings in production",
                "text": "Teams use vector databases in semantic search, recommendations, and RAG. " * 7,
            },
            "https://fallback.example.test/source": {
                "url": "https://fallback.example.test/source",
                "title": "Fallback source",
                "text": "Fallback content for the original query. " * 8,
            },
        }
    )
    return search, parser


def test_stored_research_message_builds_context_summary() -> None:
    stored = {
        "content": "BTC was stronger than ETH over the quarter.",
        "research_query": "Compare BTC and ETH in Q1 2026",
        "research": {
            "findings": ["BTC outperformed ETH in Q1 2026."],
            "intent": {
                "entities": ["BTC", "ETH"],
                "time_range": {"label": "Q1 2026"},
            },
            "tables": [{"title": "Performance summary", "rows": [["BTC", "15%"]]}],
            "metrics": [{"entity": "BTC", "name": "percent_change", "value": "15.00", "unit": "%"}],
            "sources": [{"domain": "example.test", "title": "Market report"}],
        },
    }

    summary = build_context_content_from_stored_message(
        f"{STORED_MESSAGE_PREFIX}\n{json.dumps(stored, ensure_ascii=False)}",
        role="assistant",
    )

    assert "Compare BTC and ETH in Q1 2026" in summary
    assert "BTC outperformed ETH in Q1 2026." in summary
    assert "Performance summary" in summary
    assert STORED_MESSAGE_PREFIX not in summary


def test_research_presentation_hides_internal_tables() -> None:
    presentation = build_research_presentation(
        query="Compare BTC and ETH",
        intent=ResearchIntent(kind="comparison", entities=["BTC", "ETH"], requires_comparison=True),
        summary="",
        findings=[
            "Verdict: BTC was stronger over the quarter.",
            "BTC gained faster than ETH during the quarter.",
        ],
        uncertainties=["Not enough source diversity collected for this facet."],
        tables=[
            ResearchTable(
                table_id="comparison-evidence-map",
                title="Evidence map",
                columns=["Facet", "Coverage"],
                rows=[["performance", "partial"]],
            ),
            ResearchTable(
                table_id="comparison-summary",
                title="Performance summary",
                columns=["Asset", "Change"],
                rows=[["BTC", "15%"], ["ETH", "8%"]],
            ),
        ],
        metrics=[],
        sources=[],
    )

    assert presentation.summary == "BTC was stronger over the quarter."
    assert all(section.title != "Evidence map" for section in presentation.sections)
    assert any(
        section.kind == "table" and section.title == "Performance summary"
        for section in presentation.sections
    )


async def wait_for_terminal(service: ResearchService, session_id: str, timeout: float = 1.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = await service.get_session(session_id)
        if session and session.status in {"completed", "failed", "cancelled"}:
            return session
        await asyncio.sleep(0.01)
    raise AssertionError(f"Session {session_id} did not reach terminal state")


@pytest.mark.asyncio
async def test_research_service_completes_and_streams_events() -> None:
    service = ResearchService(make_settings())
    mws = FakeMWS()
    search, parser = build_fake_services()

    session = await service.create_session(
        ResearchCreateRequest(query="vector databases", max_iterations=1, max_sources=4),
        mws=mws,
        search_svc=search,
        parser_svc=parser,
    )

    events = [event async for event in service.stream_session(session.session_id)]
    finished = await wait_for_terminal(service, session.session_id)

    assert finished.status == "completed"
    assert finished.result is not None
    assert finished.result.answer == "Structured research answer with citations."
    assert finished.result.presentation is not None
    assert finished.result.presentation.summary == finished.result.answer
    assert any(section.kind == "takeaways" for section in finished.result.presentation.sections)
    assert any(section.kind == "sources" for section in finished.result.presentation.sections)
    assert finished.result.sources
    assert finished.result.evidences
    assert finished.stats.stop_reason == "coverage_complete"
    assert {event.type for event in events} >= {
        "session_started",
        "plan_ready",
        "sources_discovered",
        "evidence_extracted",
        "coverage_updated",
        "answer_ready",
        "completed",
    }
    assert [call["model"] for call in mws.calls] == [
        "planner-model",
        "extractor-model",
        "extractor-model",
        "extractor-model",
        "writer-model",
    ]


@pytest.mark.asyncio
async def test_research_service_falls_back_when_planner_fails() -> None:
    service = ResearchService(make_settings())
    mws = FakeMWS(planner_error=RuntimeError("planner unavailable"))
    search, parser = build_fake_services()

    session = await service.create_session(
        ResearchCreateRequest(query="fallback query", max_iterations=1, max_sources=2),
        mws=mws,
        search_svc=search,
        parser_svc=parser,
    )
    finished = await wait_for_terminal(service, session.session_id)

    assert finished.status == "completed"
    assert finished.plan is not None
    assert finished.plan.facets[0].queries
    assert finished.plan.facets[0].queries[0] == "fallback query"
    assert finished.result is not None
    assert finished.result.sources[0].url == "https://fallback.example.test/source"


@pytest.mark.asyncio
async def test_research_service_can_cancel_running_session() -> None:
    service = ResearchService(make_settings())
    mws = FakeMWS()
    search, parser = build_fake_services()
    slow_search = FakeSearchService(search.mapping, delay=0.2)

    session = await service.create_session(
        ResearchCreateRequest(query="vector databases", max_iterations=2),
        mws=mws,
        search_svc=slow_search,
        parser_svc=parser,
    )
    await asyncio.sleep(0.02)
    await service.cancel_session(session.session_id)
    finished = await wait_for_terminal(service, session.session_id)

    assert finished.status == "cancelled"
    assert finished.stats.stop_reason == "cancelled"


@pytest.mark.asyncio
async def test_research_service_safe_mode_stays_on_fallback_path() -> None:
    service = ResearchService(make_settings(RESEARCH_SAFE_MODE=True))
    mws = FakeMWS()
    search, parser = build_fake_services()

    session = await service.create_session(
        ResearchCreateRequest(query="vector databases", max_iterations=1, max_sources=3),
        mws=mws,
        search_svc=search,
        parser_svc=parser,
    )
    finished = await wait_for_terminal(service, session.session_id)

    assert finished.status == "completed"
    assert finished.result is not None
    assert finished.result.answer
    assert finished.result.presentation is not None
    assert any(section.kind == "limitations" for section in finished.result.presentation.sections)
    assert [call["model"] for call in mws.calls] == []


@pytest.mark.asyncio
async def test_research_service_uses_conversation_context_for_follow_up_queries() -> None:
    service = ResearchService(make_settings())
    mws = FakeMWS(planner_error=RuntimeError("planner unavailable"))
    follow_up_query = "Provide examples"
    effective_query = "Best AI systems in the world. Follow-up request: Provide examples"
    search = FakeSearchService(
        {
            effective_query: [
                {
                    "title": "Best AI systems examples",
                    "url": "https://example.test/ai-examples",
                    "snippet": "Examples of leading AI systems and products.",
                }
            ]
        }
    )
    parser = FakeParserService(
        {
            "https://example.test/ai-examples": {
                "url": "https://example.test/ai-examples",
                "title": "Best AI systems examples",
                "text": "Examples include GPT, Gemini, Claude, Midjourney, and Perplexity in different categories.",
            }
        }
    )

    session = await service.create_session(
        ResearchCreateRequest(
            query=follow_up_query,
            conversation_context=[
                {"role": "user", "content": "Best AI systems in the world"},
                {"role": "assistant", "content": "I already compared leading AI systems across chat, coding, multimodal, and search use cases."},
            ],
            memory_context="User memory context.\n- [preferences] topic: frontier AI systems",
            max_iterations=1,
            max_facets=1,
            max_sources=2,
        ),
        mws=mws,
        search_svc=search,
        parser_svc=parser,
    )
    finished = await wait_for_terminal(service, session.session_id)

    assert finished.status == "completed"
    assert finished.plan is not None
    assert finished.plan.facets[0].queries[0] == effective_query
    assert finished.result is not None
    assert finished.result.sources[0].url == "https://example.test/ai-examples"
    writer_call = next(call for call in reversed(mws.calls) if call["model"] == "writer-model")
    assert "Best AI systems in the world" in writer_call["user"]
    assert "Provide examples" in writer_call["user"]
    assert "User memory context." in writer_call["user"]


@pytest.mark.asyncio
async def test_research_service_time_series_analysis_builds_metrics_and_table() -> None:
    service = ResearchService(make_settings(RESEARCH_SAFE_MODE=True))
    mws = FakeMWS()
    search = FakeSearchService(
        {
            "BTC historical price Q1 2026": [
                {"title": "BTC Q1 performance", "url": "https://example.test/btc-q1", "snippet": "BTC performance summary"},
            ],
            "ETH historical price Q1 2026": [
                {"title": "ETH Q1 performance", "url": "https://example.test/eth-q1", "snippet": "ETH performance summary"},
            ],
            "BTC vs ETH performance comparison Q1 2026": [
                {"title": "BTC vs ETH Q1 comparison", "url": "https://example.test/btc-eth-q1", "snippet": "Comparison summary"},
            ],
        }
    )
    parser = FakeParserService(
        {
            "https://example.test/btc-q1": {
                "url": "https://example.test/btc-q1",
                "title": "BTC Q1 performance",
                "text": "BTC started the quarter lower and ended materially higher. Change reached 20%.",
            },
            "https://example.test/eth-q1": {
                "url": "https://example.test/eth-q1",
                "title": "ETH Q1 performance",
                "text": "ETH also gained during the quarter with a smaller rise around 10%.",
            },
            "https://example.test/btc-eth-q1": {
                "url": "https://example.test/btc-eth-q1",
                "title": "BTC vs ETH Q1 comparison",
                "text": "BTC outperformed ETH during the quarter.",
            },
        }
    )
    market = FakeMarketDataService(
        {
            "BTC": [100.0, 110.0, 120.0],
            "ETH": [200.0, 210.0, 220.0],
        }
    )

    session = await service.create_session(
        ResearchCreateRequest(
            query="Сравни темпы роста BTC и ETH за последний квартал и сделай сводную таблицу",
            max_iterations=1,
            max_sources=4,
        ),
        mws=mws,
        search_svc=search,
        parser_svc=parser,
        market_data_svc=market,
    )
    finished = await wait_for_terminal(service, session.session_id)

    assert finished.status == "completed"
    assert finished.intent is not None
    assert finished.intent.kind == "time_series"
    assert finished.result is not None
    assert finished.result.tables
    assert finished.result.metrics
    assert finished.result.presentation is not None
    assert finished.stats.tables_built >= 1
    assert finished.stats.metrics_computed >= 6
    assert any(table.title == "Performance summary" for table in finished.result.tables)
    assert any(
        section.kind == "table" and section.title == "Performance summary"
        for section in finished.result.presentation.sections
    )
    assert finished.stats.deliverables_satisfied == finished.stats.deliverables_total
    assert "BTC" in finished.result.answer
    assert "ETH" in finished.result.answer


def test_research_session_http_endpoints() -> None:
    service = ResearchService(make_settings())
    mws = FakeMWS()
    search, parser = build_fake_services()

    app = FastAPI()
    app.include_router(research_api.router, prefix="/v1")
    app.dependency_overrides[get_research_service] = lambda: service
    app.dependency_overrides[research_api.get_mws_client] = lambda: mws
    app.dependency_overrides[research_api.get_web_search_service] = lambda: search
    app.dependency_overrides[research_api.get_web_parser_service] = lambda: parser
    app.dependency_overrides[research_api.get_current_user_optional] = lambda: None

    with TestClient(app) as client:
        response = client.post(
            "/v1/research/sessions",
            json={"query": "vector databases", "max_iterations": 1},
        )
        assert response.status_code == 202
        payload = response.json()
        session_id = payload["session_id"]

        for _ in range(50):
            details = client.get(f"/v1/research/sessions/{session_id}")
            assert details.status_code == 200
            body = details.json()
            if body["status"] in {"completed", "failed"}:
                break
            time.sleep(0.02)

        assert body["status"] == "completed"
        assert body["result"]["answer"] == "Structured research answer with citations."
        assert body["result"]["presentation"]["summary"] == body["result"]["answer"]

        stream_response = client.get(f"/v1/research/sessions/{session_id}/stream")
        assert stream_response.status_code == 200
        assert "event: plan_ready" in stream_response.text
        assert "event: completed" in stream_response.text
