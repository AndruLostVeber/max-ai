from __future__ import annotations

"""
OpenAI-compatible proxy -> MWS API.

Pipeline:
  1. Route (3-pass router)
  2. Load long-term memory and inject it as a system message
  3. Forward to MWS (stream or regular) without internal fields
  4. Log router decision to DB (fire and forget)
"""

import asyncio
import logging
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import select

from app.api.v1.auth_history import AuthenticatedUser, get_current_user_optional
from app.db.database import SessionLocal
from app.db.models import RouterLog, UserMemory
from app.models.mws import ChatCompletionRequest, CompletionRequest, EmbeddingRequest, Message
from app.services.mws_client import MWSClient, get_mws_client
from app.services.router_client import RouterClient, RouteResult, get_router_client

_log = logging.getLogger(__name__)

router = APIRouter()


def _last_user_text(request: ChatCompletionRequest) -> str:
    for message in reversed(request.messages):
        if message.role == "user":
            return message.content if isinstance(message.content, str) else ""
    return ""


async def _log_route(user_id: str, message: str, route: RouteResult, latency_ms: int) -> None:
    try:
        async with SessionLocal() as session:
            session.add(RouterLog(
                id=str(uuid.uuid4()),
                user_id=user_id,
                message_preview=message[:512],
                task_type=route.task_type,
                model_id=route.model_id,
                confidence=route.confidence,
                which_pass=route.which_pass,
                latency_ms=latency_ms,
            ))
            await session.commit()
    except Exception as e:
        _log.warning("Router log write failed: %s", e)


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
        "User memory context. Use it when it helps answer more accurately.",
        "Do not dump this list back to the user unless they ask for it directly.",
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
    except Exception as e:
        _log.warning("Memory load skipped for user %s: %s", user_id, e)
        return None


def _combine_system_prompt(memory_block: str | None, system_prompt: str | None) -> str | None:
    parts = [part.strip() for part in (memory_block, system_prompt) if part and part.strip()]
    if not parts:
        return None
    return "\n\n".join(parts)


def _build_mws_request(request: ChatCompletionRequest, memory_block: str | None = None) -> ChatCompletionRequest:
    """Strip internal fields and inject server-side memory before forwarding to MWS."""
    messages = list(request.messages)
    combined_system_prompt = _combine_system_prompt(memory_block, request.system_prompt)

    if combined_system_prompt:
        messages = [Message(role="system", content=combined_system_prompt)] + messages

    return request.model_copy(update={
        "messages": messages,
        "system_prompt": None,
        "conversation_id": None,
        "use_memory": None,
        "attachments": None,
    })


def _is_auto_model_request(request: ChatCompletionRequest) -> bool:
    return request.model in ("auto", "", None)


def _missing_bearer_token() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing bearer token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _resolve_user_id(
    request: ChatCompletionRequest,
    current_user: AuthenticatedUser | None,
) -> str:
    requested_user_id = str(getattr(request, "user", "") or "").strip() or "anonymous"

    if requested_user_id != "anonymous":
        if current_user is None:
            raise _missing_bearer_token()
        if requested_user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
        return current_user.id

    if request.use_memory and current_user is not None:
        return current_user.id

    return "anonymous"


@router.post("/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    mws: MWSClient = Depends(get_mws_client),
    router_client: RouterClient = Depends(get_router_client),
    current_user: AuthenticatedUser | None = Depends(get_current_user_optional),
):
    if current_user is not None and not isinstance(current_user, AuthenticatedUser):
        requested_user_id = str(getattr(request, "user", "") or "").strip()
        current_user = (
            AuthenticatedUser(id=requested_user_id, email=None)
            if requested_user_id and requested_user_id != "anonymous"
            else None
        )

    user_id = _resolve_user_id(request, current_user)
    t0 = time.monotonic()
    attachments = list(request.attachments or [])
    message_text = _last_user_text(request)
    route = await router_client.route(message=message_text, attachments=attachments)
    latency_ms = int((time.monotonic() - t0) * 1000)

    auto_model_requested = _is_auto_model_request(request)

    if auto_model_requested:
        request = request.model_copy(update={"model": route.model_id})

    asyncio.create_task(_log_route(user_id, message_text, route, latency_ms))

    memory_block = None
    if request.use_memory:
        memory_block = await _load_memory_block(user_id)

    mws_request = _build_mws_request(request, memory_block=memory_block)

    if mws_request.stream:
        return StreamingResponse(
            mws.stream_chat(mws_request),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    return JSONResponse(content=await mws.chat(mws_request))


@router.post("/completions")
async def completions(
    request: CompletionRequest,
    mws: MWSClient = Depends(get_mws_client),
):
    if request.stream:
        return StreamingResponse(
            mws.stream_completion(request),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache"},
        )
    return JSONResponse(content=await mws.completion(request))


@router.post("/embeddings")
async def embeddings(
    request: EmbeddingRequest,
    mws: MWSClient = Depends(get_mws_client),
):
    return JSONResponse(content=await mws.embed(request))


@router.get("/models")
async def list_models(mws: MWSClient = Depends(get_mws_client)):
    return await mws.list_models()
