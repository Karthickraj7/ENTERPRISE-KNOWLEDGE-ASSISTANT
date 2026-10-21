#!/usr/bin/env python3
"""Seed local demonstration tenant, users across all 4 RBAC roles, and ingest sample documents."""
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings
from app.db.repository import DatabaseRepository
from app.documents.storage import LocalFilesystemStorage
from app.documents.validation import validate_uploaded_file
from app.ingestion.worker_service import IngestionWorkerService
from app.providers.embeddings import build_embedding_provider


def seed() -> None:
    settings = get_settings()
    repo = DatabaseRepository(settings.database_url)
    storage = LocalFilesystemStorage(settings.local_storage_path)
    embedder = build_embedding_provider(settings)
    worker = IngestionWorkerService(settings, repo, storage, embedder)

    tenant = repo.upsert_tenant(slug=settings.default_tenant_slug, name=settings.default_tenant_name)
    demo_users = [
        ("admin@acme-corp.internal", "Ada Lovelace (System Admin)", "system_admin"),
        ("kadmin@acme-corp.internal", "Grace Hopper (Knowledge Admin)", "knowledge_admin"),
        ("contributor@acme-corp.internal", "Alan Turing (Contributor)", "contributor"),
        ("viewer@acme-corp.internal", "Margaret Hamilton (Viewer)", "viewer"),
    ]
    owner_id = ""
    for email, name, role in demo_users:
        u = repo.upsert_user(email=email, full_name=name)
        repo.upsert_membership(tenant["id"], u["id"], role=role)
        if role == "system_admin":
            owner_id = u["id"]

    sample_dir = Path(__file__).resolve().parent.parent / "sample-documents"
    for fpath in sorted(sample_dir.iterdir()):
        if not fpath.is_file():
            continue
        raw = fpath.read_bytes()
        val = validate_uploaded_file(fpath.name, raw, max_upload_size_mb=settings.max_upload_size_mb)
        skey = storage.put(tenant["id"], val.extension, raw)
        doc, job, is_dup = repo.create_document_and_enqueue_job(
            tenant_id=tenant["id"],
            owner_id=owner_id,
            title=fpath.stem.replace("-", " ").title(),
            filename=val.sanitized_filename,
            mime_type=val.detected_mime,
            size_bytes=val.size_bytes,
            sha256=val.sha256,
            storage_key=skey,
            visibility="tenant",
        )
        if is_dup:
            storage.delete(skey)

    processed = worker.drain_queue()
    print(f"Seeded tenant '{tenant['slug']}', {len(demo_users)} users, processed {len(processed)} ingestion jobs.")


if __name__ == "__main__":
    seed()
