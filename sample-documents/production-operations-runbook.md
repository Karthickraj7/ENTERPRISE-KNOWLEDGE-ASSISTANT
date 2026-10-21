# Production Operations and Disaster Recovery Runbook

## 1. Health, Readiness, and Metrics Endpoints

The FastAPI service exposes `/healthz` for container liveness and `/readyz` for deep readiness verification.
Readiness checks validate PostgreSQL connectivity, schema migration head parity, object storage write/read access,
and that the active embedding model dimension matches `EMBEDDING_DIM` (default 384).

## 2. Ingestion Queue Recovery and Dead-Letter Handling

Ingestion jobs are stored in PostgreSQL `ingestion_jobs` and claimed by workers using `FOR UPDATE SKIP LOCKED`
with a 300-second lease. If a worker crashes mid-extraction, the lease expires and another worker reclaims the job.
Jobs exceeding `max_attempts` (default 3) transition to `failed` with a safe `error_code` and can be retried from the Admin UI.

## 3. Monthly Backup and Restore Drill

Database logical backups run daily via `pg_dump --format=custom`. On the first Tuesday of every month,
operators execute `make restore-drill` to restore the latest dump into an isolated scratch database and verify
chunk counts, ACL constraints, and hybrid retrieval queries. Target Recovery Point Objective (RPO) is 24 hours
and Recovery Time Objective (RTO) is 2 hours.
