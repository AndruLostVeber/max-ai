from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import AsyncIterator
from urllib.parse import urlsplit, urlunsplit

from app.config import Settings, get_settings
from app.services.mws_client import MWSClient
from app.services.research.analysis import analyze_research
from app.services.research.contracts import (
    ResearchCoverage,
    ResearchContextMessage,
    ResearchCreateRequest,
    ResearchDeliverable,
    ResearchError,
    ResearchEvent,
    ResearchEvidence,
    ResearchFacet,
    ResearchIntent,
    ResearchMetric,
    ResearchPlan,
    ResearchResult,
    ResearchSession,
    ResearchSource,
    ResearchTable,
    utcnow,
)
from app.services.research.intent import attach_deliverables, build_deterministic_plan, resolve_research_intent
from app.services.research.market_data import MarketDataService
from app.services.research.presentation import (
    build_research_presentation,
    render_research_presentation_markdown,
)
from app.services.research.store import InMemoryResearchSessionStore
from app.services.web_parser import WebParserService
from app.services.web_search import WebSearchService

logger = logging.getLogger(__name__)

_FOLLOW_UP_HINT_RE = re.compile(
    r"\b(example|examples|list|show|expand|continue|details|detail|compare|table|more|them|those|these)\b",
    re.IGNORECASE,
)


@dataclass(slots=True)
class ResearchBrief:
    original_query: str
    effective_query: str
    context_block: str | None = None
    used_context: bool = False

_NON_WORD_RE = re.compile(r"[^a-zа-я0-9]+", re.IGNORECASE)


def _mws_chat_simple_sync(
    base_url: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
) -> str:
    import httpx

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    with httpx.Client(base_url=base_url, headers=headers, timeout=60) as client:
        response = client.post("/v1/chat/completions", json=payload)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


class ResearchService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._store = InMemoryResearchSessionStore()
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._llm_executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=max(1, min(settings.RESEARCH_LLM_CONCURRENCY, 2))
        )

    async def create_session(
        self,
        request: ResearchCreateRequest,
        *,
        mws: MWSClient,
        search_svc: WebSearchService,
        parser_svc: WebParserService,
        market_data_svc: MarketDataService | None = None,
    ) -> ResearchSession:
        normalized_request = request.model_copy(
            update={
                "query": (request.query or "").strip(),
                "user_id": str(request.user_id or "anonymous").strip() or "anonymous",
                "conversation_id": str(request.conversation_id or "").strip() or None,
                "conversation_context": self._normalize_context_messages(request.conversation_context),
                "memory_context": self._normalize_optional_block(request.memory_context),
            }
        )
        session = ResearchSession(
            session_id=uuid.uuid4().hex,
            status="queued",
            request=normalized_request,
        )
        await self._store.create_session(session)

        task = asyncio.create_task(
            self._run_session(
                session.session_id,
                normalized_request,
                mws=mws,
                search_svc=search_svc,
                parser_svc=parser_svc,
                market_data_svc=market_data_svc,
            )
        )
        self._tasks[session.session_id] = task
        task.add_done_callback(lambda _: self._tasks.pop(session.session_id, None))
        return session

    async def get_session(self, session_id: str) -> ResearchSession | None:
        return await self._store.get_session(session_id)

    async def stream_session(self, session_id: str) -> AsyncIterator[ResearchEvent]:
        queue, history, is_terminal = await self._store.subscribe(session_id)
        try:
            for event in history:
                yield event

            if is_terminal:
                return

            while True:
                event = await queue.get()
                yield event
                if event.type in {"completed", "failed", "cancelled"}:
                    return
        finally:
            await self._store.unsubscribe(session_id, queue)

    async def cancel_session(self, session_id: str) -> ResearchSession:
        session = await self._require_session(session_id)
        task = self._tasks.get(session_id)
        if task and not task.done():
            task.cancel()
        else:
            session.status = "cancelled"
            session.stats.stop_reason = session.stats.stop_reason or "cancelled"
            await self._touch(session)
            await self._emit(session, "cancelled", {"message": "Research session cancelled"})
        return await self._require_session(session_id)

    async def _run_session(
        self,
        session_id: str,
        request: ResearchCreateRequest,
        *,
        mws: MWSClient,
        search_svc: WebSearchService,
        parser_svc: WebParserService,
        market_data_svc: MarketDataService | None,
    ) -> None:
        started = time.monotonic()
        session = await self._require_session(session_id)

        try:
            if not request.query:
                raise ValueError("Query must not be empty")

            brief = self._build_research_brief(request)
            session.status = "planning"
            await self._touch(session)
            await self._emit(
                session,
                "session_started",
                {
                    "query": request.query,
                    "effective_query": brief.effective_query,
                    "used_context": brief.used_context,
                },
            )
            logger.warning("Research session %s: planning started", session_id)

            intent = resolve_research_intent(brief.effective_query)
            session.intent = intent
            plan = await self._build_plan(request, brief, intent, mws)
            logger.warning("Research session %s: plan built with %s facets", session_id, len(plan.facets))
            session.plan = plan
            session.stats.queries_generated = sum(len(facet.queries) for facet in plan.facets)
            await self._touch(session)
            await self._emit(
                session,
                "plan_ready",
                {
                    "facets": [facet.model_dump(mode="json") for facet in plan.facets],
                    "stop_criteria": plan.stop_criteria,
                },
            )

            sources_by_key: dict[str, ResearchSource] = {}
            evidences: list[ResearchEvidence] = []
            coverage: list[ResearchCoverage] = []
            missing_facet_ids: list[str] = []
            seen_queries: set[str] = set()
            selected_sources: list[ResearchSource] = []
            findings: list[str] = []
            uncertainties: list[str] = []
            deliverables: list[ResearchDeliverable] = []
            metrics: list[ResearchMetric] = []
            tables: list[ResearchTable] = []

            for iteration in range(1, request.max_iterations + 1):
                session.status = "collecting"
                await self._touch(session)
                logger.warning("Research session %s: collecting iteration %s", session_id, iteration)

                discovered = await self._collect_sources(
                    plan,
                    iteration=iteration,
                    search_svc=search_svc,
                    parser_svc=parser_svc,
                    seen_queries=seen_queries,
                )
                for source in discovered:
                    key = self._source_key(source)
                    previous = sources_by_key.get(key)
                    if previous is None or self._combined_score(source) > self._combined_score(previous):
                        sources_by_key[key] = source

                selected_candidates = self._select_top_sources(
                    list(sources_by_key.values()),
                    max_sources=request.max_sources,
                )
                selected_sources = await self._hydrate_selected_sources(
                    selected_candidates,
                    parser_svc=parser_svc,
                )
                session.stats.sources_discovered = len(sources_by_key)
                session.stats.sources_selected = len(selected_sources)
                await self._touch(session)
                await self._emit(
                    session,
                    "sources_discovered",
                    {
                        "iteration": iteration,
                        "count": len(discovered),
                        "total": len(sources_by_key),
                    },
                )
                await self._emit(
                    session,
                    "sources_selected",
                    {
                        "iteration": iteration,
                        "count": len(selected_sources),
                        "sources": [source.model_dump(mode="json") for source in selected_sources[:5]],
                    },
                )

                session.status = "extracting"
                await self._touch(session)
                logger.warning("Research session %s: extracting from %s sources", session_id, len(selected_sources))
                evidences = await self._extract_evidence(plan, selected_sources, mws)
                session.stats.evidences_extracted = len(evidences)
                await self._touch(session)
                await self._emit(
                    session,
                    "evidence_extracted",
                    {
                        "iteration": iteration,
                        "count": len(evidences),
                        "evidence_preview": [evidence.model_dump(mode="json") for evidence in evidences[:5]],
                    },
                )

                session.status = "evaluating"
                await self._touch(session)
                analysis = await analyze_research(
                    query=brief.effective_query,
                    intent=intent,
                    sources=selected_sources,
                    evidences=evidences,
                    deliverables=plan.deliverables,
                    market_data_svc=market_data_svc,
                )
                findings = analysis.findings or self._top_findings(evidences)
                deliverables = analysis.deliverables
                metrics = analysis.metrics
                tables = analysis.tables
                coverage, missing_facet_ids = self._build_coverage(
                    plan,
                    evidences,
                    selected_sources,
                    deliverables=deliverables,
                )
                uncertainties = list(
                    dict.fromkeys(
                        [
                            *analysis.uncertainties,
                            *self._build_uncertainties(coverage, selected_sources),
                        ]
                    )
                )
                session.stats.iterations_completed = iteration
                session.stats.metrics_computed = len(metrics)
                session.stats.tables_built = len(tables)
                session.stats.deliverables_total = len(deliverables)
                session.stats.deliverables_satisfied = sum(
                    1 for item in deliverables if item.satisfied
                )
                await self._touch(session)
                await self._emit(
                    session,
                    "coverage_updated",
                    {
                        "iteration": iteration,
                        "coverage": [item.model_dump(mode="json") for item in coverage],
                        "missing_facet_ids": missing_facet_ids,
                    },
                )
                await self._emit(
                    session,
                    "iteration_completed",
                    {
                        "iteration": iteration,
                        "missing_facet_ids": missing_facet_ids,
                    },
                )

                if not missing_facet_ids:
                    session.stats.stop_reason = "coverage_complete"
                    break
                if iteration < request.max_iterations:
                    plan = self._expand_plan(plan, missing_facet_ids)
                    session.plan = plan
                    session.stats.queries_generated = sum(len(facet.queries) for facet in plan.facets)
                    await self._touch(session)

            if not session.stats.stop_reason:
                session.stats.stop_reason = (
                    "iteration_limit" if missing_facet_ids else "coverage_complete"
                )

            session.status = "writing"
            await self._touch(session)
            logger.warning("Research session %s: writing final answer", session_id)
            if not selected_sources:
                selected_sources = self._select_top_sources(list(sources_by_key.values()), request.max_sources)
            summary = await self._write_answer(
                request,
                brief,
                plan,
                intent,
                selected_sources,
                evidences,
                coverage,
                findings,
                uncertainties,
                deliverables,
                tables,
                metrics,
                mws,
            )
            presentation = build_research_presentation(
                query=brief.original_query,
                intent=intent,
                summary=summary,
                findings=findings,
                uncertainties=uncertainties,
                tables=tables,
                metrics=metrics,
                sources=selected_sources,
            )
            answer = render_research_presentation_markdown(presentation)
            session.result = ResearchResult(
                answer=answer,
                intent=intent,
                findings=findings,
                uncertainties=uncertainties,
                deliverables=deliverables,
                tables=tables,
                metrics=metrics,
                sources=selected_sources,
                evidences=evidences,
                coverage=coverage,
                presentation=presentation,
                stats=session.stats.model_copy(deep=True),
            )
            session.status = "completed"
            session.stats.duration_ms = int((time.monotonic() - started) * 1000)
            await self._touch(session)
            await self._emit(
                session,
                "answer_ready",
                {
                    "answer_preview": answer[:400],
                    "sources": len(selected_sources),
                    "evidences": len(evidences),
                },
            )
            await self._emit(
                session,
                "completed",
                {
                    "stop_reason": session.stats.stop_reason,
                    "duration_ms": session.stats.duration_ms,
                },
            )
        except asyncio.CancelledError:
            session = await self._require_session(session_id)
            session.status = "cancelled"
            session.stats.stop_reason = "cancelled"
            session.stats.duration_ms = int((time.monotonic() - started) * 1000)
            await self._touch(session)
            await self._emit(session, "cancelled", {"message": "Research session cancelled"})
        except Exception as exc:
            logger.exception("Research V2 session failed: %s", session_id)
            session = await self._require_session(session_id)
            session.status = "failed"
            session.error = ResearchError(code="research_failed", message=str(exc))
            session.stats.stop_reason = "failed"
            session.stats.duration_ms = int((time.monotonic() - started) * 1000)
            await self._touch(session)
            await self._emit(
                session,
                "failed",
                {"error": session.error.model_dump(mode="json")},
            )

    async def _build_plan(
        self,
        request: ResearchCreateRequest,
        brief: ResearchBrief,
        intent: ResearchIntent,
        mws: MWSClient,
    ) -> ResearchPlan:
        fallback = self._fallback_plan(brief.effective_query, request.max_facets, intent)
        if self._settings.RESEARCH_SAFE_MODE or intent.kind != "general":
            return fallback
        try:
            raw = await self._run_mws_chat_simple(
                mws=mws,
                model=self._settings.MODEL_RESEARCH_PLANNER,
                system=(
                    "You are a research planner. Return ONLY valid JSON object with key "
                    '"facets". Each facet must have title, questions, and queries. '
                    "Keep the plan concise and practical."
                ),
                user=(
                    f"User query: {brief.original_query}\n"
                    f"Effective research brief: {brief.effective_query}\n"
                    f"Conversation/memory context:\n{brief.context_block or 'None'}\n"
                    f"Maximum facets: {request.max_facets}\n"
                    'Output shape: {"facets":[{"title":"...","questions":["..."],"queries":["..."]}]}'
                ),
                timeout=20,
            )
            parsed = self._parse_json_object(raw)
            normalized = self._normalize_plan(parsed, brief.effective_query, request.max_facets)
            if normalized is None:
                return fallback
            return attach_deliverables(
                normalized,
                deliverables=fallback.deliverables,
                intent=intent,
            )
        except Exception as exc:
            logger.warning("Research planner fallback for query=%r: %s", brief.effective_query, exc)
            return fallback

    def _fallback_plan(self, query: str, max_facets: int, intent: ResearchIntent) -> ResearchPlan:
        return build_deterministic_plan(query, intent, max_facets=max_facets)

    def _normalize_plan(
        self,
        payload: dict,
        query: str,
        max_facets: int,
    ) -> ResearchPlan | None:
        max_facets = min(max_facets, 3)
        raw_facets = payload.get("facets")
        if not isinstance(raw_facets, list):
            return None

        facets: list[ResearchFacet] = []
        seen_titles: set[str] = set()
        for index, item in enumerate(raw_facets[:max_facets], start=1):
            if not isinstance(item, dict):
                continue
            title = re.sub(r"\s+", " ", str(item.get("title", "")).strip())
            if not title:
                continue
            title_key = title.casefold()
            if title_key in seen_titles:
                continue
            seen_titles.add(title_key)
            facets.append(
                ResearchFacet(
                    facet_id=f"facet-{index}",
                    title=title,
                    questions=self._normalize_text_list(item.get("questions"), fallback=title),
                    queries=self._normalize_text_list(item.get("queries"), fallback=title),
                )
            )

        if not facets:
            return None

        return ResearchPlan(
            facets=facets,
            stop_criteria=[
                "Each facet should have evidence from at least one domain",
                "Do not make claims without evidence",
                f"Stay focused on the original query: {query}",
            ],
        )

    async def _collect_sources(
        self,
        plan: ResearchPlan,
        *,
        iteration: int,
        search_svc: WebSearchService,
        parser_svc: WebParserService,
        seen_queries: set[str],
    ) -> list[ResearchSource]:
        sources: list[ResearchSource] = []
        facet_counts: dict[str, int] = {}
        target_per_facet = 2 if iteration <= 1 else 3
        for facet in plan.facets:
            for query in self._facet_queries_for_iteration(facet, iteration):
                if query.casefold() in seen_queries:
                    continue
                seen_queries.add(query.casefold())
                collected = await self._collect_sources_for_query(
                    facet=facet,
                    query=query,
                    search_svc=search_svc,
                )
                if not collected:
                    continue
                sources.extend(collected)
                facet_counts[facet.facet_id] = facet_counts.get(facet.facet_id, 0) + len(collected)
                if (
                    len(sources) >= max(6, len(plan.facets) * 3)
                    and all(facet_counts.get(item.facet_id, 0) >= target_per_facet for item in plan.facets)
                ):
                    return sources
        return sources

    async def _collect_sources_for_query(
        self,
        *,
        facet: ResearchFacet,
        query: str,
        search_svc: WebSearchService,
    ) -> list[ResearchSource]:
        try:
            results = await asyncio.wait_for(
                search_svc.search(
                    query,
                    max_results=self._settings.RESEARCH_SEARCH_RESULTS,
                ),
                timeout=12,
            )
        except Exception as exc:
            logger.debug("Search failed for query=%r: %s", query, exc)
            return []
        sources: list[ResearchSource] = []
        for result in results:
            url = self._normalize_url(str(result.get("url") or ""))
            if not url:
                continue
            title = str(result.get("title") or url).strip()[:300]
            snippet = str(result.get("snippet") or "").strip()[:500]
            excerpt = self._truncate_text(snippet, min(self._settings.RESEARCH_SOURCE_TEXT_CHARS, 500))
            if not excerpt:
                continue
            if self._is_low_signal_source(url, title, snippet):
                continue
            sources.append(
                ResearchSource(
                    source_id=uuid.uuid4().hex,
                    facet_id=facet.facet_id,
                    title=title,
                    url=url,
                    domain=urlsplit(url).netloc,
                    snippet=snippet,
                    excerpt=excerpt,
                    relevance_score=self._score_relevance(query, title, snippet, excerpt),
                    quality_score=self._score_quality(url, excerpt),
                )
            )
        return sources

    async def _hydrate_selected_sources(
        self,
        sources: list[ResearchSource],
        *,
        parser_svc: WebParserService,
    ) -> list[ResearchSource]:
        if not sources:
            return []

        parse_semaphore = asyncio.Semaphore(self._settings.RESEARCH_HTTP_CONCURRENCY)
        tasks = [
            asyncio.create_task(
                self._hydrate_source(
                    source=source,
                    parser_svc=parser_svc,
                    parse_semaphore=parse_semaphore,
                )
            )
            for source in sources
        ]
        gathered = await asyncio.gather(*tasks, return_exceptions=True)
        hydrated: list[ResearchSource] = []
        for original, item in zip(sources, gathered):
            if isinstance(item, ResearchSource):
                hydrated.append(item)
            else:
                hydrated.append(original)
        return hydrated

    async def _hydrate_source(
        self,
        *,
        source: ResearchSource,
        parser_svc: WebParserService,
        parse_semaphore: asyncio.Semaphore,
    ) -> ResearchSource:
        try:
            async with parse_semaphore:
                parsed = await asyncio.wait_for(parser_svc.parse(source.url), timeout=12)
        except Exception as exc:
            logger.debug("Source hydration fallback for %s: %s", source.url, exc)
            return source

        title = str(parsed.get("title") or source.title or source.url).strip()[:300]
        raw_text = str(parsed.get("text") or source.excerpt or source.snippet or "").strip()
        excerpt = self._extract_relevant_excerpt(
            raw_text,
            focus_text=" ".join([source.title, source.snippet]),
            limit=self._settings.RESEARCH_SOURCE_TEXT_CHARS,
        )
        if not excerpt:
            return source

        return source.model_copy(
            update={
                "title": title,
                "excerpt": excerpt,
                "quality_score": max(source.quality_score, self._score_quality(source.url, excerpt)),
            }
        )

    async def _extract_evidence(
        self,
        plan: ResearchPlan,
        sources: list[ResearchSource],
        mws: MWSClient,
    ) -> list[ResearchEvidence]:
        if self._settings.RESEARCH_SAFE_MODE:
            return [
                evidence
                for source in sources
                if any(facet.facet_id == source.facet_id for facet in plan.facets)
                for evidence in self._deterministic_evidence_for_source(
                    next(facet for facet in plan.facets if facet.facet_id == source.facet_id),
                    source,
                )
            ]
        evidences: list[ResearchEvidence] = []
        facets_by_id = {facet.facet_id: facet for facet in plan.facets}
        llm_semaphore = asyncio.Semaphore(self._settings.RESEARCH_LLM_CONCURRENCY)
        tasks = [
            asyncio.create_task(
                self._extract_evidence_for_source(
                    facets_by_id[source.facet_id],
                    source,
                    mws,
                    llm_semaphore=llm_semaphore,
                )
            )
            for source in sources
            if source.facet_id in facets_by_id
        ]
        if not tasks:
            return []

        gathered = await asyncio.gather(*tasks, return_exceptions=True)
        for item in gathered:
            if isinstance(item, list):
                evidences.extend(item)
        return evidences

    async def _extract_evidence_for_source(
        self,
        facet: ResearchFacet,
        source: ResearchSource,
        mws: MWSClient,
        *,
        llm_semaphore: asyncio.Semaphore | None = None,
    ) -> list[ResearchEvidence]:
        try:
            semaphore = llm_semaphore or asyncio.Semaphore(1)
            async with semaphore:
                raw = await self._run_mws_chat_simple(
                    mws=mws,
                    model=self._settings.MODEL_RESEARCH_EXTRACTOR,
                    system=(
                        "You extract research evidence from a single source. Return ONLY a JSON array. "
                        'Each item must have claim, excerpt, confidence, and stance. '
                        "Never invent claims that are absent from the source."
                    ),
                    user=(
                        f"Facet title: {facet.title}\n"
                        f"Facet questions: {' | '.join(facet.questions)}\n"
                        f"Source title: {source.title}\n"
                        f"Source URL: {source.url}\n"
                        f"Source content:\n{source.excerpt}\n\n"
                        f"Return at most {self._settings.RESEARCH_MAX_EVIDENCE_PER_SOURCE} items."
                    ),
                    timeout=20,
                )
            parsed = self._parse_json_array(raw)
            normalized = self._normalize_evidence_payload(parsed, facet.facet_id, source.source_id)
            if normalized:
                return normalized[: self._settings.RESEARCH_MAX_EVIDENCE_PER_SOURCE]
        except Exception as exc:
            logger.debug("Evidence extraction fallback for %s: %s", source.url, exc)

        return self._deterministic_evidence_for_source(facet, source)

    def _normalize_evidence_payload(
        self,
        payload: list,
        facet_id: str,
        source_id: str,
    ) -> list[ResearchEvidence]:
        items: list[ResearchEvidence] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            claim = re.sub(r"\s+", " ", str(item.get("claim", "")).strip())
            excerpt = re.sub(r"\s+", " ", str(item.get("excerpt", "")).strip())
            if not claim or not excerpt:
                continue
            stance = str(item.get("stance", "context")).strip().lower()
            if stance not in {"supports", "contradicts", "context"}:
                stance = "context"
            try:
                confidence = float(item.get("confidence", 0.5))
            except Exception:
                confidence = 0.5
            items.append(
                ResearchEvidence(
                    evidence_id=f"E{len(items) + 1}-{source_id[:6]}",
                    facet_id=facet_id,
                    source_id=source_id,
                    claim=claim[:400],
                    excerpt=excerpt[:500],
                    stance=stance,
                    confidence=max(0.0, min(confidence, 1.0)),
                )
            )
        return items

    def _fallback_evidence(self, facet_id: str, source: ResearchSource) -> ResearchEvidence:
        excerpt = (source.excerpt or source.snippet or source.title)[:500]
        claim = (self._split_sentences(source.excerpt or source.snippet) or [source.title])[0]
        return ResearchEvidence(
            evidence_id=f"E1-{source.source_id[:6]}",
            facet_id=facet_id,
            source_id=source.source_id,
            claim=claim[:400],
            excerpt=excerpt[:500],
            stance="context",
            confidence=0.35,
        )

    def _deterministic_evidence_for_source(
        self,
        facet: ResearchFacet,
        source: ResearchSource,
    ) -> list[ResearchEvidence]:
        sentences = self._split_sentences(source.excerpt or source.snippet or source.title)
        if not sentences:
            return [self._fallback_evidence(facet.facet_id, source)]

        query_tokens = set(self._tokenize(" ".join([facet.title, *facet.questions, *facet.queries])))
        scored: list[tuple[float, str]] = []
        for sentence in sentences:
            normalized = re.sub(r"\s+", " ", sentence).strip()
            if len(normalized) < 20:
                continue
            score = self._score_sentence_for_facet(normalized, query_tokens, source.title)
            scored.append((score, normalized))
        if not scored:
            return [self._fallback_evidence(facet.facet_id, source)]

        evidences: list[ResearchEvidence] = []
        seen: set[str] = set()
        for index, (score, sentence) in enumerate(sorted(scored, key=lambda item: item[0], reverse=True), start=1):
            key = sentence.casefold()
            if key in seen:
                continue
            seen.add(key)
            evidences.append(
                ResearchEvidence(
                    evidence_id=f"E{index}-{source.source_id[:6]}",
                    facet_id=facet.facet_id,
                    source_id=source.source_id,
                    claim=sentence[:400],
                    excerpt=sentence[:500],
                    stance="context",
                    confidence=max(0.35, min(score, 0.82)),
                )
            )
            if len(evidences) >= self._settings.RESEARCH_MAX_EVIDENCE_PER_SOURCE:
                break
        return evidences or [self._fallback_evidence(facet.facet_id, source)]

    def _build_coverage(
        self,
        plan: ResearchPlan,
        evidences: list[ResearchEvidence],
        sources: list[ResearchSource],
        *,
        deliverables: list[ResearchDeliverable] | None = None,
    ) -> tuple[list[ResearchCoverage], list[str]]:
        sources_by_id = {source.source_id: source for source in sources}
        missing_deliverables_by_facet: dict[str, list[str]] = {}
        for deliverable in deliverables or []:
            if not deliverable.required or deliverable.satisfied or not deliverable.facet_id:
                continue
            missing_deliverables_by_facet.setdefault(deliverable.facet_id, []).append(deliverable.title)
        coverage: list[ResearchCoverage] = []
        missing: list[str] = []

        for facet in plan.facets:
            facet_evidence = [item for item in evidences if item.facet_id == facet.facet_id]
            domains = {
                sources_by_id[item.source_id].domain
                for item in facet_evidence
                if item.source_id in sources_by_id
            }
            notes: list[str] = []
            if len(facet_evidence) < self._settings.RESEARCH_MIN_EVIDENCE_PER_FACET:
                notes.append("Not enough evidence extracted for this facet.")
            if len(domains) < self._settings.RESEARCH_MIN_DOMAINS_PER_FACET:
                notes.append("Need more domain diversity for this facet.")
            for title in missing_deliverables_by_facet.get(facet.facet_id, []):
                notes.append(f"Missing deliverable: {title}.")
            complete = not notes
            coverage_item = ResearchCoverage(
                facet_id=facet.facet_id,
                evidence_count=len(facet_evidence),
                domain_count=len(domains),
                complete=complete,
                notes=notes,
            )
            coverage.append(coverage_item)
            if not complete:
                missing.append(facet.facet_id)

        return coverage, missing

    async def _write_answer(
        self,
        request: ResearchCreateRequest,
        brief: ResearchBrief,
        plan: ResearchPlan,
        intent: ResearchIntent,
        sources: list[ResearchSource],
        evidences: list[ResearchEvidence],
        coverage: list[ResearchCoverage],
        findings: list[str],
        uncertainties: list[str],
        deliverables: list[ResearchDeliverable],
        tables: list[ResearchTable],
        metrics: list[ResearchMetric],
        mws: MWSClient,
    ) -> str:
        if self._settings.RESEARCH_SAFE_MODE:
            return ""
        if not evidences and not tables and not findings:
            return ""

        tables_json = json.dumps([item.model_dump(mode="json") for item in tables], ensure_ascii=False)
        metrics_json = json.dumps([item.model_dump(mode="json") for item in metrics], ensure_ascii=False)
        incomplete_items = [
            item.title
            for item in deliverables
            if item.required and not item.satisfied
        ]
        source_blocks = []
        for source in sources[: min(6, max(3, request.max_sources))]:
            source_blocks.append(
                "\n".join(
                    [
                        f"[{source.source_id}] {source.title}",
                        f"URL: {source.url}",
                        f"Domain: {source.domain}",
                        f"Snippet: {source.snippet or source.excerpt}",
                    ]
                )
            )
        evidence_blocks = []
        for evidence in evidences[: max(8, request.max_sources)]:
            evidence_blocks.append(
                "\n".join(
                    [
                        f"[{evidence.evidence_id}]",
                        f"Claim: {evidence.claim}",
                        f"Excerpt: {evidence.excerpt}",
                        f"Confidence: {evidence.confidence:.2f}",
                    ]
                )
            )
        source_block_text = "\n\n".join(source_blocks) or "None"
        evidence_block_text = "\n\n".join(evidence_blocks)
        try:
            raw_summary = await self._run_mws_chat_simple(
                mws=mws,
                model=self._settings.MODEL_RESEARCH_WRITER,
                system=(
                    "You are a research analyst. Write ONLY a short user-facing summary in the user's language. "
                    "Return one compact paragraph of 2 to 4 sentences with the direct answer first. "
                    "Use ONLY the provided findings, metrics, tables, and evidence. "
                    "Do not use headers, bullets, JSON, source dumps, or internal labels. "
                    "Never mention intent, facets, coverage, deliverables, extracted evidence counts, queries, or system context. "
                    "Do not include citation markers like [E1] or [S2]. "
                    "If the result is quantitative, preserve the computed numbers. "
                    "If evidence is incomplete, mention the main caveat in one short sentence."
                ),
                user=(
                    f"User query: {brief.original_query}\n"
                    f"Effective research brief: {brief.effective_query}\n"
                    f"Conversation/memory context:\n{brief.context_block or 'None'}\n"
                    f"Output mode: {request.output_mode}\n"
                    f"Findings: {json.dumps(findings, ensure_ascii=False)}\n"
                    f"Important limitations to mention only if material: {json.dumps(incomplete_items or uncertainties, ensure_ascii=False)}\n"
                    f"Uncertainties: {json.dumps(uncertainties, ensure_ascii=False)}\n"
                    f"Tables: {tables_json}\n"
                    f"Metrics: {metrics_json}\n\n"
                    f"Source shortlist:\n{source_block_text}\n\n"
                    f"Evidence:\n{evidence_block_text}"
                ),
                timeout=25,
            )
            return self._compact_context_content(raw_summary, limit=420)
        except Exception as exc:
            logger.warning("Research writer fallback for query=%r: %s", brief.effective_query, exc)
            return ""

    def _fallback_answer(
        self,
        query: str,
        sources: list[ResearchSource],
        coverage: list[ResearchCoverage],
        *,
        evidences: list[ResearchEvidence] | None = None,
    ) -> str:
        lines = [f"# Research Summary\n\nQuery: {query}"]
        if evidences:
            lines.append("\n## Key Findings")
            for evidence in evidences[:5]:
                lines.append(f"- {evidence.claim} [{evidence.evidence_id}]")
        if coverage:
            lines.append("\n## Coverage")
            for item in coverage:
                status = "complete" if item.complete else "partial"
                lines.append(
                    f"- {item.facet_id}: {status} ({item.evidence_count} evidence, {item.domain_count} domains)"
                )
        if sources:
            lines.append("\n## Sources")
            for source in sources[:5]:
                lines.append(f"- {source.title}: {source.url}")
        else:
            lines.append("\n## Limitations\n- No reliable web sources were collected.")
        return "\n".join(lines)

    def _build_uncertainties(
        self,
        coverage: list[ResearchCoverage],
        sources: list[ResearchSource],
    ) -> list[str]:
        items = [note for item in coverage for note in item.notes]
        if not sources:
            items.append("The session did not collect any reliable web sources.")
        return list(dict.fromkeys(items))

    def _top_findings(self, evidences: list[ResearchEvidence]) -> list[str]:
        findings: list[str] = []
        seen: set[str] = set()
        for evidence in sorted(evidences, key=lambda item: item.confidence, reverse=True):
            key = evidence.claim.casefold()
            if key in seen:
                continue
            seen.add(key)
            findings.append(evidence.claim)
            if len(findings) >= 5:
                break
        return findings

    def _expand_plan(self, plan: ResearchPlan, missing_facet_ids: list[str]) -> ResearchPlan:
        updated_facets: list[ResearchFacet] = []
        for facet in plan.facets:
            if facet.facet_id not in missing_facet_ids:
                updated_facets.append(facet)
                continue
            extra_queries = [*facet.queries, *facet.questions, f"{facet.title} overview"]
            updated_facets.append(
                facet.model_copy(
                    update={
                        "queries": self._normalize_text_list(extra_queries, fallback=facet.title),
                    }
                )
            )
        return plan.model_copy(update={"facets": updated_facets})

    def _normalize_optional_block(self, value: str | None, *, limit: int = 2400) -> str | None:
        if value is None:
            return None
        lines = [str(line or "").strip() for line in str(value).splitlines()]
        text = "\n".join(line for line in lines if line)
        return text[:limit] if text else None

    def _normalize_context_messages(
        self,
        messages: list[ResearchContextMessage] | None,
        *,
        limit: int = 6,
    ) -> list[ResearchContextMessage]:
        normalized: list[ResearchContextMessage] = []
        for item in messages or []:
            role = str(getattr(item, "role", "") or "").strip()
            content = re.sub(r"\s+", " ", str(getattr(item, "content", "") or "").strip())
            if role not in {"user", "assistant"} or not content:
                continue
            normalized.append(
                item.model_copy(
                    update={
                        "role": role,
                        "content": content[:1200],
                    }
                )
            )
        return normalized[-limit:]

    def _build_research_brief(self, request: ResearchCreateRequest) -> ResearchBrief:
        original_query = re.sub(r"\s+", " ", str(request.query or "").strip())
        memory_context = self._normalize_optional_block(request.memory_context, limit=1800)
        context_messages = self._normalize_context_messages(request.conversation_context, limit=6)
        if (
            context_messages
            and context_messages[-1].role == "user"
            and context_messages[-1].content.casefold() == original_query.casefold()
        ):
            context_messages = context_messages[:-1]

        is_follow_up = self._is_contextual_follow_up(original_query, context_messages)
        topic_seed = self._find_context_topic_seed(context_messages, original_query)
        effective_query = original_query
        if is_follow_up and topic_seed:
            effective_query = self._truncate_text(
                f"{topic_seed}. Follow-up request: {original_query}",
                420,
            )

        context_block = self._build_context_block(
            context_messages=context_messages,
            memory_context=memory_context,
        )
        return ResearchBrief(
            original_query=original_query,
            effective_query=effective_query,
            context_block=context_block,
            used_context=bool(context_block or effective_query != original_query),
        )

    def _is_contextual_follow_up(
        self,
        query: str,
        context_messages: list[ResearchContextMessage],
    ) -> bool:
        if not query or not context_messages:
            return False
        tokens = self._tokenize(query)
        if len(tokens) <= 6:
            return True
        if _FOLLOW_UP_HINT_RE.search(query):
            return True
        return query.endswith("?") and len(tokens) <= 8

    def _find_context_topic_seed(
        self,
        context_messages: list[ResearchContextMessage],
        current_query: str,
    ) -> str | None:
        for message in reversed(context_messages):
            content = self._compact_context_content(message.content, limit=320)
            if (
                content
                and message.role == "user"
                and content.casefold() != current_query.casefold()
                and (len(self._tokenize(content)) >= 4 or len(content) >= 24)
            ):
                return content
        for message in reversed(context_messages):
            content = self._compact_context_content(message.content, limit=320)
            if content and message.role == "assistant" and (len(self._tokenize(content)) >= 5 or len(content) >= 32):
                return content
        return None

    def _build_context_block(
        self,
        *,
        context_messages: list[ResearchContextMessage],
        memory_context: str | None,
    ) -> str | None:
        parts: list[str] = []
        if context_messages:
            lines = ["Recent conversation context:"]
            for message in context_messages[-4:]:
                label = "User" if message.role == "user" else "Assistant"
                lines.append(f"{label}: {self._compact_context_content(message.content, limit=360)}")
            parts.append("\n".join(lines))
        if memory_context:
            parts.append(memory_context)
        return "\n\n".join(parts) if parts else None

    def _compact_context_content(self, content: str, *, limit: int) -> str:
        compact = re.sub(r"\s+", " ", str(content or "").strip())
        if not compact:
            return ""
        sentences = self._split_sentences(compact)
        if sentences:
            chosen: list[str] = []
            total = 0
            for sentence in sentences:
                if total >= max(120, limit - 40):
                    break
                chosen.append(sentence)
                total += len(sentence) + 1
                if len(chosen) >= 2:
                    break
            compact = " ".join(chosen) if chosen else compact
        return self._truncate_text(compact, limit)

    async def _emit(self, session: ResearchSession, event_type: str, payload: dict) -> None:
        await self._store.append_event(
            session.session_id,
            ResearchEvent(
                type=event_type,
                session_id=session.session_id,
                status=session.status,
                payload=payload,
            ),
        )

    async def _touch(self, session: ResearchSession) -> None:
        session.updated_at = utcnow()
        await self._store.save_session(session)

    async def _require_session(self, session_id: str) -> ResearchSession:
        session = await self._store.get_session(session_id)
        if session is None:
            raise KeyError(session_id)
        return session

    def _facet_queries_for_iteration(self, facet: ResearchFacet, iteration: int) -> list[str]:
        if iteration <= 1:
            return facet.queries[:1]
        expanded = [*facet.queries, *facet.questions]
        return self._normalize_text_list(expanded, fallback=facet.title)[:2]

    def _source_key(self, source: ResearchSource) -> str:
        return f"{source.facet_id}::{self._normalize_url(source.url)}"

    def _combined_score(self, source: ResearchSource) -> float:
        return (source.relevance_score * 0.65) + (source.quality_score * 0.35)

    def _select_top_sources(self, sources: list[ResearchSource], max_sources: int) -> list[ResearchSource]:
        ordered = sorted(sources, key=self._combined_score, reverse=True)
        selected: list[ResearchSource] = []
        seen_domains: dict[str, int] = {}
        selected_keys: set[str] = set()

        facets_in_order: list[str] = []
        for source in ordered:
            if source.facet_id not in facets_in_order:
                facets_in_order.append(source.facet_id)

        for facet_id in facets_in_order:
            for source in ordered:
                if source.facet_id != facet_id:
                    continue
                key = self._source_key(source)
                if key in selected_keys:
                    continue
                domain_uses = seen_domains.get(source.domain, 0)
                if domain_uses >= 2:
                    continue
                selected.append(source)
                selected_keys.add(key)
                seen_domains[source.domain] = domain_uses + 1
                break
            if len(selected) >= max_sources:
                return selected

        for source in ordered:
            key = self._source_key(source)
            if key in selected_keys:
                continue
            domain_uses = seen_domains.get(source.domain, 0)
            if domain_uses >= 2:
                continue
            selected.append(source)
            selected_keys.add(key)
            seen_domains[source.domain] = domain_uses + 1
            if len(selected) >= max_sources:
                break
        return selected

    def _score_relevance(self, query: str, title: str, snippet: str, excerpt: str) -> float:
        query_tokens = set(self._tokenize(query))
        if not query_tokens:
            return 0.5
        haystack = " ".join([title, snippet, excerpt[:300]]).casefold()
        overlap = sum(1 for token in query_tokens if token in haystack)
        return min(1.0, 0.25 + (overlap / max(len(query_tokens), 1)))

    def _score_quality(self, url: str, excerpt: str) -> float:
        score = 0.2
        if url.startswith("https://"):
            score += 0.2
        score += min(len(excerpt) / 2000, 0.4)
        if "\n" in excerpt or ". " in excerpt:
            score += 0.2
        split = urlsplit(url)
        path = (split.path or "/").strip().lower()
        if path in {"", "/"}:
            score -= 0.15
        if any(token in path for token in ["/tag/", "/tags/", "/category/", "/search", "/topics/"]):
            score -= 0.1
        if any(token in split.netloc.lower() for token in ["wikipedia.org", "github.com"]):
            score += 0.05
        return min(score, 1.0)

    def _is_low_signal_source(self, url: str, title: str, snippet: str) -> bool:
        normalized_title = re.sub(r"\s+", " ", (title or "").strip()).casefold()
        normalized_snippet = re.sub(r"\s+", " ", (snippet or "").strip()).casefold()
        split = urlsplit(url)
        path = (split.path or "/").strip().lower()
        if not normalized_title and not normalized_snippet:
            return True
        if path in {"", "/"} and len(normalized_snippet) < 80:
            return True
        if any(token in normalized_title for token in ["sign in", "log in", "subscribe", "cookie", "home"]):
            return True
        if any(token in normalized_snippet for token in ["javascript", "enable cookies", "sign in", "subscribe"]):
            return True
        return False

    def _normalize_url(self, url: str) -> str:
        cleaned = (url or "").strip()
        if not cleaned:
            return ""
        split = urlsplit(cleaned)
        if not split.scheme or not split.netloc:
            return ""
        path = split.path.rstrip("/") or "/"
        return urlunsplit((split.scheme.lower(), split.netloc.lower(), path, split.query, ""))

    def _normalize_text(self, text: str) -> str:
        return _NON_WORD_RE.sub(" ", (text or "").casefold()).strip()

    def _tokenize(self, text: str) -> list[str]:
        normalized = self._normalize_text(text)
        return [token for token in normalized.split() if len(token) > 2][:12]

    def _split_sentences(self, text: str) -> list[str]:
        normalized = re.sub(r"\s+", " ", (text or "").strip())
        if not normalized:
            return []
        return [item.strip() for item in re.split(r"(?<=[.!?])\s+", normalized) if item.strip()]

    def _split_paragraphs(self, text: str) -> list[str]:
        if not text:
            return []
        parts = [re.sub(r"\s+", " ", item).strip() for item in re.split(r"\n{2,}|\r\n\r\n", text) if item.strip()]
        if parts:
            return parts
        return [re.sub(r"\s+", " ", text).strip()]

    def _score_sentence_for_facet(
        self,
        sentence: str,
        query_tokens: set[str],
        title: str,
    ) -> float:
        haystack = " ".join([title, sentence]).casefold()
        overlap = sum(1 for token in query_tokens if token in haystack)
        score = 0.25 + (overlap / max(len(query_tokens), 1))
        if re.search(r"\d", sentence):
            score += 0.1
        if "%" in sentence:
            score += 0.1
        return min(score, 0.92)

    def _extract_relevant_excerpt(self, text: str, *, focus_text: str, limit: int) -> str:
        normalized = (text or "").strip()
        if not normalized:
            return ""
        paragraphs = self._split_paragraphs(normalized)
        focus_tokens = set(self._tokenize(focus_text))
        scored: list[tuple[float, str]] = []
        for paragraph in paragraphs:
            compact = re.sub(r"\s+", " ", paragraph).strip()
            if len(compact) < 40:
                continue
            score = self._score_sentence_for_facet(compact[:600], focus_tokens, focus_text)
            if re.search(r"\d", compact):
                score += 0.05
            scored.append((score, compact))
        if not scored:
            return self._truncate_text(normalized, limit)

        chosen: list[str] = []
        total = 0
        for _, paragraph in sorted(scored, key=lambda item: item[0], reverse=True):
            chunk = paragraph[: min(420, limit)]
            if chunk in chosen:
                continue
            if total and total + len(chunk) + 2 > limit:
                break
            chosen.append(chunk)
            total += len(chunk) + 2
            if len(chosen) >= 3:
                break
        excerpt = "\n\n".join(chosen)
        return self._truncate_text(excerpt or normalized, limit)

    def _truncate_text(self, text: str, limit: int) -> str:
        normalized = re.sub(r"\s+", " ", (text or "").strip())
        return normalized[:limit]

    def _normalize_text_list(self, value: object, *, fallback: str) -> list[str]:
        items: list[str] = []
        if isinstance(value, list):
            raw_items = value
        elif isinstance(value, str):
            raw_items = [value]
        else:
            raw_items = []

        seen: set[str] = set()
        for raw in [*raw_items, fallback]:
            text = re.sub(r"\s+", " ", str(raw or "").strip())
            if not text:
                continue
            key = text.casefold()
            if key in seen:
                continue
            seen.add(key)
            items.append(text)
            if len(items) >= 4:
                break
        return items or [fallback]

    async def _run_mws_chat_simple(
        self,
        *,
        mws: MWSClient,
        model: str,
        system: str,
        user: str,
        timeout: float,
    ) -> str:
        logger.warning("Research MWS call start: model=%s timeout=%s", model, timeout)
        if isinstance(mws, MWSClient):
            loop = asyncio.get_running_loop()
            result = await asyncio.wait_for(
                loop.run_in_executor(
                    self._llm_executor,
                    _mws_chat_simple_sync,
                    self._settings.MWS_BASE_URL,
                    self._settings.MWS_API_KEY,
                    model,
                    system,
                    user,
                ),
                timeout=timeout,
            )
            logger.warning("Research MWS call done: model=%s", model)
            return result

        result = await asyncio.wait_for(
            mws.chat_simple(
                model=model,
                system=system,
                user=user,
            ),
            timeout=timeout,
        )
        logger.warning("Research MWS call done: model=%s", model)
        return result

    def _parse_json_object(self, raw: str) -> dict:
        match = re.search(r"\{[\s\S]*\}", raw or "")
        candidate = match.group(0) if match else raw
        parsed = json.loads(candidate)
        if not isinstance(parsed, dict):
            raise ValueError("Expected JSON object")
        return parsed

    def _parse_json_array(self, raw: str) -> list:
        match = re.search(r"\[[\s\S]*\]", raw or "")
        candidate = match.group(0) if match else raw
        parsed = json.loads(candidate)
        if not isinstance(parsed, list):
            raise ValueError("Expected JSON array")
        return parsed


@lru_cache
def get_research_service() -> ResearchService:
    return ResearchService(get_settings())
