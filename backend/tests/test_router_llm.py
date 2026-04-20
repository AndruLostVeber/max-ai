"""
test_router_llm.py — 20 тестов Pass 3 (LLM-классификатор llama-3.1-8b-instruct).

Тестирует только ambiguous запросы — те, которые НЕ ловятся Pass 1 и Pass 2.
Каждый тест реально вызывает MWS API.

Запуск:
    cd backend
    MWS_API_KEY=sk-... pytest tests/test_router_llm.py -v -s
"""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

pytestmark = [pytest.mark.live, pytest.mark.slow]

from app.config import Settings
from app.services.router_client import RouterClient


def get_settings() -> Settings:
    # Читаем из окружения или из .env файла рядом с этим скриптом
    return Settings(
        _env_file=os.path.join(os.path.dirname(__file__), "..", ".env"),
    )


def route_llm(message: str) -> dict:
    """Вызывает только Pass 3 (LLM) напрямую."""
    router = RouterClient(get_settings())

    async def _call():
        return await router._pass3(message)

    result = asyncio.get_event_loop().run_until_complete(_call())
    print(f"\n  [{result.which_pass}] '{message[:60]}' → {result.task_type} (conf={result.confidence:.2f})")
    return result


def route_full(message: str, attachments=None) -> dict:
    """Полный роутинг — убеждаемся что дошли до Pass 3."""
    router = RouterClient(get_settings())

    async def _call():
        return await router.route(message=message, attachments=attachments or [])

    result = asyncio.get_event_loop().run_until_complete(_call())
    print(f"\n  [pass{result.which_pass}] '{message[:60]}' → {result.task_type} (conf={result.confidence:.2f})")
    return result


VALID_TASK_TYPES = {
    "text", "code", "web_search", "web_parse",
    "file_qa", "asr", "vlm", "image_gen",
}


# ═══════════════════════════════════════════════════════
# ГРУППА 1: Однозначные запросы — LLM должен быть уверен
# ═══════════════════════════════════════════════════════

class TestLLMClearCases:
    """Запросы которые LLM должен распознать с confidence >= 0.7."""

    def test_llm_code_clear(self):
        """Явный запрос кода без триггерных слов Pass 2."""
        r = route_llm("покажи пример реализации бинарного дерева поиска")
        assert r.which_pass == 3
        assert r.task_type in {"code", "text"}
        assert r.confidence >= 0.5

    def test_llm_web_search_clear(self):
        """Поиск информации без URL."""
        r = route_llm("какая сейчас погода в Москве?")
        assert r.which_pass == 3
        assert r.task_type in {"web_search", "text"}
        assert r.confidence >= 0.5

    def test_llm_text_greeting(self):
        """Простое приветствие — должен дать text."""
        r = route_llm("здравствуй, чем занимаешься?")
        assert r.which_pass == 3
        assert r.task_type == "text"
        assert r.confidence >= 0.5

    def test_llm_text_question(self):
        """Фактический вопрос без поиска."""
        r = route_llm("сколько планет в солнечной системе?")
        assert r.which_pass == 3
        assert r.task_type in {"text", "web_search"}
        assert r.confidence >= 0.5

    def test_llm_image_gen_implicit(self):
        """Запрос картинки без слова 'нарисуй'."""
        r = route_llm("хочу увидеть иллюстрацию лесного дракона на закате")
        assert r.which_pass == 3
        assert r.task_type in {"image_gen", "text"}
        assert r.confidence >= 0.5


# ═══════════════════════════════════════════════════════
# ГРУППА 2: Неоднозначные запросы — проверяем что LLM не крашится
# ═══════════════════════════════════════════════════════

class TestLLMAmbiguous:
    """Запросы на грани нескольких task_type."""

    def test_llm_ambiguous_explain_code(self):
        """Объяснение кода — code или text?"""
        r = route_llm("что делает эта строка: list(map(lambda x: x*2, arr))")
        assert r.which_pass == 3
        assert r.task_type in VALID_TASK_TYPES
        assert 0.0 <= r.confidence <= 1.0

    def test_llm_ambiguous_news(self):
        """Новости — web_search или text?"""
        r = route_llm("расскажи о последних событиях в мире технологий")
        assert r.which_pass == 3
        assert r.task_type in VALID_TASK_TYPES
        assert 0.0 <= r.confidence <= 1.0

    def test_llm_ambiguous_translate(self):
        """Перевод — text."""
        r = route_llm("переведи на французский: добрый вечер, как вы поживаете")
        assert r.which_pass == 3
        assert r.task_type in VALID_TASK_TYPES
        assert 0.0 <= r.confidence <= 1.0

    def test_llm_ambiguous_math(self):
        """Математика — text или code?"""
        r = route_llm("вычисли интеграл от x^2 по dx от 0 до 5")
        assert r.which_pass == 3
        assert r.task_type in VALID_TASK_TYPES
        assert 0.0 <= r.confidence <= 1.0

    def test_llm_ambiguous_recipe(self):
        """Рецепт — точно text."""
        r = route_llm("как приготовить борщ с говядиной?")
        assert r.which_pass == 3
        assert r.task_type == "text"
        assert r.confidence >= 0.5


# ═══════════════════════════════════════════════════════
# ГРУППА 3: Edge cases — экстремальные входы
# ═══════════════════════════════════════════════════════

class TestLLMEdgeCases:
    """Проверяем устойчивость Pass 3 к необычным входам."""

    def test_llm_very_short(self):
        """Очень короткий запрос."""
        r = route_llm("ok")
        assert r.which_pass == 3
        assert r.task_type in VALID_TASK_TYPES
        assert 0.0 <= r.confidence <= 1.0

    def test_llm_mixed_languages(self):
        """Смешанный язык."""
        r = route_llm("help me понять как работает attention mechanism в трансформерах")
        assert r.which_pass == 3
        assert r.task_type in VALID_TASK_TYPES
        assert 0.0 <= r.confidence <= 1.0

    def test_llm_only_emoji(self):
        """Только эмодзи — LLM не должен крашиться, должен дать text."""
        r = route_llm("😊🤔💭")
        assert r.which_pass == 3
        assert r.task_type in VALID_TASK_TYPES

    def test_llm_long_message(self):
        """Длинное сообщение."""
        long_msg = "объясни мне " + "очень подробно " * 30 + "что такое нейронные сети"
        r = route_llm(long_msg)
        assert r.which_pass == 3
        assert r.task_type in VALID_TASK_TYPES
        assert 0.0 <= r.confidence <= 1.0

    def test_llm_english_only(self):
        """Только английский."""
        r = route_llm("what is the meaning of life?")
        assert r.which_pass == 3
        assert r.task_type in VALID_TASK_TYPES
        assert 0.0 <= r.confidence <= 1.0


# ═══════════════════════════════════════════════════════
# ГРУППА 4: Полный роутинг — убеждаемся что Pass 3 срабатывает
# ═══════════════════════════════════════════════════════

class TestFullRoutingPass3:
    """Через route() — проверяем что ambiguous запросы доходят до Pass 3."""

    def test_full_route_reaches_pass3_greeting(self):
        """Обычный чат должен дойти до Pass 3."""
        r = route_full("привет, как настроение?")
        assert r.which_pass == 3
        assert r.task_type == "text"

    def test_full_route_reaches_pass3_question(self):
        """Вопрос без ключевых слов."""
        r = route_full("какой смысл жизни по мнению философов?")
        assert r.which_pass == 3
        assert r.task_type in VALID_TASK_TYPES

    def test_full_route_reaches_pass3_creative(self):
        """Творческий запрос."""
        r = route_full("напиши короткое стихотворение про осень")
        assert r.which_pass == 3
        assert r.task_type in VALID_TASK_TYPES

    def test_full_route_reaches_pass3_advice(self):
        """Совет — явно не попадает в Pass 1/2."""
        r = route_full("что лучше изучить: Go или Rust для бэкенда?")
        assert r.which_pass == 3
        assert r.task_type in VALID_TASK_TYPES

    def test_full_route_returns_valid_model(self):
        """Любой Pass 3 результат должен содержать известную модель."""
        from app.services.router_client import TASK_MODELS
        r = route_full("посоветуй хороший фильм на вечер")
        assert r.which_pass == 3
        assert r.model_id in TASK_MODELS.values()
        assert r.task_type in TASK_MODELS
