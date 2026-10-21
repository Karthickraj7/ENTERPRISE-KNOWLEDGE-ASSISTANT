"""Background Ingestion Worker Service (Section 6.1).

Claims queued jobs with SKIP LOCKED / lease semantics, extracts text, normalizes and chunks,
generates embeddings in batches (skipping cached content_hash+model vectors), and atomically
activates the new document version.
"""
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import Settings
from app.db.repository import DatabaseRepository
from app.documents.storage import StorageBackend
from app.ingestion.chunker import chunk_extracted_sections
from app.ingestion.parsers import ExtractionError, extract_document_sections
from app.providers.base import EmbeddingProvider, ProviderError


class IngestionWorkerService:
    def __init__(
        self,
        settings: Settings,
        repo: DatabaseRepository,
        storage: StorageBackend,
        embedding_provider: EmbeddingProvider,
        worker_id: str = "worker-main-1",
    ) -> None:
        self.settings = settings
        self.repo = repo
        self.storage = storage
        self.embedding_provider = embedding_provider
        self.worker_id = worker_id

    def process_next_job(self) -> Optional[Dict[str, Any]]:
        job = self.repo.claim_next_ingestion_job(worker_id=self.worker_id, lease_seconds=300)
        if not job:
            return None

        job_id = job["id"]
        tenant_id = job["tenant_id"]
        document_id = job["document_id"]
        version_id = job["version_id"]
        version_number = int(job["version"])
        storage_key = job["storage_key"]
        filename = job["filename"]
        ext = Path(filename).suffix.lower()

        active_model = self.repo.get_active_embedding_model()
        if not active_model:
            info = self.embedding_provider.describe()
            active_model = self.repo.ensure_active_embedding_model(
                provider=info.provider,
                model_name=info.model_name,
                revision=info.revision,
                dim=info.dim,
                max_input_tokens=info.max_input_tokens,
                normalize=info.normalize,
                query_prefix=info.query_prefix,
                document_prefix=info.document_prefix,
            )

        embedding_model_id = active_model["id"]
        expected_dim = int(active_model["dim"])

        try:
            raw_bytes = self.storage.get(storage_key)
            sections = extract_document_sections(ext, raw_bytes)
            chunks = chunk_extracted_sections(
                sections,
                target_tokens=self.settings.chunk_target_tokens,
                overlap_tokens=self.settings.chunk_overlap_tokens,
            )
            if not chunks:
                raise ExtractionError("empty_chunks", "No chunks produced from document.", retryable=False)

            # Batch embedding generation with content_hash + model_id deduplication cache
            chunks_with_vectors: List[Dict[str, Any]] = []
            texts_to_embed: List[str] = []
            indices_to_embed: List[int] = []

            for idx, chk in enumerate(chunks):
                cached_vec = self.repo.get_existing_embedding_by_hash(
                    tenant_id=tenant_id,
                    content_hash=chk.content_hash,
                    embedding_model_id=embedding_model_id,
                )
                entry = {
                    "chunk_index": chk.chunk_index,
                    "content": chk.content,
                    "content_hash": chk.content_hash,
                    "token_count": chk.token_count,
                    "page_start": chk.page_start,
                    "page_end": chk.page_end,
                    "heading_path": chk.heading_path,
                    "parser_version": chk.parser_version,
                    "vector": cached_vec,
                }
                chunks_with_vectors.append(entry)
                if cached_vec is None:
                    texts_to_embed.append(chk.content)
                    indices_to_embed.append(idx)

            batch_size = max(1, self.settings.embedding_batch_size)
            total_tokens = 0
            total_latency = 0.0

            for b_start in range(0, len(texts_to_embed), batch_size):
                batch_texts = texts_to_embed[b_start : b_start + batch_size]
                batch_indices = indices_to_embed[b_start : b_start + batch_size]
                emb_res = self.embedding_provider.embed_documents(batch_texts)
                total_tokens += emb_res.tokens_used
                total_latency += emb_res.latency_ms
                for local_i, vec in enumerate(emb_res.vectors):
                    if len(vec) != expected_dim:
                        raise RuntimeError(
                            f"Embedding dimension mismatch: model requires {expected_dim}, got {len(vec)}"
                        )
                    target_idx = batch_indices[local_i]
                    chunks_with_vectors[target_idx]["vector"] = vec

            self.repo.complete_ingestion_job_atomically(
                job_id=job_id,
                tenant_id=tenant_id,
                document_id=document_id,
                version_id=version_id,
                version_number=version_number,
                embedding_model_id=embedding_model_id,
                chunks_with_vectors=chunks_with_vectors,
            )

            self.repo.record_usage(
                tenant_id=tenant_id,
                user_id=None,
                kind="embedding",
                provider=active_model["provider"],
                model_name=active_model["model_name"],
                tokens_in=total_tokens,
                tokens_out=0,
                estimated_cost_usd=0.0,
                latency_ms=total_latency,
            )
            self.repo.record_audit_event(
                tenant_id=tenant_id,
                actor_id=None,
                action="document.indexed",
                resource_type="document",
                resource_id=document_id,
                metadata={"version": version_number, "chunk_count": len(chunks_with_vectors)},
            )
            return {"job_id": job_id, "status": "completed", "chunk_count": len(chunks_with_vectors)}

        except ExtractionError as exc:
            updated = self.repo.fail_ingestion_job(
                job_id=job_id,
                document_id=document_id,
                version_id=version_id,
                error_code=exc.error_code,
                error_detail=exc.message,
                retryable=exc.retryable,
                terminal_doc_status=exc.terminal_status,
            )
            return {"job_id": job_id, "status": updated["status"], "error_code": exc.error_code}

        except ProviderError as exc:
            updated = self.repo.fail_ingestion_job(
                job_id=job_id,
                document_id=document_id,
                version_id=version_id,
                error_code="embedding_provider_error",
                error_detail=str(exc),
                retryable=exc.retryable,
                terminal_doc_status="failed",
            )
            return {"job_id": job_id, "status": updated["status"], "error_code": "embedding_provider_error"}

        except Exception as exc:
            updated = self.repo.fail_ingestion_job(
                job_id=job_id,
                document_id=document_id,
                version_id=version_id,
                error_code="internal_ingestion_error",
                error_detail=str(exc),
                retryable=True,
                terminal_doc_status="failed",
            )
            return {"job_id": job_id, "status": updated["status"], "error_code": "internal_ingestion_error"}

    def drain_queue(self, max_jobs: int = 50) -> List[Dict[str, Any]]:
        results = []
        for _ in range(max_jobs):
            res = self.process_next_job()
            if not res:
                break
            results.append(res)
        return results
