"""
test_models.py — проверка всех моделей MWS API с подробным выводом.

Запуск:
    cd backend
    pytest tests/test_models.py -v -s
"""
import math
import os
import struct
import time

import httpx
import pytest
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

pytestmark = [pytest.mark.live, pytest.mark.slow]

BASE_URL = os.getenv("MWS_BASE_URL", "https://api.gpt.mws.ru")
API_KEY  = os.getenv("MWS_API_KEY", "")
HEADERS  = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
TIMEOUT  = 180.0

# ── Модели ────────────────────────────────────────────────────────

# Модели с reasoning: content=None пока идёт thinking, проверяем reasoning_content
REASONING_MODELS = {"qwen3-32b", "QwQ-32B", "deepseek-r1-distill-qwen-32b"}

CHAT_MODELS = [
    "mws-gpt-alpha",
    "qwen2.5-72b-instruct",
    "qwen3-32b",
    "Qwen3-235B-A22B-Instruct-2507-FP8",
    "QwQ-32B",
    "deepseek-r1-distill-qwen-32b",
    "llama-3.1-8b-instruct",
    "llama-3.3-70b-instruct",
    "gemma-3-27b-it",
    "glm-4.6-357b",
    "gpt-oss-20b",
    "gpt-oss-120b",
    "kimi-k2-instruct",
    pytest.param("T-pro-it-1.0", marks=pytest.mark.xfail(
        reason="недоступна для текущего API ключа (400)", strict=False
    )),
]

CODE_MODELS = [
    "qwen3-coder-480b-a35b",
]

VLM_MODELS = [
    "cotype-pro-vl-32b",
    "qwen2.5-vl",
    "qwen2.5-vl-72b",
    "qwen3-vl-30b-a3b-instruct",
]

IMAGE_GEN_MODELS = [
    "qwen-image",
    "qwen-image-lightning",
]

ASR_MODELS = [
    "whisper-turbo-local",
    "whisper-medium",
]

EMBEDDING_MODELS = [
    "bge-m3",
    "BAAI/bge-multilingual-gemma2",
    pytest.param("qwen3-embedding-8b", marks=pytest.mark.xfail(
        reason="таймаут — модель не отвечает на текущем ключе", strict=False
    )),
]

def _make_red_png(w: int = 64, h: int = 64) -> bytes:
    """Генерирует минимальный PNG w×h пикселей красного цвета."""
    import zlib

    def chunk(name: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(name + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + name + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    raw  = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))
    png  = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(raw))
    png += chunk(b"IEND", b"")
    return png

import base64 as _b64
_PNG_BYTES = _make_red_png()
SAMPLE_IMAGE_DATA_URI = "data:image/png;base64," + _b64.b64encode(_PNG_BYTES).decode()


# ── Хелперы вывода ────────────────────────────────────────────────

def _sep(char="─", width=64):
    print(char * width)

def _print_request(method: str, url: str, payload: dict | None = None):
    import json as _json
    _sep()
    print(f"  REQUEST  {method} {url}")
    if payload:
        dumped = _json.dumps(payload, ensure_ascii=False)
        print(f"  PAYLOAD  {dumped[:300]}{'…' if len(dumped) > 300 else ''}")

def _print_response(r: httpx.Response, latency: float, extra: str = ""):
    status_icon = "✓" if r.status_code == 200 else "✗"
    print(f"  {status_icon} STATUS   {r.status_code}  |  latency: {latency:.2f}s")
    print(f"    HEADERS  content-type={r.headers.get('content-type','?')}  "
          f"content-length={r.headers.get('content-length','?')}")
    if extra:
        for line in extra.splitlines():
            print(f"    {line}")
    _sep()


# ── Тесты чат-моделей ─────────────────────────────────────────────

@pytest.mark.parametrize("model", CHAT_MODELS)
def test_chat_model(model: str):
    prompt = "Ответь одним словом: привет"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 64,
        "temperature": 0.0,
    }
    url = f"{BASE_URL}/v1/chat/completions"
    _print_request("POST", url, payload)

    t0 = time.time()
    with httpx.Client(timeout=TIMEOUT) as client:
        r = client.post(url, headers=HEADERS, json=payload)
    latency = time.time() - t0

    if r.status_code != 200:
        _print_response(r, latency, f"ERROR BODY: {r.text[:400]}")
        pytest.fail(f"{model}: HTTP {r.status_code} — {r.text[:300]}")

    data          = r.json()
    choice        = (data.get("choices") or [{}])[0]
    message       = choice.get("message", {}) or {}
    content       = message.get("content") or ""
    # Reasoning-модели кладут мысли в reasoning_content, content может быть None
    reasoning     = message.get("reasoning_content") or ""
    finish_reason = choice.get("finish_reason", "?")
    usage         = data.get("usage", {})
    model_used    = data.get("model", "?")

    extra = (
        f"model_used={model_used}\n"
        f"finish={finish_reason}  "
        f"prompt_tokens={usage.get('prompt_tokens','?')}  "
        f"completion_tokens={usage.get('completion_tokens','?')}  "
        f"total_tokens={usage.get('total_tokens','?')}\n"
        + (f"THINKING: {reasoning[:150]}…\n" if reasoning else "")
        + f"ANSWER: {content[:200]}"
    )
    _print_response(r, latency, extra)

    has_output = content.strip() or reasoning.strip()
    assert has_output, f"{model}: и content и reasoning_content пусты. raw={data}"


# ── Тесты кодинг-моделей ──────────────────────────────────────────

@pytest.mark.parametrize("model", CODE_MODELS)
def test_code_model(model: str):
    prompt = "Напиши функцию Python которая возвращает сумму двух чисел. Только код, без объяснений."
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 256,
        "temperature": 0.0,
    }
    url = f"{BASE_URL}/v1/chat/completions"
    _print_request("POST", url, payload)

    t0 = time.time()
    with httpx.Client(timeout=TIMEOUT) as client:
        r = client.post(url, headers=HEADERS, json=payload)
    latency = time.time() - t0

    if r.status_code != 200:
        _print_response(r, latency, f"ERROR BODY: {r.text[:400]}")
        pytest.fail(f"{model}: HTTP {r.status_code} — {r.text[:300]}")

    data          = r.json()
    choice        = (data.get("choices") or [{}])[0]
    content       = choice.get("message", {}).get("content") or ""
    finish_reason = choice.get("finish_reason", "?")
    usage         = data.get("usage", {})

    extra = (
        f"finish={finish_reason}  total_tokens={usage.get('total_tokens','?')}\n"
        f"CODE:\n{content[:400]}"
    )
    _print_response(r, latency, extra)

    assert "def " in content or "return" in content, \
        f"{model}: не похоже на код:\n{content[:300]}"


# ── Тесты VLM ────────────────────────────────────────────────────

@pytest.mark.parametrize("model", VLM_MODELS)
def test_vlm_model(model: str):
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": "Что на картинке? Ответь одним предложением."},
            {"type": "image_url", "image_url": {"url": SAMPLE_IMAGE_DATA_URI}},
        ]}],
        "max_tokens": 128,
    }
    url = f"{BASE_URL}/v1/chat/completions"
    _sep()
    print(f"  REQUEST  POST {url}")
    print(f"  MODEL    {model}")
    print(f"  IMAGE    data:image/png;base64,... ({len(_PNG_BYTES)} bytes, 64×64 red PNG)")

    t0 = time.time()
    with httpx.Client(timeout=TIMEOUT) as client:
        r = client.post(url, headers=HEADERS, json=payload)
    latency = time.time() - t0

    if r.status_code != 200:
        _print_response(r, latency, f"ERROR BODY: {r.text[:400]}")
        pytest.fail(f"{model}: HTTP {r.status_code} — {r.text[:300]}")

    data          = r.json()
    choice        = (data.get("choices") or [{}])[0]
    content       = choice.get("message", {}).get("content") or ""
    finish_reason = choice.get("finish_reason", "?")
    usage         = data.get("usage", {})

    extra = (
        f"finish={finish_reason}  total_tokens={usage.get('total_tokens','?')}\n"
        f"DESCRIPTION: {content[:300]}"
    )
    _print_response(r, latency, extra)

    assert content.strip(), f"{model}: пустой ответ. raw={data}"


# ── Тесты генерации изображений ───────────────────────────────────

@pytest.mark.parametrize("model", IMAGE_GEN_MODELS)
def test_image_gen_model(model: str):
    payload = {"model": model, "prompt": "красный круг на белом фоне", "size": "512x512"}
    url = f"{BASE_URL}/v1/images/generations"
    _print_request("POST", url, payload)

    t0 = time.time()
    with httpx.Client(timeout=TIMEOUT) as client:
        r = client.post(url, headers=HEADERS, json=payload)
    latency = time.time() - t0

    if r.status_code != 200:
        _print_response(r, latency, f"ERROR BODY: {r.text[:400]}")
        pytest.fail(f"{model}: HTTP {r.status_code} — {r.text[:300]}")

    data    = r.json()
    items   = data.get("data", [])
    item    = items[0] if items else {}
    img_url = item.get("url", "")
    b64     = item.get("b64_json", "")
    created = data.get("created", "?")

    extra = (
        f"created={created}  items={len(items)}\n"
        f"URL: {img_url[:120] if img_url else '—'}\n"
        f"B64: {len(b64)} chars" if b64 else f"URL: {img_url[:120] if img_url else '—'}"
    )
    _print_response(r, latency, extra)

    assert items, f"{model}: нет данных изображения"
    assert item.get("url") or item.get("b64_json"), f"{model}: нет url или b64_json"


# ── Тесты ASR ────────────────────────────────────────────────────

def _minimal_wav() -> bytes:
    """0.5 сек тишины, 16kHz mono 16-bit PCM."""
    sample_rate = 16000
    num_samples = int(sample_rate * 0.5)
    audio_data  = b"\x00\x00" * num_samples
    data_size   = len(audio_data)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + data_size, b"WAVE",
        b"fmt ", 16, 1, 1,
        sample_rate, sample_rate * 2,
        2, 16,
        b"data", data_size,
    )
    return header + audio_data


@pytest.mark.parametrize("model", ASR_MODELS)
def test_asr_model(model: str):
    wav_bytes = _minimal_wav()
    url = f"{BASE_URL}/v1/audio/transcriptions"
    _sep()
    print(f"  REQUEST  POST {url}")
    print(f"  MODEL    {model}")
    print(f"  AUDIO    silence.wav  size={len(wav_bytes)}b  duration=0.5s  16kHz mono 16-bit")

    t0 = time.time()
    with httpx.Client(timeout=TIMEOUT) as client:
        r = client.post(
            url,
            headers={"Authorization": f"Bearer {API_KEY}"},
            files={"file": ("silence.wav", wav_bytes, "audio/wav")},
            data={"model": model},
        )
    latency = time.time() - t0

    if r.status_code != 200:
        _print_response(r, latency, f"ERROR BODY: {r.text[:400]}")
        pytest.fail(f"{model}: HTTP {r.status_code} — {r.text[:300]}")

    data       = r.json()
    transcript = data.get("text", "")
    language   = data.get("language", "?")
    duration   = data.get("duration", "?")
    segments   = data.get("segments", [])

    extra = (
        f"language={language}  duration={duration}s  segments={len(segments)}\n"
        f"TRANSCRIPT: '{transcript}'"
    )
    _print_response(r, latency, extra)

    assert "text" in data, f"{model}: нет поля 'text': {data}"


# ── Тесты эмбеддингов ─────────────────────────────────────────────

@pytest.mark.parametrize("model", EMBEDDING_MODELS)
def test_embedding_model(model: str):
    text = "тестовый текст для эмбеддинга"
    payload = {"model": model, "input": text}
    url = f"{BASE_URL}/v1/embeddings"
    _print_request("POST", url, payload)

    t0 = time.time()
    with httpx.Client(timeout=TIMEOUT) as client:
        r = client.post(url, headers=HEADERS, json=payload)
    latency = time.time() - t0

    if r.status_code != 200:
        _print_response(r, latency, f"ERROR BODY: {r.text[:400]}")
        pytest.fail(f"{model}: HTTP {r.status_code} — {r.text[:300]}")

    data      = r.json()
    items     = data.get("data", [])
    embedding = items[0].get("embedding", []) if items else []
    usage     = data.get("usage", {})

    if embedding:
        norm    = math.sqrt(sum(v * v for v in embedding))
        nonzero = sum(1 for v in embedding if v != 0.0)
        vmin    = min(embedding)
        vmax    = max(embedding)
        first5  = [round(v, 5) for v in embedding[:5]]
        extra = (
            f"dim={len(embedding)}  norm={norm:.4f}  "
            f"nonzero={nonzero}/{len(embedding)}  "
            f"min={vmin:.5f}  max={vmax:.5f}\n"
            f"tokens={usage.get('total_tokens','?')}  "
            f"first5={first5}"
        )
    else:
        extra = "EMPTY EMBEDDING"

    _print_response(r, latency, extra)

    assert embedding, f"{model}: пустой вектор. raw={data}"
    assert any(v != 0.0 for v in embedding[:10]), f"{model}: вектор из нулей"
