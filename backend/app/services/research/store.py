from __future__ import annotations

import asyncio
from collections import defaultdict

from app.services.research.contracts import ResearchEvent, ResearchSession


class InMemoryResearchSessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, ResearchSession] = {}
        self._events: dict[str, list[ResearchEvent]] = defaultdict(list)
        self._listeners: dict[str, set[asyncio.Queue[ResearchEvent]]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def create_session(self, session: ResearchSession) -> None:
        async with self._lock:
            self._sessions[session.session_id] = session.model_copy(deep=True)
            self._events.setdefault(session.session_id, [])

    async def save_session(self, session: ResearchSession) -> None:
        async with self._lock:
            self._sessions[session.session_id] = session.model_copy(deep=True)

    async def get_session(self, session_id: str) -> ResearchSession | None:
        async with self._lock:
            session = self._sessions.get(session_id)
            return session.model_copy(deep=True) if session else None

    async def append_event(self, session_id: str, event: ResearchEvent) -> None:
        async with self._lock:
            if session_id not in self._sessions:
                raise KeyError(session_id)
            self._events[session_id].append(event.model_copy(deep=True))
            listeners = list(self._listeners.get(session_id, set()))

        for queue in listeners:
            await queue.put(event.model_copy(deep=True))

    async def subscribe(
        self,
        session_id: str,
    ) -> tuple[asyncio.Queue[ResearchEvent], list[ResearchEvent], bool]:
        queue: asyncio.Queue[ResearchEvent] = asyncio.Queue()
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                raise KeyError(session_id)
            self._listeners[session_id].add(queue)
            history = [event.model_copy(deep=True) for event in self._events.get(session_id, [])]
            is_terminal = session.status in {"completed", "failed", "cancelled"}
        return queue, history, is_terminal

    async def unsubscribe(self, session_id: str, queue: asyncio.Queue[ResearchEvent]) -> None:
        async with self._lock:
            listeners = self._listeners.get(session_id)
            if not listeners:
                return
            listeners.discard(queue)
            if not listeners:
                self._listeners.pop(session_id, None)
