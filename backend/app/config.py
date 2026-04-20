from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # NVIDIA API (OpenAI-compatible endpoint)
    MWS_BASE_URL: str = "https://integrate.api.nvidia.com"
    MWS_API_KEY: str = ""

    # Models
    MODEL_TEXT: str = "mistralai/mistral-small-4-119b-2603"
    MODEL_CODE: str = "qwen/qwen3-coder-480b-a35b-instruct"
    MODEL_LONG: str = "nvidia/llama-3.3-nemotron-super-49b-v1"
    MODEL_RESEARCH_PLANNER: str = "mistralai/mistral-small-4-119b-2603"
    MODEL_RESEARCH_EXTRACTOR: str = "nvidia/llama-3.3-nemotron-super-49b-v1"
    MODEL_RESEARCH_WRITER: str = "nvidia/llama-3.3-nemotron-super-49b-v1"

    # ASR — Groq Whisper
    GROQ_API_KEY: str = ""
    GROQ_PROXY: str = ""  # optional HTTP proxy for Groq (e.g. for geo-restricted servers)
    ASR_URL: str = "http://localhost:8001"  # fallback: local faster-whisper

    # TTS
    TTS_VOICE: str = "ru-RU-SvetlanaNeural"

    # Research engine
    RESEARCH_SEARCH_RESULTS: int = 3
    RESEARCH_SAFE_MODE: bool = False
    RESEARCH_HTTP_CONCURRENCY: int = 4
    RESEARCH_LLM_CONCURRENCY: int = 2
    RESEARCH_SOURCE_TEXT_CHARS: int = 2400
    RESEARCH_MAX_EVIDENCE_PER_SOURCE: int = 2
    RESEARCH_MIN_EVIDENCE_PER_FACET: int = 1
    RESEARCH_MIN_DOMAINS_PER_FACET: int = 1

    # Auth
    SECRET_KEY: str = "change-me-in-production-use-long-random-string"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 дней

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/mws_gateway"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # игнорируем неизвестные переменные из .env


@lru_cache
def get_settings() -> Settings:
    return Settings()
