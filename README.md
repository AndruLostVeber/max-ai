# Max AI

AI-платформа с умным роутингом запросов, долгосрочной памятью (pgvector), Deep Research и голосовым вводом/выводом.

> **Хостинг:** демо-версия доступна на [maxeditor.ru](https://maxeditor.ru)

Текущий вид проекта - усовершенствованная версия хаба, сделанного на хакатоне true tech-hunt 2026 в команде с @aeondf @KosterMe с новыми дизайном и API
---

## Возможности

| Сценарий | Описание |
|---|---|
| Текстовый чат | Умный роутинг запросов по 3 проходам → нужная модель → SSE-стриминг |
| Голосовой режим | Микрофон → ASR (Whisper) → LLM → TTS (edge-tts) → MP3 |
| Анализ изображений | Загрузка файла или ссылка → VLM → текстовый ответ |
| Deep Research | Запрос → 4 подзапроса → DuckDuckGo → парсинг → синтез с источниками |
| Генерация изображений | Текстовый промпт → Image API → рендер в чате |
| Разбор документов | PDF / DOCX / TXT → чанки → контекст в чате |
| Долгосрочная память | Факты из ответов → pgvector → инжект в системный промпт |
| Мульти-агентный режим | 8 специализированных агентов с предустановленными промптами |

---

## Стек

| Слой | Технология |
|---|---|
| **Backend** | FastAPI 0.115 · SQLAlchemy 2.0 async · Uvicorn |
| **База данных** | PostgreSQL 16 + pgvector · Alembic migrations |
| **Кэш** | Redis 7 |
| **Frontend** | Vanilla JS (ES6 модули) · nginx alpine |
| **AI-модели** | OpenAI-совместимый API — Qwen, Llama, DeepSeek и др. |
| **TTS** | edge-tts (Microsoft SvetlanaNeural) |
| **Deploy** | Docker Compose (4 сервиса) |

---

## Быстрый старт

```bash
git clone https://github.com/<your-user>/max-ai.git
cd max-ai

cp backend/.env.example backend/.env
# Вписать API_KEY и остальные ключи

docker compose up --build -d
```

- **Frontend:** http://localhost:3000
- **Backend API (Swagger):** http://localhost:8000/docs

> При первом запуске Alembic автоматически создаёт схему БД.

---

## Переменные окружения

Полный список — в [`backend/.env.example`](backend/.env.example).

Обязательные:

| Переменная | Описание |
|---|---|
| `MWS_API_KEY` | Ключ OpenAI-совместимого API |
| `MWS_BASE_URL` | Базовый URL провайдера |
| `SECRET_KEY` | Секрет для подписи JWT |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |

---

## Архитектура

```
Browser (localhost:3000)
    └── nginx
        ├── /        → static (index.html + js/ + styles/)
        └── /v1/*    → backend:8000

Backend (FastAPI :8000)
    ├── /v1/auth/              JWT-регистрация и вход
    ├── /v1/chat/completions   SSE-стриминг + умный роутер + память
    ├── /v1/research           Deep Research (SSE)
    ├── /v1/voice/message      ASR → LLM → TTS
    ├── /v1/vlm/analyze        Анализ изображений
    ├── /v1/image/generate     Генерация изображений
    ├── /v1/memory/{user_id}   Долгосрочная память (pgvector)
    ├── /v1/history/{user_id}  История диалогов
    ├── /v1/parse/             Разбор документов (PDF/DOCX/TXT)
    └── /v1/health             Статус сервисов
```

### Умный роутер — 3 прохода

1. **MIME** — файл или изображение → VLM / parse-модель
2. **Regex** — паттерны кода, исследования, генерации → специализированная модель
3. **LLM** — неоднозначный запрос классифицирует лёгкая модель

Каждый запрос логируется в `router_log`: `task_type`, `model_id`, `confidence`, `which_pass`, `latency_ms`.

### Долгосрочная память

```
Ответ ассистента
  → async: LLM → экстракция фактов (key / value / category)
  → pgvector embed → INSERT user_memory
  → следующий запрос: SELECT TOP-8 по cosine similarity + recency
  → инжект в system_prompt
```

---

## API-эндпоинты

### Аутентификация
| Метод | Путь | Описание |
|---|---|---|
| POST | `/v1/auth/register` | Регистрация |
| POST | `/v1/auth/login` | Вход, возвращает JWT |
| GET | `/v1/auth/me` | Текущий пользователь |
| POST | `/v1/auth/profile` | Обновление профиля |

### Чат
| Метод | Путь | Описание |
|---|---|---|
| POST | `/v1/chat/completions` | Основной чат (stream/json, OpenAI-совместимый) |

### Research и медиа
| Метод | Путь | Описание |
|---|---|---|
| POST | `/v1/research` | Deep Research (SSE) |
| POST | `/v1/voice/message` | Голос → текст → голос |
| POST | `/v1/vlm/analyze` | Анализ изображения |
| POST | `/v1/image/generate` | Генерация изображения |
| POST | `/v1/parse/pdf` | PDF → текст |
| POST | `/v1/parse/docx` | DOCX → текст |

### Данные пользователя
| Метод | Путь | Описание |
|---|---|---|
| GET/POST/DELETE | `/v1/memory/{user_id}` | Управление памятью |
| GET/POST | `/v1/history/{user_id}` | Список диалогов |
| GET/PUT/DELETE | `/v1/history/{user_id}/{conv_id}` | Операции с диалогом |

---

## Схема базы данных

| Таблица | Ключевые поля |
|---|---|
| `users` | id, email, password_hash, created_at |
| `conversations` | id, user_id (FK), title, created_at, updated_at |
| `messages` | id, conversation_id (FK), role, content, model_used, created_at |
| `user_memory` | id, user_id (FK), key, value, category, score (float), updated_at |
| `router_log` | id, user_id, task_type, model_id, confidence, which_pass, latency_ms, created_at |

---

## Frontend-модули (js/)

| Файл | Назначение |
|---|---|
| `main.js` | Глобальное состояние, инициализация, связка событий |
| `chat.js` | Отправка сообщений, SSE-рендер, markdown |
| `voice.js` | Запись микрофона, отправка, воспроизведение |
| `research.js` | Deep Research SSE, генерация изображений |
| `memory.js` | Загрузка и инжект долгосрочной памяти |
| `history.js` | Сайдбар с историей, поиск, переименование |
| `agents.js` | 8 специализированных агентов |
| `models.js` | Список моделей, группировка по вендору |
| `auth-ui.js` | Форма входа/регистрации |
| `api.js` | API-клиент (auth headers, uuid, fileToBase64) |
| `ui.js` | Панели, тема, язык, адаптив |
| `profile.js` | Настройки пользователя |

---

## Docker Compose

```yaml
services:
  postgres:   pgvector/pgvector:pg16   # :5432
  redis:      redis:7-alpine           # :6379
  backend:    Python 3.12 slim         # :8000
  frontend:   nginx:alpine             # :3000
```

Все сервисы в сети `app-network`. Frontend проксирует `/v1/*` на backend через nginx.

---

## Тесты

```bash
cd backend
python -m pytest tests/ -v
```

---

## Лицензия

MIT
