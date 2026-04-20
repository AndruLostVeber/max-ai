.PHONY: up down build migrate test lint shell logs

# ── Docker ───────────────────────────────────────────────────────
up:
	docker compose up -d --build

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f backend

# ── Database ─────────────────────────────────────────────────────
migrate:
	docker compose exec backend alembic upgrade head

migrate-down:
	docker compose exec backend alembic downgrade -1

migrate-new:
	docker compose exec backend alembic revision --autogenerate -m "$(msg)"

# ── Dev (local, no Docker) ────────────────────────────────────────
install:
	pip install -r requirements.txt

run:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# ── Tests ────────────────────────────────────────────────────────
test:
	pytest -v

test-cov:
	pytest --cov=app --cov-report=term-missing -v

# ── Code quality ─────────────────────────────────────────────────
lint:
	ruff check app tests

format:
	ruff format app tests

# ── Ollama ───────────────────────────────────────────────────────
pull-router:
	docker compose exec ollama ollama pull qwen2.5:3b

pull-vlm:
	docker compose exec ollama ollama pull llava

# ── Shortcuts ────────────────────────────────────────────────────
shell:
	docker compose exec backend bash

psql:
	docker compose exec postgres psql -U user -d mirea
