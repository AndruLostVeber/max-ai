from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.api.v1 import auth_history, proxy, tools  # noqa: E402
from app.api.v1.auth_history import _create_token, _hash_password, _verify_password  # noqa: E402
from app.config import Settings, get_settings  # noqa: E402
from app.models.mws import ChatCompletionRequest, Message  # noqa: E402
from app.services.message_payloads import STORED_MESSAGE_PREFIX  # noqa: E402
from app.services.mws_client import get_mws_client  # noqa: E402
from app.services.router_client import RouteResult, get_router_client  # noqa: E402


TEST_SETTINGS = Settings(
    MWS_API_KEY="test",
    MWS_BASE_URL="http://localhost",
    SECRET_KEY="test-secret-key-32-chars-long!!!",
)


def make_token(user_id: str, email: str = "user@example.com") -> str:
    return _create_token(user_id, email, TEST_SETTINGS)


def auth_header(user_id: str = "user-1") -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(user_id)}"}


def make_session_ctx(session):
    mock_sl = MagicMock()
    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=session)
    ctx.__aexit__ = AsyncMock(return_value=False)
    mock_sl.return_value = ctx
    return mock_sl


def build_auth_client() -> TestClient:
    app = FastAPI()
    app.include_router(auth_history.router, prefix="/v1")
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    return TestClient(app)


def build_proxy_client(router_client, mws_client) -> TestClient:
    app = FastAPI()
    app.include_router(proxy.router, prefix="/v1")
    app.dependency_overrides[get_router_client] = lambda: router_client
    app.dependency_overrides[get_mws_client] = lambda: mws_client
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    return TestClient(app)


def build_tools_client() -> TestClient:
    app = FastAPI()
    app.include_router(tools.router, prefix="/v1")
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    return TestClient(app)


class TestPasswordHelpers:
    def test_hash_is_not_plaintext(self):
        hashed = _hash_password("secret123")
        assert hashed != "secret123"
        assert len(hashed) > 20

    def test_verify_password(self):
        hashed = _hash_password("secret123")
        assert _verify_password("secret123", hashed) is True
        assert _verify_password("wrong", hashed) is False


class TestAuthEndpoints:
    def test_register_rejects_short_password(self):
        client = build_auth_client()
        response = client.post(
            "/v1/auth/register",
            json={"email": "user@example.com", "password": "123"},
        )
        assert response.status_code == 400
        assert "at least 6 characters" in response.json()["detail"]

    def test_auth_me_requires_token(self):
        client = build_auth_client()
        response = client.get("/v1/auth/me")
        assert response.status_code == 401

    def test_auth_me_returns_current_user(self):
        client = build_auth_client()
        session = AsyncMock()
        user = MagicMock()
        user.id = "user-1"
        user.email = "user@example.com"
        user.created_at = datetime(2026, 4, 14)
        session.scalar = AsyncMock(return_value=user)

        with patch("app.api.v1.auth_history.SessionLocal", make_session_ctx(session)):
            response = client.get("/v1/auth/me", headers=auth_header("user-1"))

        assert response.status_code == 200
        body = response.json()
        assert body["user_id"] == "user-1"
        assert body["email"] == "user@example.com"

    def test_change_password_forbids_body_user_id_mismatch(self):
        client = build_auth_client()
        response = client.put(
            "/v1/auth/password",
            headers=auth_header("user-1"),
            json={
                "user_id": "user-2",
                "current_password": "oldpass",
                "new_password": "newpass123",
            },
        )
        assert response.status_code == 403


class TestHistoryEndpoints:
    def test_list_history_forbids_other_user(self):
        client = build_auth_client()
        response = client.get("/v1/history/user-2", headers=auth_header("user-1"))
        assert response.status_code == 403

    def test_get_conversation_checks_ownership_before_returning_messages(self):
        client = build_auth_client()
        session = AsyncMock()
        session.scalar = AsyncMock(return_value=None)
        leaked_message = MagicMock()
        leaked_message.id = "msg-1"
        leaked_message.role = "user"
        leaked_message.content = "secret"
        leaked_message.model_used = None
        leaked_message.created_at = datetime(2026, 4, 14)
        result = MagicMock()
        result.all.return_value = [leaked_message]
        session.scalars = AsyncMock(return_value=result)

        with patch("app.api.v1.auth_history.SessionLocal", make_session_ctx(session)):
            response = client.get("/v1/history/user-1/conv-1", headers=auth_header("user-1"))

        assert response.status_code == 404
        session.scalars.assert_not_awaited()

    def test_rename_conversation_endpoint_exists(self):
        client = build_auth_client()
        session = AsyncMock()
        conversation = MagicMock()
        conversation.id = "conv-1"
        conversation.user_id = "user-1"
        session.scalar = AsyncMock(return_value=conversation)
        session.execute = AsyncMock()
        session.commit = AsyncMock()

        with patch("app.api.v1.auth_history.SessionLocal", make_session_ctx(session)):
            response = client.patch(
                "/v1/history/user-1/conv-1",
                headers=auth_header("user-1"),
                json={"title": "Renamed chat"},
            )

        assert response.status_code == 200
        assert response.json()["title"] == "Renamed chat"

    def test_get_conversation_decodes_stored_research_payload(self):
        client = build_auth_client()
        session = AsyncMock()
        conversation = MagicMock()
        conversation.id = "conv-1"
        conversation.user_id = "user-1"

        stored = {
            "content": "BTC led the quarter and ETH followed.",
            "research_query": "Compare BTC and ETH in Q1 2026",
            "research": {
                "findings": ["BTC outperformed ETH in Q1 2026."],
                "intent": {
                    "entities": ["BTC", "ETH"],
                    "time_range": {"label": "Q1 2026"},
                },
                "tables": [{"title": "Performance summary", "rows": [["BTC", "15%"]]}],
                "metrics": [{"entity": "BTC", "name": "percent_change", "value": "15.00", "unit": "%"}],
                "sources": [{"title": "Market report", "domain": "example.test", "url": "https://example.test/report"}],
            },
        }
        message = MagicMock()
        message.id = "msg-1"
        message.role = "assistant"
        message.content = f"{STORED_MESSAGE_PREFIX}\n{json.dumps(stored, ensure_ascii=False)}"
        message.model_used = "research-v2"
        message.created_at = datetime(2026, 4, 14)

        result = MagicMock()
        result.all.return_value = [message]
        session.scalar = AsyncMock(return_value=conversation)
        session.scalars = AsyncMock(return_value=result)

        with patch("app.api.v1.auth_history.SessionLocal", make_session_ctx(session)):
            response = client.get("/v1/history/user-1/conv-1", headers=auth_header("user-1"))

        assert response.status_code == 200
        payload = response.json()["messages"][0]
        assert payload["content"] == "BTC led the quarter and ETH followed."
        assert payload["research_query"] == "Compare BTC and ETH in Q1 2026"
        assert payload["research"]["findings"] == ["BTC outperformed ETH in Q1 2026."]
        assert payload["model_used"] == "research-v2"

    def test_delete_conversation_removes_messages_and_conversation(self):
        client = build_auth_client()
        session = AsyncMock()
        conversation = MagicMock()
        conversation.id = "conv-1"
        conversation.user_id = "user-1"
        session.scalar = AsyncMock(return_value=conversation)
        session.execute = AsyncMock()
        session.commit = AsyncMock()

        with patch("app.api.v1.auth_history.SessionLocal", make_session_ctx(session)):
            response = client.delete(
                "/v1/history/user-1/conv-1",
                headers=auth_header("user-1"),
            )

        assert response.status_code == 204
        assert session.execute.await_count == 2


class TestMemoryEndpoints:
    def test_extract_memory_requires_matching_user(self):
        client = build_auth_client()
        response = client.post(
            "/v1/memory/extract",
            headers=auth_header("user-1"),
            json={
                "user_id": "user-2",
                "assistant_message": "hello",
            },
        )
        assert response.status_code == 403

    def test_get_memory_requires_token(self):
        client = build_auth_client()
        response = client.get("/v1/memory/user-1")
        assert response.status_code == 401


class TestProxyAttachments:
    def test_build_mws_request_strips_internal_fields(self):
        request = ChatCompletionRequest(
            model="auto",
            messages=[Message(role="user", content="hello")],
            system_prompt="memory context",
            conversation_id="conv-1",
            use_memory=True,
            attachments=[{"name": "doc.pdf", "mime": "application/pdf"}],
        )

        built = proxy._build_mws_request(request, memory_block="server memory")

        assert built.messages[0].role == "system"
        assert "server memory" in built.messages[0].content
        assert built.system_prompt is None
        assert built.conversation_id is None
        assert built.use_memory is None
        assert built.attachments is None

    def test_chat_completions_routes_with_request_attachments(self):
        router_client = MagicMock()
        router_client.route = AsyncMock(
            return_value=RouteResult("file_qa", "qwen2.5-72b-instruct", 1.0, 1)
        )
        mws_client = MagicMock()
        mws_client.chat = AsyncMock(
            return_value={
                "id": "chatcmpl-1",
                "object": "chat.completion",
                "model": "qwen2.5-72b-instruct",
                "choices": [{"index": 0, "message": {"role": "assistant", "content": "ok"}}],
            }
        )

        client = build_proxy_client(router_client, mws_client)

        with patch("app.api.v1.proxy._log_route", new=AsyncMock()):
            response = client.post(
                "/v1/chat/completions",
                json={
                    "model": "auto",
                    "messages": [{"role": "user", "content": "check the file"}],
                    "stream": False,
                    "use_memory": False,
                    "attachments": [{"name": "report.pdf", "mime": "application/pdf"}],
                },
            )

        assert response.status_code == 200
        router_client.route.assert_awaited_once_with(
            message="check the file",
            attachments=[{"name": "report.pdf", "mime": "application/pdf"}],
        )

    def test_chat_completions_requires_token_for_user_scoped_requests(self):
        router_client = MagicMock()
        router_client.route = AsyncMock()
        mws_client = MagicMock()
        client = build_proxy_client(router_client, mws_client)

        response = client.post(
            "/v1/chat/completions",
            json={
                "model": "auto",
                "messages": [{"role": "user", "content": "hello"}],
                "user": "user-1",
                "use_memory": True,
            },
        )

        assert response.status_code == 401
        router_client.route.assert_not_called()


class TestToolsRoutes:
    def test_web_search_route_exists_and_requires_auth(self):
        client = build_tools_client()
        response = client.post("/v1/tools/web-search", json={"query": "python"})
        assert response.status_code == 401

    def test_web_search_route_returns_results(self):
        client = build_tools_client()

        with patch(
            "app.api.v1.tools.WebSearchService.search",
            new=AsyncMock(return_value=[{"title": "Result", "url": "https://example.com", "snippet": "body"}]),
        ):
            response = client.post(
                "/v1/tools/web-search",
                headers=auth_header("user-1"),
                json={"query": "python", "max_results": 3},
            )

        assert response.status_code == 200
        assert response.json()["results"][0]["url"] == "https://example.com"


class TestModels:
    def test_message_model_contains_conversation_fk_column(self):
        from app.db.models import Base

        conversation_column = Base.metadata.tables["messages"].columns["conversation_id"]
        assert conversation_column.foreign_keys
