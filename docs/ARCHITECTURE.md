# Architecture & Data Flow Specification

## 1. Modular Monolith & Trust Boundaries
- **Browser (`apps/web`)**: Untrusted client. Holds only an `HttpOnly` session cookie and an in-memory CSRF token. Never receives provider API keys or OAuth client secrets.
- **FastAPI Policy Enforcement Point (`backend/app/main.py`)**: Stateless `/api/v1` REST API. Resolves user identity, active tenant, and RBAC role (`viewer`, `contributor`, `knowledge_admin`, `system_admin`) from the hashed session row on every request.
- **Ingestion Worker (`backend/worker/main.py`)**: Claims jobs from `ingestion_jobs` via `SKIP LOCKED` with a 300-second lease, parses untrusted files with strict page/size/decompression limits, embeds chunks in batches, and atomically updates `documents.active_version`.
- **PostgreSQL + pgvector**: Single system of record for tenants, users, ACLs, jobs, chunks, `tsvector` FTS, `chunk_embeddings`, conversations, usage records, and append-only audit events.
