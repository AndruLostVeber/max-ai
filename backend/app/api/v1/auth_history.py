from __future__ import annotations

"""
Auth, chat history, and long-term memory endpoints.
"""

import json
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db.database import SessionLocal
from app.db.models import Conversation, Message, User, UserMemory
from app.services.message_payloads import decode_stored_message_payload
from app.services.mws_client import MWSClient, get_mws_client

_log = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"
MIN_PASSWORD_LENGTH = 6


@dataclass(slots=True)
class AuthenticatedUser:
    id: str
    email: str | None = None


def _hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _validate_email(email: str) -> str:
    normalized = _normalize_email(email)
    if not normalized or "@" not in normalized:
        raise HTTPException(status_code=400, detail="Invalid email")
    return normalized


def _validate_password(password: str) -> str:
    if len(password or "") < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters long",
        )
    return password


def _create_token(user_id: str, email: str, settings: Settings) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": user_id, "email": email, "exp": expire},
        settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )


def _decode_token(token: str, settings: Settings) -> AuthenticatedUser:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_id = str(payload.get("sub") or "").strip()
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email = payload.get("email")
    return AuthenticatedUser(id=user_id, email=str(email) if email else None)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _decode_token(credentials.credentials, settings)


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser | None:
    if not credentials:
        return None
    if credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _decode_token(credentials.credentials, settings)


def _require_user_access(user_id: str, current_user: AuthenticatedUser) -> None:
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")


def _memory_to_dict(memory: UserMemory | dict) -> dict:
    if isinstance(memory, dict):
        updated_at = memory.get("updated_at")
        if isinstance(updated_at, datetime):
            updated_at = updated_at.isoformat()
        return {
            "key": memory.get("key"),
            "value": memory.get("value"),
            "category": memory.get("category", "general"),
            "score": memory.get("score", 1.0),
            "updated_at": updated_at,
        }
    return {
        "key": memory.key,
        "value": memory.value,
        "category": memory.category,
        "score": memory.score,
        "updated_at": memory.updated_at.isoformat() if memory.updated_at else None,
    }


def _parse_memory_facts(raw: str) -> list[dict]:
    match = re.search(r"\[.*?\]", raw or "", re.DOTALL)
    if not match:
        return []
    try:
        facts = json.loads(match.group())
    except json.JSONDecodeError:
        return []
    return facts if isinstance(facts, list) else []


def _normalize_memory_fact(fact: dict) -> dict | None:
    if not isinstance(fact, dict):
        return None
    key = str(fact.get("key", "")).strip()
    value = str(fact.get("value", "")).strip()
    category = str(fact.get("category", "general")).strip() or "general"
    if not key or not value:
        return None
    return {"key": key, "value": value, "category": category}


def _build_memory_extraction_prompt(user_message: str | None, assistant_message: str) -> str:
    parts: list[str] = []
    if user_message:
        parts.append(f"User message:\n{user_message[:1200]}")
    if assistant_message:
        parts.append(f"Assistant message:\n{assistant_message[:1800]}")
    return "\n\n".join(parts).strip()


async def _upsert_memory_fact(
    session: AsyncSession,
    user_id: str,
    key: str,
    value: str,
    category: str,
    score: float = 1.0,
) -> dict:
    now = datetime.utcnow()
    existing = await session.scalar(
        select(UserMemory).where(
            UserMemory.user_id == user_id,
            UserMemory.key == key,
        )
    )
    if existing:
        await session.execute(
            update(UserMemory)
            .where(UserMemory.user_id == user_id, UserMemory.key == key)
            .values(value=value, category=category, updated_at=now)
        )
    else:
        session.add(UserMemory(
            id=str(uuid.uuid4()),
            user_id=user_id,
            key=key,
            value=value,
            category=category,
            score=score,
            updated_at=now,
        ))
    return _memory_to_dict({
        "key": key,
        "value": value,
        "category": category,
        "score": score,
        "updated_at": now,
    })


async def _extract_and_save(
    user_id: str,
    user_message: str | None,
    assistant_message: str,
    mws: MWSClient,
) -> list[dict]:
    prompt = _build_memory_extraction_prompt(user_message, assistant_message)
    if len(prompt) < 30:
        return []

    system = (
        "You extract stable user facts from a dialog turn. "
        "Return ONLY a JSON array of objects with keys "
        '["key", "value", "category"] or []. '
        "Valid categories: preferences, projects, facts, links. "
        "Ignore one-off requests, vague phrases, guesses, and facts not about the user."
    )

    try:
        raw = await mws.chat_simple(
            model="llama-3.1-8b-instruct",
            system=system,
            user=prompt,
        )
        facts = _parse_memory_facts(raw)
        if not facts:
            return []

        persisted: list[dict] = []
        async with SessionLocal() as session:
            for fact in facts:
                normalized = _normalize_memory_fact(fact)
                if not normalized:
                    continue
                persisted.append(
                    await _upsert_memory_fact(
                        session=session,
                        user_id=user_id,
                        key=normalized["key"],
                        value=normalized["value"],
                        category=normalized["category"],
                    )
                )
            await session.commit()
        return persisted
    except Exception as exc:
        _log.debug("Memory extraction skipped: %s", exc)
        return []


async def _get_user_record(session: AsyncSession, user_id: str) -> User:
    user = await session.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def _get_owned_conversation(
    session: AsyncSession,
    user_id: str,
    conv_id: str,
) -> Conversation:
    conversation = await session.scalar(
        select(Conversation).where(
            Conversation.id == conv_id,
            Conversation.user_id == user_id,
        )
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


class AuthRequest(BaseModel):
    email: str
    password: str


class MessageSaveRequest(BaseModel):
    role: str
    content: str
    model_used: str | None = None


class ChangePasswordRequest(BaseModel):
    user_id: str | None = None
    current_password: str
    new_password: str


class RenameConversationRequest(BaseModel):
    title: str


class MemoryUpsertRequest(BaseModel):
    key: str
    value: str
    category: str = "general"


class MemoryExtractRequest(BaseModel):
    user_id: str | None = None
    conv_id: str | None = None
    user_message: str | None = None
    assistant_message: str


@router.post("/auth/register")
async def register(
    body: AuthRequest,
    settings: Settings = Depends(get_settings),
):
    email = _validate_email(body.email)
    password = _validate_password(body.password)

    async with SessionLocal() as session:
        existing = await session.scalar(select(User).where(User.email == email))
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")

        user = User(
            id=str(uuid.uuid4()),
            email=email,
            password_hash=_hash_password(password),
        )
        session.add(user)
        await session.commit()

        token = _create_token(user.id, user.email, settings)
        return {"user_id": user.id, "email": user.email, "token": token}


@router.post("/auth/login")
async def login(
    body: AuthRequest,
    settings: Settings = Depends(get_settings),
):
    email = _validate_email(body.email)

    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == email))
        if not user or not _verify_password(body.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        token = _create_token(user.id, user.email, settings)
        return {"user_id": user.id, "email": user.email, "token": token}


@router.put("/auth/password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    if body.user_id and body.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    _validate_password(body.new_password)

    async with SessionLocal() as session:
        user = await _get_user_record(session, current_user.id)
        if not _verify_password(body.current_password, user.password_hash):
            raise HTTPException(status_code=401, detail="Current password is incorrect")

        await session.execute(
            update(User)
            .where(User.id == current_user.id)
            .values(password_hash=_hash_password(body.new_password))
        )
        await session.commit()
    return {"status": "ok"}


@router.get("/auth/me")
async def get_me(current_user: AuthenticatedUser = Depends(get_current_user)):
    async with SessionLocal() as session:
        user = await _get_user_record(session, current_user.id)
        return {
            "status": "ok",
            "user_id": user.id,
            "email": user.email,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }


@router.get("/history/{user_id}")
async def list_conversations(
    user_id: str,
    limit: int = 50,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    _require_user_access(user_id, current_user)

    async with SessionLocal() as session:
        rows = await session.scalars(
            select(Conversation)
            .where(Conversation.user_id == current_user.id)
            .order_by(Conversation.updated_at.desc())
            .limit(limit)
        )
        conversations = rows.all()
        return {
            "conversations": [
                {
                    "id": conversation.id,
                    "title": conversation.title,
                    "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
                    "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
                }
                for conversation in conversations
            ]
        }


@router.get("/history/{user_id}/{conv_id}")
async def get_conversation(
    user_id: str,
    conv_id: str,
    limit: int = 200,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    _require_user_access(user_id, current_user)

    async with SessionLocal() as session:
        await _get_owned_conversation(session, current_user.id, conv_id)
        rows = await session.scalars(
            select(Message)
            .where(Message.conv_id == conv_id)
            .order_by(Message.created_at.asc())
            .limit(limit)
        )
        return {
            "messages": [
                {
                    "id": message.id,
                    "role": message.role,
                    "content": decoded["content"],
                    "model_used": message.model_used,
                    "timestamp": message.created_at.isoformat() if message.created_at else None,
                    **{
                        key: value
                        for key, value in decoded.items()
                        if key != "content" and value not in (None, [], {})
                    },
                }
                for message in rows.all()
                for decoded in [decode_stored_message_payload(message.content)]
            ]
        }


@router.post("/history/{user_id}/{conv_id}", status_code=201)
async def save_message(
    user_id: str,
    conv_id: str,
    body: MessageSaveRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    _require_user_access(user_id, current_user)

    async with SessionLocal() as session:
        conversation = await session.scalar(
            select(Conversation).where(Conversation.id == conv_id)
        )
        now = datetime.utcnow()

        if not conversation:
            title = body.content[:60].strip() if body.role == "user" else "New chat"
            conversation = Conversation(
                id=conv_id,
                user_id=current_user.id,
                title=title or "New chat",
                created_at=now,
                updated_at=now,
            )
            session.add(conversation)
        elif conversation.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Conversation not found")
        else:
            await session.execute(
                update(Conversation)
                .where(
                    Conversation.id == conv_id,
                    Conversation.user_id == current_user.id,
                )
                .values(updated_at=now)
            )

        message = Message(
            id=str(uuid.uuid4()),
            conv_id=conv_id,
            role=body.role,
            content=body.content,
            model_used=body.model_used,
            created_at=now,
        )
        session.add(message)
        await session.commit()
        return {"id": message.id}


@router.patch("/history/{user_id}/{conv_id}")
async def rename_conversation(
    user_id: str,
    conv_id: str,
    body: RenameConversationRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    _require_user_access(user_id, current_user)

    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    async with SessionLocal() as session:
        await _get_owned_conversation(session, current_user.id, conv_id)
        await session.execute(
            update(Conversation)
            .where(
                Conversation.id == conv_id,
                Conversation.user_id == current_user.id,
            )
            .values(title=title[:120], updated_at=datetime.utcnow())
        )
        await session.commit()

    return {"status": "ok", "title": title[:120]}


@router.delete("/history/{user_id}/{conv_id}", status_code=204)
async def delete_conversation(
    user_id: str,
    conv_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    _require_user_access(user_id, current_user)

    async with SessionLocal() as session:
        await _get_owned_conversation(session, current_user.id, conv_id)
        await session.execute(delete(Message).where(Message.conv_id == conv_id))
        await session.execute(
            delete(Conversation).where(
                Conversation.id == conv_id,
                Conversation.user_id == current_user.id,
            )
        )
        await session.commit()


@router.post("/memory/extract")
async def extract_memory(
    body: MemoryExtractRequest,
    mws: MWSClient = Depends(get_mws_client),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    if body.user_id and body.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if body.conv_id:
        async with SessionLocal() as session:
            await _get_owned_conversation(session, current_user.id, body.conv_id)

    memories = await _extract_and_save(
        user_id=current_user.id,
        user_message=body.user_message,
        assistant_message=body.assistant_message,
        mws=mws,
    )
    return {"status": "ok", "memories": memories}


@router.get("/memory/{user_id}")
async def get_memory(
    user_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    _require_user_access(user_id, current_user)

    async with SessionLocal() as session:
        rows = await session.scalars(
            select(UserMemory)
            .where(UserMemory.user_id == current_user.id)
            .order_by(UserMemory.score.desc(), UserMemory.updated_at.desc())
        )
        memories = rows.all()
        return {"memories": [_memory_to_dict(memory) for memory in memories]}


@router.post("/memory/{user_id}", status_code=201)
async def upsert_memory(
    user_id: str,
    body: MemoryUpsertRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    _require_user_access(user_id, current_user)

    async with SessionLocal() as session:
        await _upsert_memory_fact(
            session=session,
            user_id=current_user.id,
            key=body.key,
            value=body.value,
            category=body.category,
        )
        await session.commit()
        return {"status": "ok"}


@router.delete("/memory/{user_id}/{key}", status_code=204)
async def delete_memory(
    user_id: str,
    key: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    _require_user_access(user_id, current_user)

    async with SessionLocal() as session:
        await session.execute(
            delete(UserMemory).where(
                UserMemory.user_id == current_user.id,
                UserMemory.key == key,
            )
        )
        await session.commit()
