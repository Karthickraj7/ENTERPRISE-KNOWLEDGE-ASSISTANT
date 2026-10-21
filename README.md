# Enterprise Knowledge Assistant (v2.0)

Production-oriented, free-first, provider-independent Retrieval-Augmented Generation (RAG) workspace built according to `Enterprise_Knowledge_Assistant_Architecture_v2.pdf`.

## Key Architecture Highlights

- **Free-First Local AI by Default**: Runs end-to-end with zero paid API keys. Uses Sentence Transformers (`BAAI/bge-small-en-v1.5`, 384 dimensions, CPU, MIT license) for local embeddings and defaults to `GENERATION_PROVIDER=none` (honest retrieval-only mode with verifiable citations). Supports `intfloat/multilingual-e5-small` (384 dims) for multilingual corpora and optional generation adapters (`openai_compatible`, `gemini`, `openai`, `anthropic`).
- **Strict Security & Multi-Tenancy**:
  - Server-side Google OAuth 2.0 / OIDC authorization-code flow with state, nonce, and PKCE (`S256`), plus an isolated local development login (`ENABLE_DEV_AUTH=true`, automatically blocked when `APP_ENV=production`).
  - Opaque session tokens stored strictly as SHA-256 hashes in PostgreSQL with `HttpOnly`, `Secure`, `SameSite=Lax` cookies and HMAC-SHA256 CSRF protection on all mutating endpoints.
  - Pre-filtered SQL authorization (`tenant_id`, `status = 'indexed'`, `deleted_at IS NULL`, `chunk.version = document.active_version`, and user/role/ACL permissions) evaluated **before** vector or full-text ranking, plus click-time ACL re-verification when opening source citations.
- **Complete Deterministic RAG Pipeline**:
  - Supports PDF (`pypdf`), DOCX (`python-docx`), Markdown (`.md`), and Plain Text (`.txt`) with magic-byte MIME verification, zip-bomb decompression ratio guards, encrypted PDF rejection (`encrypted_pdf`), and scanned PDF detection (`needs_ocr`).
  - Transactional outbox job queue (`ingestion_jobs` claimed with `FOR UPDATE SKIP LOCKED` and 300s leases), content-hash embedding deduplication, and atomic `active_version` switching.
- **Taste Skill v2 (`design-taste-frontend`) Responsive UI**:
  - Implemented across all 7 screens (`Sign-in`, `Dashboard`, `Document Library & Detail`, `RAG Chat Workspace`, `Hybrid Search Workspace`, `Settings`, and `Administration`) enforcing the Three Consistency Locks (Color, Shape, Theme), tabular numerals, WCAG 2.2 AA contrast, keyboard navigation, and reduced-motion support.

---

## Repository Structure

```text
enterprise-knowledge-assistant/
├── apps/
│   └── web/                        # Next.js 14 + React + TypeScript + Tailwind CSS (Taste Skill v2 UI)
├── backend/
│   ├── app/
│   │   ├── api/v1/                 # Versioned REST endpoints (/api/v1/*)
│   │   ├── auth/                   # Google OIDC, PKCE, session management, CSRF, RBAC
│   │   ├── core/                   # Startup config validation, RFC 7807 errors, cryptography
│   │   ├── db/                     # SQLAlchemy 2 models & transactional repository
│   │   ├── documents/              # Local & S3 storage adapters, magic-byte upload validator
│   │   ├── ingestion/              # PDF/DOCX/MD/TXT parsers, deterministic chunker, worker service
│   │   ├── providers/              # EmbeddingProvider & LLMProvider interfaces & adapters
│   │   ├── retrieval/              # Hybrid vector + FTS search & Reciprocal Rank Fusion (k=60)
│   │   └── generation/             # Evidence-pack builder, citation validator, degraded fallback
│   ├── migrations/                 # Alembic migrations (17 normalized tables + pgvector/GIN indexes)
│   ├── tests/                      # Unit, integration, tenant-isolation, and 50-question golden eval suite
│   └── worker/                     # Standalone ingestion worker entrypoint
├── packages/
│   └── shared-contracts/           # Shared TypeScript API contracts
├── infra/
│   ├── docker/                     # Dockerfile.backend & Dockerfile.web
│   └── postgres/                   # pgvector & citext initialization SQL
├── scripts/                        # Seed script, static secret/lint audit, backup/restore drill, packager
├── sample-documents/               # Sample PDF, DOCX, Markdown, and TXT enterprise documents
├── docs/                           # Architecture, Security Threat Model, Operations, Test Report
├── .skills/design-taste-frontend/  # Installed Taste Skill v2 specification
├── .github/workflows/ci.yml        # GitHub Actions CI pipeline
├── .env.example                    # Documented environment template
├── docker-compose.yml              # Full stack Compose (Postgres+pgvector, API, Worker, Web)
└── Makefile                        # Developer workflow commands
```

---

## Quick Start (Local Development — Zero Paid API Keys Required)

### Option 1: Docker Compose (Recommended Full Stack)

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
2. Start PostgreSQL (`pgvector/pgvector:pg16`), the FastAPI backend, the background ingestion worker, and the Next.js web application:
   ```bash
   docker compose up -d --build
   ```
3. Open `http://localhost:3000` in your browser and sign in using the isolated Local Development Sign-In (or configure Google OAuth credentials in `.env`).

### Option 2: Direct Local Execution (Python + Node.js)

1. Run the backend test suite, security audit, and backup/restore drill:
   ```bash
   make test
   make lint
   make restore-drill
   ```
2. Seed the local database and ingest the sample PDF, DOCX, Markdown, and TXT documents:
   ```bash
   make seed
   ```
3. Start the API server and Next.js frontend:
   ```bash
   PYTHONPATH=backend uvicorn app.main:app --host 0.0.0.0 --port 8000
   cd apps/web && npm install && npm run dev
   ```

---

## Configuring Optional Generation Providers

By default, `GENERATION_PROVIDER=none` so the application runs 100% locally in retrieval-only mode and never sends confidential documents to external servers.

To enable grounded answer generation:

1. **Local Open-Weight Server (`openai_compatible`, e.g., llama.cpp or vLLM — no Ollama required)**:
   ```env
   GENERATION_PROVIDER=openai_compatible
   GENERATION_MODEL=local-instruct-model
   GENERATION_BASE_URL=http://localhost:8080/v1
   ```
2. **Google Gemini API**:
   Verify the active model identifier at `https://ai.google.dev/gemini-api/docs/models` (do not use coding-agent identifiers like `Gemini Argon 4`).
   ```env
   GENERATION_PROVIDER=gemini
   GENERATION_MODEL=gemini-2.5-flash
   GEMINI_API_KEY=your-gemini-api-key
   # Note: If using the unpaid Gemini tier, Google marks content as used for product improvement.
   # For non-confidential demo data only, explicitly acknowledge this:
   GEMINI_TIER_IS_FREE=true
   ALLOW_TRAINING_USE_PROVIDERS=true
   ```
3. **OpenAI or Anthropic**:
   ```env
   GENERATION_PROVIDER=openai
   GENERATION_MODEL=gpt-4o-mini
   OPENAI_API_KEY=your-openai-key
   ```
