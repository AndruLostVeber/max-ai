from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.v1.auth_history import AuthenticatedUser, get_current_user_optional
from app.db.database import SessionLocal
from app.db.models import Conversation, Message, UserMemory
from app.services.message_payloads import build_context_content_from_stored_message
from app.services.mws_client import MWSClient, get_mws_client
from app.services.research.contracts import ResearchContextMessage, ResearchCreateRequest, ResearchSession
from app.services.research.market_data import MarketDataService
from app.services.research.service import ResearchService, get_research_service
from app.services.web_parser import WebParserService
from app.services.web_search import WebSearchService
from app.utils.streaming import sse_event

router = APIRouter()


def get_web_search_service() -> WebSearchService:
    return WebSearchService()


def get_web_parser_service() -> WebParserService:
    return WebParserService()


def get_market_data_service() -> MarketDataService:
    return MarketDataService()


def _memory_updated_ts(memory: UserMemory) -> float:
    return memory.updated_at.timestamp() if memory.updated_at else 0.0


def _select_memories(memories: list[UserMemory], limit: int = 8) -> list[UserMemory]:
    if not memories:
        return []

    recent = sorted(
        memories,
        key=lambda memory: (float(memory.score or 0.0), _memory_updated_ts(memory)),
        reverse=True,
    )

    selected: list[UserMemory] = []
    seen: set[str] = set()
    for memory in recent:
        key = memory.key or ""
        if key in seen:
            continue
        selected.append(memory)
        seen.add(key)
        if len(selected) >= limit:
            break
    return selected


def _build_memory_block(memories: list[UserMemory], limit: int = 8) -> str | None:
    selected = _select_memories(memories, limit=limit)
    if not selected:
        return None

    lines = [
        "User memory context. Use it only when it helps the current research.",
        "Do not echo this memory block back to the user.",
    ]
    lines.extend(
        f"- [{memory.category or 'general'}] {memory.key}: {memory.value}"
        for memory in selected
    )
    return "\n".join(lines)


async def _load_memory_block(user_id: str) -> str | None:
    if not user_id or user_id == "anonymous":
        return None
    try:
        async with SessionLocal() as session:
            rows = await session.scalars(
                select(UserMemory)
                .where(UserMemory.user_id == user_id)
                .order_by(UserMemory.score.desc(), UserMemory.updated_at.desc())
            )
            memories = rows.all()
        return _build_memory_block(memories)
    except Exception:
        return None


def _normalize_context_messages(
    messages: list[ResearchContextMessage] | list[dict] | None,
    *,
    limit: int = 6,
) -> list[ResearchContextMessage]:
    normalized: list[ResearchContextMessage] = []
    if not isinstance(messages, list):
        return normalized

    for item in messages:
        try:
            message = item if isinstance(item, ResearchContextMessage) else ResearchContextMessage.model_validate(item)
        except Exception:
            continue
        content = str(message.content or "").strip()
        if not content or message.role not in {"user", "assistant"}:
            continue
        normalized.append(message.model_copy(update={"content": content[:1200]}))
    return normalized[-limit:]


async def _load_recent_conversation_context(
    user_id: str,
    conversation_id: str | None,
    *,
    limit: int = 6,
) -> list[ResearchContextMessage]:
    conv_id = str(conversation_id or "").strip()
    if not conv_id or not user_id or user_id == "anonymous":
        return []

    try:
        async with SessionLocal() as session:
            conversation = await session.scalar(
                select(Conversation).where(
                    Conversation.id == conv_id,
                    Conversation.user_id == user_id,
                )
            )
            if conversation is None:
                return []

            rows = await session.scalars(
                select(Message)
                .where(Message.conv_id == conv_id)
                .order_by(Message.created_at.desc())
                .limit(limit)
            )
            messages = list(reversed(rows.all()))
    except Exception:
        return []

    return _normalize_context_messages(
        [
            {
                "role": role,
                "content": build_context_content_from_stored_message(
                    str(message.content or ""),
                    role=role,
                ),
            }
            for message in messages
            for role in [str(message.role or "").strip()]
            if role in {"user", "assistant"}
        ],
        limit=limit,
    )


def _merge_conversation_context(
    primary: list[ResearchContextMessage] | list[dict] | None,
    secondary: list[ResearchContextMessage] | list[dict] | None,
    *,
    limit: int = 6,
) -> list[ResearchContextMessage]:
    combined = [
        *_normalize_context_messages(secondary, limit=limit * 2),
        *_normalize_context_messages(primary, limit=limit * 2),
    ]
    merged: list[ResearchContextMessage] = []
    seen: set[tuple[str, str]] = set()
    for item in combined:
        key = (item.role, item.content.casefold())
        if key in seen:
            continue
        seen.add(key)
        merged.append(item)
    return merged[-limit:]


def _combine_context_blocks(*blocks: str | None) -> str | None:
    parts: list[str] = []
    seen: set[str] = set()
    for raw in blocks:
        text = str(raw or "").strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        parts.append(text)
    return "\n\n".join(parts) if parts else None


def _resolve_requested_user_id(
    requested_user_id: str,
    current_user: AuthenticatedUser | None,
) -> str:
    normalized = str(requested_user_id or "").strip() or "anonymous"
    if normalized == "anonymous":
        return normalized
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if normalized != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return current_user.id


def _ensure_session_access(
    session: ResearchSession,
    current_user: AuthenticatedUser | None,
) -> None:
    owner = str(session.request.user_id or "anonymous").strip() or "anonymous"
    if owner == "anonymous":
        return
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if owner != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")


async def _load_session_or_404(
    session_id: str,
    service: ResearchService,
) -> ResearchSession:
    session = await service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Research session not found")
    return session


@router.post("/research/sessions", status_code=status.HTTP_202_ACCEPTED)
async def create_research_session(
    body: ResearchCreateRequest,
    service: ResearchService = Depends(get_research_service),
    mws: MWSClient = Depends(get_mws_client),
    search_svc: WebSearchService = Depends(get_web_search_service),
    parser_svc: WebParserService = Depends(get_web_parser_service),
    market_data_svc: MarketDataService = Depends(get_market_data_service),
    current_user: AuthenticatedUser | None = Depends(get_current_user_optional),
):
    user_id = _resolve_requested_user_id(body.user_id, current_user)
    server_memory_context = await _load_memory_block(user_id)
    server_conversation_context = await _load_recent_conversation_context(
        user_id,
        body.conversation_id,
    )
    return await service.create_session(
        body.model_copy(
            update={
                "user_id": user_id,
                "conversation_context": _merge_conversation_context(
                    body.conversation_context,
                    server_conversation_context,
                ),
                "memory_context": _combine_context_blocks(
                    body.memory_context,
                    server_memory_context,
                ),
            }
        ),
        mws=mws,
        search_svc=search_svc,
        parser_svc=parser_svc,
        market_data_svc=market_data_svc,
    )


@router.get("/research/sessions/{session_id}")
async def get_research_session(
    session_id: str,
    service: ResearchService = Depends(get_research_service),
    current_user: AuthenticatedUser | None = Depends(get_current_user_optional),
):
    session = await _load_session_or_404(session_id, service)
    _ensure_session_access(session, current_user)
    return session


@router.get("/research/sessions/{session_id}/stream")
async def stream_research_session(
    session_id: str,
    service: ResearchService = Depends(get_research_service),
    current_user: AuthenticatedUser | None = Depends(get_current_user_optional),
):
    session = await _load_session_or_404(session_id, service)
    _ensure_session_access(session, current_user)

    async def event_stream():
        async for event in service.stream_session(session_id):
            yield sse_event(event.type, event.model_dump(mode="json"))

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/research/sessions/{session_id}/cancel")
async def cancel_research_session(
    session_id: str,
    service: ResearchService = Depends(get_research_service),
    current_user: AuthenticatedUser | None = Depends(get_current_user_optional),
):
    session = await _load_session_or_404(session_id, service)
    _ensure_session_access(session, current_user)
    return await service.cancel_session(session_id)
