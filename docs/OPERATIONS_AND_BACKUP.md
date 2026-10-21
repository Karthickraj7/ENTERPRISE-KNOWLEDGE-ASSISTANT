# Operations, Deployment, and Backup/Restore Runbook

## 1. Health & Readiness Probes
- `GET /healthz`: Liveness probe verifying the API process is responsive.
- `GET /readyz`: Readiness probe verifying database connectivity, object storage health, and that the active embedding model dimension matches `EMBEDDING_DIM` (384).
- `GET /metrics`: Operational counters for requests, errors, uploads, searches, and chat queries.

## 2. Backup & Monthly Restore Drill
- **Daily Backup**: Run `pg_dump --format=custom --file=eka_$(date +%F).dump $DATABASE_URL` and encrypt with AES-256-GCM.
- **Monthly Restore Drill**: Run `make restore-drill` (`python3 scripts/backup_restore_drill.py`) to verify backup restoration into an isolated scratch database and validate document/chunk integrity.
