"""
test_router.py — проверка трёхпроходного роутера.

Тестирует только Проход 1 и Проход 2 (детерминированные).
Проход 3 (LLM) не тестируется здесь — он требует живого API.

Запуск:
    cd backend
    pip install pytest pytest-asyncio
    pytest tests/test_router.py -v
"""
import sys
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.router_client import RouterClient, RouteResult, TASK_MODELS
from app.config import Settings


def make_router() -> RouterClient:
    settings = Settings(MWS_API_KEY="test", MWS_BASE_URL="http://localhost")
    return RouterClient(settings)


def route_sync(message: str = "", attachments: list[dict] | None = None) -> RouteResult:
    """Синхронная обёртка для детерминированных проходов (1 и 2)."""
    router = make_router()
    attachments = attachments or []
    result = router._pass1(attachments)
    if result:
        return result
    result = router._pass2(message)
    if result:
        return result
    # Возвращаем text как дефолт (pass 3 не вызываем без API)
    return RouteResult("text", TASK_MODELS["text"], 0.5, 3)


# ═══════════════════════════════════════════════════════
# ПРОХОД 1 — MIME / расширение (15 примеров)
# ═══════════════════════════════════════════════════════

class TestPass1Mime:

    def test_audio_mp3(self):
        r = route_sync(attachments=[{"name": "song.mp3", "mime": "audio/mpeg"}])
        assert r.task_type == "asr"
        assert r.which_pass == 1

    def test_audio_wav(self):
        r = route_sync(attachments=[{"name": "record.wav", "mime": "audio/wav"}])
        assert r.task_type == "asr"

    def test_audio_ogg(self):
        r = route_sync(attachments=[{"name": "voice.ogg", "mime": "audio/ogg"}])
        assert r.task_type == "asr"

    def test_audio_m4a(self):
        r = route_sync(attachments=[{"name": "clip.m4a", "mime": ""}])
        assert r.task_type == "asr"

    def test_audio_mime_only(self):
        r = route_sync(attachments=[{"name": "audiofile", "mime": "audio/flac"}])
        assert r.task_type == "asr"

    def test_image_jpg(self):
        r = route_sync(attachments=[{"name": "photo.jpg", "mime": "image/jpeg"}])
        assert r.task_type == "vlm"
        assert r.which_pass == 1

    def test_image_png(self):
        r = route_sync(attachments=[{"name": "screenshot.png", "mime": "image/png"}])
        assert r.task_type == "vlm"

    def test_image_webp(self):
        r = route_sync(attachments=[{"name": "pic.webp", "mime": ""}])
        assert r.task_type == "vlm"

    def test_image_gif(self):
        r = route_sync(attachments=[{"name": "anim.gif", "mime": "image/gif"}])
        assert r.task_type == "vlm"

    def test_image_mime_only(self):
        r = route_sync(attachments=[{"name": "img", "mime": "image/png"}])
        assert r.task_type == "vlm"

    def test_pdf(self):
        r = route_sync(attachments=[{"name": "report.pdf", "mime": "application/pdf"}])
        assert r.task_type == "file_qa"
        assert r.which_pass == 1

    def test_docx(self):
        r = route_sync(attachments=[{"name": "doc.docx", "mime": ""}])
        assert r.task_type == "file_qa"

    def test_txt(self):
        r = route_sync(attachments=[{"name": "notes.txt", "mime": "text/plain"}])
        assert r.task_type == "file_qa"

    def test_audio_overrides_message(self):
        r = route_sync(
            message="напиши функцию",
            attachments=[{"name": "voice.wav", "mime": "audio/wav"}],
        )
        assert r.task_type == "asr"

    def test_image_overrides_research(self):
        r = route_sync(
            message="изучи тему квантовых вычислений",
            attachments=[{"name": "chart.png", "mime": "image/png"}],
        )
        assert r.task_type == "vlm"


# ═══════════════════════════════════════════════════════
# ПРОХОД 2 — структурный анализ
# ═══════════════════════════════════════════════════════

class TestPass2Structural:

    def test_research_prompt_falls_back_to_text(self):
        r = route_sync("изучи тему квантовых вычислений подробно")
        assert r.task_type == "text"
        assert r.which_pass == 3

    def test_research_prompt_en_falls_back_to_text(self):
        r = route_sync("deep research on climate change effects on agriculture")
        assert r.task_type == "text"
        assert r.which_pass == 3

    # ── web_parse ───────────────────────────────────────

    def test_web_parse_otkroi(self):
        r = route_sync("открой https://habr.com/ru/articles/123 и перескажи")
        assert r.task_type == "web_parse"
        assert r.which_pass == 2

    def test_web_parse_prochitay(self):
        r = route_sync("прочитай https://example.com/article и сделай выжимку")
        assert r.task_type == "web_parse"

    def test_web_parse_proanaliziruimy_link(self):
        r = route_sync("проанализируй ссылку https://openai.com/blog/gpt4")
        assert r.task_type == "web_parse"

    def test_web_parse_summarize(self):
        r = route_sync("summarize https://arxiv.org/abs/2303.08774")
        assert r.task_type == "web_parse"

    # ── web_search ──────────────────────────────────────

    def test_web_search_naydi_url(self):
        r = route_sync("найди информацию на https://google.com про Python")
        assert r.task_type == "web_search"
        assert r.which_pass == 2

    def test_web_search_poischi(self):
        r = route_sync("поищи на https://stackoverflow.com ответ про asyncio")
        assert r.task_type == "web_search"

    def test_web_search_en(self):
        r = route_sync("search https://github.com for best Python frameworks")
        assert r.task_type == "web_search"

    # ── code ────────────────────────────────────────────

    def test_code_napishy_funkciyu(self):
        r = route_sync("напиши функцию для парсинга JSON в Python")
        assert r.task_type == "code"
        assert r.which_pass == 2

    def test_code_napishy_skript(self):
        r = route_sync("напиши скрипт для автоматической отправки писем")
        assert r.task_type == "code"

    def test_code_class_keyword(self):
        r = route_sync("как правильно написать class в Python с наследованием")
        assert r.task_type == "code"

    def test_code_def_keyword(self):
        r = route_sync("def calculate_distance что не так в этой функции")
        assert r.task_type == "code"

    def test_code_sql(self):
        r = route_sync("SELECT * FROM users WHERE age > 18 — как оптимизировать?")
        assert r.task_type == "code"

    def test_code_algoritm(self):
        r = route_sync("напиши алгоритм сортировки пузырьком")
        assert r.task_type == "code"

    # ── text (дефолт) ───────────────────────────────────

    def test_text_privet(self):
        r = route_sync("привет, как дела?")
        assert r.task_type == "text"

    def test_text_chto_takoe(self):
        r = route_sync("что такое фотосинтез?")
        assert r.task_type == "text"

    def test_text_perevedi(self):
        r = route_sync("переведи на английский: я очень рад тебя видеть")
        assert r.task_type == "text"

    def test_text_sovet(self):
        r = route_sync("посоветуй книгу по психологии")
        assert r.task_type == "text"

    def test_text_empty(self):
        r = route_sync("")
        assert r.task_type == "text"


# ═══════════════════════════════════════════════════════
# Проверка моделей в RouteResult
# ═══════════════════════════════════════════════════════

class TestRouteModels:

    def test_asr_model(self):
        r = route_sync(attachments=[{"name": "a.wav", "mime": "audio/wav"}])
        assert r.model_id == "whisper-turbo-local"

    def test_vlm_model(self):
        r = route_sync(attachments=[{"name": "img.png", "mime": "image/png"}])
        assert r.model_id == "meta/llama-3.2-90b-vision-instruct"

    def test_code_model(self):
        r = route_sync("напиши функцию на Go")
        assert r.model_id == "qwen/qwen3-coder-480b-a35b-instruct"

    def test_text_model(self):
        r = route_sync("расскажи про квантовую физику")
        assert r.model_id == "mistralai/mistral-small-4-119b-2603"

    def test_file_qa_model(self):
        r = route_sync(attachments=[{"name": "report.pdf", "mime": "application/pdf"}])
        assert r.model_id == "nvidia/nemoretriever-parse"
