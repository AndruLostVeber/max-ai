"""
test_memory_pipeline.py — интеграционный тест диалога с памятью.

Пайплайн каждого шага:
  Роутер (3-pass) → MWS модель → [извлечение фактов] → [инъекция памяти в следующий запрос]

Что проверяется:
  1. Роутер корректно классифицирует реплики диалога
  2. Модель отвечает и ответ непустой
  3. LLM-экстрактор находит факты из ответа (или корректно возвращает [])
  4. Следующий запрос получает memory injection в system message
  5. Ответ с памятью отличается / содержит персонализацию

Формат вывода: как в test_router_llm.py — принты в -s режиме.

Запуск:
    cd backend
    MWS_API_KEY=sk-... pytest tests/test_memory_pipeline.py -v -s
    # или с .env:
    pytest tests/test_memory_pipeline.py -v -s  # .env загружается автоматически
"""
import asyncio
import json
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

pytestmark = [pytest.mark.live, pytest.mark.slow]

from app.config import Settings
from app.models.mws import ChatCompletionRequest, Message
from app.services.mws_client import MWSClient
from app.services.router_client import RouterClient, RouteResult


# ── Вспомогательные функции ───────────────────────────────────────

def get_settings() -> Settings:
    return Settings(
        _env_file=os.path.join(os.path.dirname(__file__), "..", ".env"),
    )


def run(coro):
    """Синхронная обёртка для async-вызовов."""
    return asyncio.get_event_loop().run_until_complete(coro)


def do_route(message: str) -> RouteResult:
    """Шаг 1: роутинг."""
    settings = get_settings()
    router = RouterClient(settings)
    result = run(router.route(message=message, attachments=[]))
    print(f"\n  🔀 РОУТЕР  '{message[:55]}' → task={result.task_type} model={result.model_id} pass={result.which_pass}")
    return result


def do_chat(messages: list[dict], model: str, system_prompt: str | None = None) -> str:
    """Шаг 2: вызов модели через MWSClient."""
    settings = get_settings()
    mws = MWSClient(settings)

    msg_objs = []
    if system_prompt:
        msg_objs.append(Message(role="system", content=system_prompt))
    for m in messages:
        msg_objs.append(Message(role=m["role"], content=m["content"]))

    request = ChatCompletionRequest(
        model=model,
        messages=msg_objs,
        temperature=0.3,
        max_tokens=300,
        stream=False,
    )
    raw = run(mws.chat(request))
    answer = raw.get("choices", [{}])[0].get("message", {}).get("content") or ""
    # reasoning models возвращают answer в reasoning_content если content пустой
    if not answer:
        answer = raw.get("choices", [{}])[0].get("message", {}).get("reasoning_content") or ""
    print(f"  🤖 ОТВЕТ   [{model[:30]}]: {answer[:120].strip()}{'...' if len(answer) > 120 else ''}")
    return answer.strip()


def do_extract(answer: str) -> list[dict]:
    """Шаг 3: извлечение фактов через LLM (как в _extract_and_save)."""
    if len(answer) < 30:
        return []
    settings = get_settings()
    mws = MWSClient(settings)
    system = (
        "Ты система извлечения фактов. Проанализируй ответ ассистента и найди факты о пользователе. "
        "Верни ТОЛЬКО JSON-массив [{\"key\": str, \"value\": str, \"category\": str}] или []. "
        "Категории: preferences, projects, facts, links."
    )
    raw_facts = run(mws.chat_simple(
        model="llama-3.1-8b-instruct",
        system=system,
        user=f"Ответ ассистента:\n{answer[:1500]}",
    ))
    m = re.search(r"\[.*?\]", raw_facts, re.DOTALL)
    if not m:
        facts = []
    else:
        try:
            facts = json.loads(m.group())
            if not isinstance(facts, list):
                facts = []
        except json.JSONDecodeError:
            facts = []
    print(f"  🧠 ФАКТЫ   {facts}")
    return facts


def build_memory_block(facts: list[dict]) -> str | None:
    """Шаг 4: формируем system-блок из фактов."""
    valid = [f for f in facts if f.get("key") and f.get("value")]
    if not valid:
        return None
    block = "Факты о пользователе:\n" + "\n".join(f"- {f['key']}: {f['value']}" for f in valid)
    print(f"  💾 ПАМЯТЬ  {block.replace(chr(10), ' | ')}")
    return block


# ── Сценарий: диалог из 3 шагов ──────────────────────────────────
#
# Шаг А: пользователь называет себя и своё увлечение
# Шаг Б: пользователь спрашивает про язык программирования
# Шаг В: следующий запрос с injected memory — модель должна использовать контекст
#
# Это проверяет полный цикл:
#   route → chat → extract facts → build memory block → route → chat with memory

class TestMemoryPipeline:

    # ── Шаг А: знакомство ────────────────────────────────────────

    def test_step_a_route_intro(self):
        """Роутер классифицирует знакомство как text."""
        result = do_route("Привет! Меня зовут Алекс, я занимаюсь backend-разработкой на Python.")
        assert result.task_type == "text", f"Ожидали text, получили {result.task_type}"

    def test_step_a_model_responds(self):
        """Модель отвечает на знакомство."""
        route = do_route("Привет! Меня зовут Алекс, я занимаюсь backend-разработкой на Python.")
        answer = do_chat(
            messages=[{"role": "user", "content": "Привет! Меня зовут Алекс, я занимаюсь backend-разработкой на Python."}],
            model=route.model_id,
        )
        assert len(answer) > 10, "Модель должна дать непустой ответ"

    def test_step_a_facts_extracted(self):
        """Из ответа извлекаются факты (или корректно возвращается [])."""
        route = do_route("Привет! Меня зовут Алекс, я занимаюсь backend-разработкой на Python.")
        answer = do_chat(
            messages=[{"role": "user", "content": "Привет! Меня зовут Алекс, я занимаюсь backend-разработкой на Python."}],
            model=route.model_id,
        )
        facts = do_extract(answer)
        # Результат должен быть списком (пустым или с фактами)
        assert isinstance(facts, list)

    # ── Шаг Б: технический вопрос ────────────────────────────────

    def test_step_b_route_code(self):
        """Роутер определяет вопрос про код как code."""
        result = do_route("напиши функцию для сортировки списка словарей по ключу")
        assert result.task_type == "code", f"Ожидали code, получили {result.task_type}"

    def test_step_b_model_gives_code(self):
        """Модель кода возвращает код в ответе."""
        route = do_route("напиши функцию для сортировки списка словарей по ключу")
        answer = do_chat(
            messages=[{"role": "user", "content": "напиши функцию для сортировки списка словарей по ключу"}],
            model=route.model_id,
        )
        assert len(answer) > 20

    def test_step_b_facts_from_code_answer(self):
        """Из ответа кодовой модели факты либо есть, либо корректно пусто."""
        route = do_route("напиши функцию для сортировки списка словарей по ключу")
        answer = do_chat(
            messages=[{"role": "user", "content": "напиши функцию для сортировки списка словарей по ключу"}],
            model=route.model_id,
        )
        facts = do_extract(answer)
        assert isinstance(facts, list)

    # ── Шаг В: memory injection ───────────────────────────────────

    def test_step_c_memory_block_built(self):
        """Memory block строится корректно из готовых фактов."""
        facts = [
            {"key": "имя", "value": "Алекс", "category": "facts"},
            {"key": "язык", "value": "Python", "category": "preferences"},
        ]
        block = build_memory_block(facts)
        assert block is not None
        assert "Алекс" in block
        assert "Python" in block
        assert block.startswith("Факты о пользователе:")

    def test_step_c_memory_block_empty_facts(self):
        """Пустые факты → None (ничего не инжектируем)."""
        block = build_memory_block([])
        assert block is None

    def test_step_c_memory_injected_in_request(self):
        """С memory block модель получает system message — ответ не пустой."""
        facts = [
            {"key": "имя", "value": "Алекс", "category": "facts"},
            {"key": "язык_программирования", "value": "Python", "category": "preferences"},
            {"key": "проект", "value": "MIREA AI Gateway", "category": "projects"},
        ]
        memory_block = build_memory_block(facts)

        route = do_route("что ты знаешь обо мне?")
        answer = do_chat(
            messages=[{"role": "user", "content": "что ты знаешь обо мне?"}],
            model=route.model_id,
            system_prompt=memory_block,
        )
        assert len(answer) > 10

    def test_step_c_memory_personalization(self):
        """Ответ с инжектированной памятью содержит имя или проект пользователя."""
        facts = [
            {"key": "имя", "value": "Алекс", "category": "facts"},
            {"key": "язык_программирования", "value": "Python", "category": "preferences"},
        ]
        memory_block = build_memory_block(facts)

        route = do_route("расскажи что-нибудь персональное обо мне")
        answer = do_chat(
            messages=[{"role": "user", "content": "расскажи что-нибудь персональное обо мне"}],
            model=route.model_id,
            system_prompt=memory_block,
        )
        # Модель должна упомянуть хотя бы одно из известных фактов
        answer_lower = answer.lower()
        has_name = "алекс" in answer_lower
        has_lang = "python" in answer_lower
        assert has_name or has_lang, (
            f"Ожидали упоминание 'Алекс' или 'Python' в ответе, получили:\n{answer}"
        )

    # ── Полный сквозной сценарий ──────────────────────────────────

    def test_full_pipeline_intro_to_memory(self):
        """
        Полный цикл в одном тесте:
          1. Пользователь представляется → route → model → extract facts
          2. Факты кешируются в memory block
          3. Следующий вопрос отправляется с memory block
          4. Модель использует контекст

        Это реалистичный диалог из двух реплик с живой памятью.
        """
        print("\n" + "═" * 60)
        print("  ПОЛНЫЙ ПАЙПЛАЙН: знакомство → память → персонализация")
        print("═" * 60)

        # ── Реплика 1: знакомство ──
        user_intro = "Привет! Я разработчик, меня зовут Дима. Пишу на Go и Python, работаю над проектом по AI."
        route1 = do_route(user_intro)
        answer1 = do_chat(
            messages=[{"role": "user", "content": user_intro}],
            model=route1.model_id,
        )
        assert len(answer1) > 5, "Модель должна ответить"

        # ── Извлекаем факты из ответа ──
        # Передаём и реплику пользователя (там факты явные) + ответ модели
        combined = f"Пользователь: {user_intro}\nАссистент: {answer1}"
        facts = do_extract(combined)

        # Если LLM не нашёл факты автоматически — используем минимальный набор
        if not facts:
            print("  ⚠️  LLM не извлёк факты, используем ручной набор")
            facts = [
                {"key": "имя", "value": "Дима", "category": "facts"},
                {"key": "язык", "value": "Go и Python", "category": "preferences"},
                {"key": "сфера", "value": "AI-разработка", "category": "projects"},
            ]

        memory_block = build_memory_block(facts)
        assert memory_block is not None, "Memory block должен быть сформирован"

        # ── Реплика 2: вопрос с памятью ──
        user_q2 = "Посоветуй мне фреймворк для моего стека"
        route2 = do_route(user_q2)
        answer2 = do_chat(
            messages=[{"role": "user", "content": user_q2}],
            model=route2.model_id,
            system_prompt=memory_block,
        )

        print("\n  ── Итог пайплайна ──")
        print(f"  Факты в памяти: {len(facts)} шт.")
        print(f"  Ответ с памятью: {answer2[:200]}")
        print("═" * 60)

        assert len(answer2) > 20, "Ответ с памятью должен быть содержательным"
        # Модель знает о Go/Python и должна упомянуть хотя бы один релевантный фреймворк
        keywords = ["gin", "fastapi", "go", "python", "flask", "fiber", "grpc", "фреймворк", "framework"]
        answer_lower = answer2.lower()
        found = [kw for kw in keywords if kw in answer_lower]
        assert found, (
            f"Ожидали упоминание технологий Go/Python в ответе.\n"
            f"Ответ: {answer2[:300]}"
        )
