"""Standalone Background Ingestion Worker Entrypoint."""
import logging
import signal
import sys
import time

from app.core.config import get_settings
from app.db.repository import DatabaseRepository
from app.documents.storage import LocalFilesystemStorage, S3CompatibleStorage
from app.ingestion.worker_service import IngestionWorkerService
from app.providers.embeddings import build_embedding_provider

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("eka.worker")

_running = True


def _handle_sigterm(signum, frame):
    global _running
    logger.info("Received stop signal, shutting down worker cleanly...")
    _running = False


def main() -> None:
    signal.signal(signal.SIGINT, _handle_sigterm)
    signal.signal(signal.SIGTERM, _handle_sigterm)

    settings = get_settings()
    repo = DatabaseRepository(settings.database_url)
    if settings.storage_backend == "s3":
        storage = S3CompatibleStorage(bucket=settings.s3_bucket, endpoint_url=settings.s3_endpoint_url)
    else:
        storage = LocalFilesystemStorage(settings.local_storage_path)
    embedder = build_embedding_provider(settings)
    worker = IngestionWorkerService(settings, repo, storage, embedder)

    logger.info(
        "Started EKA Ingestion Worker (embedding_provider=%s, model=%s)",
        settings.embedding_provider,
        settings.embedding_model,
    )
    while _running:
        res = worker.process_next_job()
        if res:
            logger.info("Processed job: %s", res)
        else:
            time.sleep(1.5)


if __name__ == "__main__":
    main()
