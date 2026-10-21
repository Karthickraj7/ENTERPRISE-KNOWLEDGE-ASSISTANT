.PHONY: help up down build logs migrate seed test test-backend test-frontend lint typecheck restore-drill clean

help:
	@echo "Enterprise Knowledge Assistant - Development Commands"
	@echo "  make up             Start PostgreSQL (pgvector), API, Worker, and Web via Docker Compose"
	@echo "  make down           Stop all services"
	@echo "  make migrate        Run Alembic database migrations (upgrade head)"
	@echo "  make seed           Seed local demonstration tenant, roles, and sample documents"
	@echo "  make test           Run full automated test suite (backend + frontend)"
	@echo "  make test-backend   Run backend unit, integration, security, and golden evaluation tests"
	@echo "  make test-frontend  Run frontend unit and E2E Playwright tests"
	@echo "  make lint           Run code quality and security checks"
	@echo "  make restore-drill  Execute database backup & scratch restore verification drill"

up:
	docker compose up -d --build

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

migrate:
	cd backend && alembic upgrade head

seed:
	PYTHONPATH=backend python3 scripts/seed_demo.py

test: test-backend test-frontend

test-backend:
	PYTHONPATH=backend python3 backend/run_tests.py

test-frontend:
	cd apps/web && npm test

lint:
	PYTHONPATH=backend python3 scripts/lint_and_audit.py

restore-drill:
	PYTHONPATH=backend python3 scripts/backup_restore_drill.py

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	rm -rf backend/var
