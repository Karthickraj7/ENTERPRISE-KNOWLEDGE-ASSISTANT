"""FastAPI Modular Monolith Application Entrypoint (Section 3, 8 & 9)."""
import json
from typing import Any, Dict, List, Optional
import uuid

from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.auth.dependencies import RateLimiter, require_min_role, resolve_authenticated_session
from app.auth.oidc import OIDCFlowManager
from app.core.config import Settings, get_settings
from app.core.errors import AppError, get_request_id, problem_response
from app.core.security import generate_csrf_token, generate_opaque_token, hash_session_token
from app.db.repository import DatabaseRepository
from app.documents.storage import LocalFilesystemStorage, S3CompatibleStorage, StorageBackend
from app.documents.validation import FileValidationError, validate_uploaded_file
from app.generation.rag import FIXED_SYSTEM_PROMPT, RAGService, build_evidence_pack_prompt
from app.ingestion.worker_service import IngestionWorkerService
from app.providers.base import EmbeddingProvider, LLMProvider, ProviderError
from app.providers.embeddings import build_embedding_provider
from app.providers.llm import build_llm_provider
from app.retrieval.hybrid import HybridRetriever


# --- Typed Request Models ---
class DevLoginRequest(BaseModel):
    email: str = Field(default="admin@acme-corp.internal")
    full_name: str = Field(default="Ada Lovelace (Admin)")
    role: str = Field(default="system_admin")
    tenant_slug: Optional[str] = None
    tenant_name: Optional[str] = None


class MockOIDCCallbackRequest(BaseModel):
    state: str
    id_token_claims: Dict[str, Any]


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    top_k: int = Field(default=6, ge=1, le=20)


class ChatAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    conversation_id: Optional[str] = None
    top_k: int = Field(default=6, ge=1, le=15)


class FeedbackRequest(BaseModel):
    rating: str = Field(..., regex="^(helpful|unhelpful|issue)$")
    message_id: Optional[str] = None
    chunk_id: Optional[str] = None
    comment: Optional[str] = Field(default=None, max_length=1000)


class UpdateACLRequest(BaseModel):
    visibility: str = Field(..., regex="^(tenant|restricted|owner)$")
    acl_entries: List[Dict[str, str]] = Field(default_factory=list)


class UpdateRoleRequest(BaseModel):
    user_id: str
    role: str = Field(..., regex="^(viewer|contributor|knowledge_admin|system_admin)$")


class UpdatePreferencesRequest(BaseModel):
    theme: str = Field(default="system")
    reduced_motion: bool = Field(default=False)
    high_contrast: bool = Field(default=False)


class StartEmbeddingMigrationRequest(BaseModel):
    provider: str = Field(default="sentence_transformers")
    model_name: str = Field(..., min_length=2, max_length=255)
    revision: str = Field(default="main")
    dim: int = Field(default=384, ge=64, le=4000)
    max_input_tokens: int = Field(default=512, ge=128, le=8192)
    query_prefix: str = Field(default="query: ")
    document_prefix: str = Field(default="passage: ")
    promote_immediately: bool = Field(default=False)


def create_app(
    custom_settings: Optional[Settings] = None,
    custom_repo: Optional[DatabaseRepository] = None,
    custom_storage: Optional[StorageBackend] = None,
    custom_embedder: Optional[EmbeddingProvider] = None,
    custom_llm: Optional[LLMProvider] = None,
) -> FastAPI:
    settings = custom_settings or get_settings()
    repo = custom_repo or DatabaseRepository(settings.database_url)
    if custom_storage is not None:
        storage = custom_storage
    elif settings.storage_backend == "s3":
        storage = S3CompatibleStorage(bucket=settings.s3_bucket, endpoint_url=settings.s3_endpoint_url)
    else:
        storage = LocalFilesystemStorage(settings.local_storage_path)

    embedder = custom_embedder or build_embedding_provider(settings)
    llm_provider = custom_llm or build_llm_provider(settings)

    # Register active embedding model in DB on startup and verify dimension parity
    emb_info = embedder.describe()
    active_model_row = repo.ensure_active_embedding_model(
        provider=emb_info.provider,
        model_name=emb_info.model_name,
        revision=emb_info.revision,
        dim=emb_info.dim,
        max_input_tokens=emb_info.max_input_tokens,
        normalize=emb_info.normalize,
        query_prefix=emb_info.query_prefix,
        document_prefix=emb_info.document_prefix,
    )

    retriever = HybridRetriever(settings, repo, embedder)
    rag_service = RAGService(settings, repo, retriever, llm_provider)
    worker_service = IngestionWorkerService(settings, repo, storage, embedder)
    oidc_manager = OIDCFlowManager(settings)
    rate_limiter = RateLimiter(max_per_minute=settings.rate_limit_requests_per_minute)

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Production-oriented Free-First Enterprise RAG Knowledge Assistant API",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    app.state.settings = settings
    app.state.repo = repo
    app.state.storage = storage
    app.state.embedder = embedder
    app.state.llm_provider = llm_provider
    app.state.retriever = retriever
    app.state.rag_service = rag_service
    app.state.worker_service = worker_service
    app.state.oidc_manager = oidc_manager
    app.state.rate_limiter = rate_limiter
    app.state.metrics = {
        "requests_total": 0,
        "errors_total": 0,
        "uploads_total": 0,
        "searches_total": 0,
        "chat_asks_total": 0,
    }

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def request_id_and_security_headers_middleware(request: Request, call_next):
        req_id = get_request_id(request)
        app.state.metrics["requests_total"] += 1
        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = req_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError):
        app.state.metrics["errors_total"] += 1
        return problem_response(
            request=request,
            status_code=exc.status_code,
            error_code=exc.error_code,
            title=exc.title,
            detail=exc.detail,
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception):
        app.state.metrics["errors_total"] += 1
        return problem_response(
            request=request,
            status_code=500,
            error_code="internal_server_error",
            title="Internal Server Error",
            detail="An unexpected server error occurred. Reference the request_id for support.",
        )

    def _issue_session_cookie_response(
        request: Request,
        user: Dict[str, Any],
        tenant: Dict[str, Any],
        role: str,
        payload: Dict[str, Any],
        status_code: int = 200,
    ) -> JSONResponse:
        raw_session_token = generate_opaque_token(32)
        session_id_hash = hash_session_token(raw_session_token)
        csrf_secret = generate_opaque_token(24)
        repo.create_session(
            id_hash=session_id_hash,
            user_id=user["id"],
            tenant_id=tenant["id"],
            csrf_secret=csrf_secret,
            ttl_seconds=settings.session_absolute_ttl_seconds,
            user_agent=request.headers.get("User-Agent", "browser"),
        )
        csrf_token = generate_csrf_token(session_id_hash, csrf_secret, settings.csrf_secret_key)
        repo.record_audit_event(
            tenant_id=tenant["id"],
            actor_id=user["id"],
            action="auth.login",
            resource_type="session",
            resource_id=session_id_hash[:16],
            metadata={"role": role, "email": user["email"]},
            request_id=get_request_id(request),
        )
        body = {**payload, "csrf_token": csrf_token}
        resp = JSONResponse(status_code=status_code, content=body)
        resp.set_cookie(
            key=settings.session_cookie_name,
            value=raw_session_token,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            max_age=settings.session_absolute_ttl_seconds,
            path="/",
        )
        return resp

    # =========================================================================
    # Health, Readiness & Metrics (/healthz, /readyz, /metrics)
    # =========================================================================
    @app.get("/healthz", tags=["Observability"])
    def healthz():
        return {"status": "ok", "service": settings.app_name, "version": settings.app_version}

    @app.get("/readyz", tags=["Observability"])
    def readyz(request: Request):
        active_emb = repo.get_active_embedding_model()
        probe_info = app.state.embedder.describe()
        storage_ok = storage.health()
        dim_match = (
            active_emb is not None
            and int(active_emb["dim"]) == settings.embedding_dim
            and probe_info.dim == settings.embedding_dim
        )
        if not storage_ok or not dim_match:
            return problem_response(
                request,
                503,
                "readiness_check_failed",
                "Service Not Ready",
                f"Readiness failed (storage_ok={storage_ok}, embedding_dim_match={dim_match}).",
            )
        return {
            "status": "ready",
            "database": "connected",
            "storage": "ready",
            "active_embedding_model": active_emb["model_name"],
            "embedding_dim": active_emb["dim"],
            "generation_provider": app.state.llm_provider.describe().provider,
        }

    @app.get("/metrics", tags=["Observability"])
    def metrics_endpoint():
        return app.state.metrics

    # =========================================================================
    # Authentication & Session Routes (/auth/*)
    # =========================================================================
    @app.get("/auth/google/login", tags=["Authentication"])
    def google_login(request: Request, tenant_slug: Optional[str] = None, redirect: bool = False):
        rate_limiter.check(f"login:{request.client.host if request.client else 'local'}", custom_limit=30)
        info = oidc_manager.start_authorization(tenant_slug=tenant_slug)
        if redirect:
            return RedirectResponse(url=info["authorization_url"], status_code=302)
        return info

    @app.post("/auth/google/callback/verify", tags=["Authentication"])
    def google_callback_verify(request: Request, body: MockOIDCCallbackRequest):
        pending = oidc_manager.consume_state(body.state)
        identity = oidc_manager.verify_id_token_claims(body.id_token_claims, expected_nonce=pending.nonce)
        tenant = repo.upsert_tenant(
            slug=pending.tenant_slug,
            name=pending.tenant_slug.replace("-", " ").title(),
        )
        user = repo.upsert_user(
            email=identity["email"],
            full_name=identity["full_name"],
            google_sub=identity["google_sub"],
        )
        memberships = repo.get_user_memberships(user["id"])
        role = "viewer"
        for m in memberships:
            if m["tenant_id"] == tenant["id"]:
                role = m["role"]
                break
        else:
            repo.upsert_membership(tenant["id"], user["id"], role="viewer")
        return _issue_session_cookie_response(
            request=request,
            user=user,
            tenant=tenant,
            role=role,
            payload={"authenticated": True, "user_id": user["id"], "tenant_id": tenant["id"], "role": role},
        )

    @app.post("/auth/dev/login", tags=["Authentication"])
    def dev_login(request: Request, body: DevLoginRequest):
        if not settings.enable_dev_auth or settings.app_env == "production":
            raise AppError(
                403,
                "dev_auth_disabled",
                "Development Login Disabled",
                "Local development login is disabled in this environment.",
            )
        if body.role not in ("viewer", "contributor", "knowledge_admin", "system_admin"):
            raise AppError(400, "invalid_role", "Invalid Role", f"Unsupported role '{body.role}'.")

        slug = body.tenant_slug or settings.default_tenant_slug
        tname = body.tenant_name or settings.default_tenant_name
        tenant = repo.upsert_tenant(slug=slug, name=tname)
        user = repo.upsert_user(email=body.email, full_name=body.full_name)
        repo.upsert_membership(tenant["id"], user["id"], role=body.role)
        return _issue_session_cookie_response(
            request=request,
            user=user,
            tenant=tenant,
            role=body.role,
            payload={
                "authenticated": True,
                "user": {"id": user["id"], "email": user["email"], "full_name": user["full_name"]},
                "tenant": {"id": tenant["id"], "slug": tenant["slug"], "name": tenant["name"], "role": body.role},
            },
        )

    @app.post("/auth/logout", status_code=204, tags=["Authentication"])
    def logout(request: Request):
        session = resolve_authenticated_session(request, require_csrf=True)
        repo.revoke_session(session["id_hash"], user_id=session["user_id"])
        repo.record_audit_event(
            tenant_id=session["tenant_id"],
            actor_id=session["user_id"],
            action="auth.logout",
            resource_type="session",
            resource_id=session["id_hash"][:16],
            request_id=get_request_id(request),
        )
        resp = Response(status_code=204)
        resp.delete_cookie(settings.session_cookie_name, path="/")
        return resp

    # =========================================================================
    # User Profile & Session Management (/api/v1/me, /api/v1/sessions)
    # =========================================================================
    @app.get("/api/v1/me", tags=["Identity"])
    def get_current_user(request: Request):
        session = resolve_authenticated_session(request, require_csrf=False)
        memberships = repo.get_user_memberships(session["user_id"])
        emb_info = app.state.embedder.describe()
        llm_info = app.state.llm_provider.describe()
        prefs = json.loads(session.get("preferences_json") or "{}")
        return {
            "id": session["user_id"],
            "email": session["email"],
            "full_name": session["full_name"],
            "preferences": prefs,
            "active_tenant": {
                "id": session["tenant_id"],
                "slug": session["tenant_slug"],
                "name": session["tenant_name"],
                "role": session["role"],
            },
            "memberships": [
                {"id": m["tenant_id"], "slug": m["slug"], "name": m["name"], "role": m["role"]}
                for m in memberships
            ],
            "csrf_token": session["csrf_token"],
            "features": {
                "embedding_provider": emb_info.provider,
                "embedding_model": emb_info.model_name,
                "embedding_dim": emb_info.dim,
                "generation_provider": llm_info.provider,
                "generation_model": llm_info.model_name if llm_info.provider != "none" else None,
                "generation_available": llm_info.provider != "none",
                "dev_auth_enabled": settings.enable_dev_auth and settings.app_env != "production",
            },
            "request_id": get_request_id(request),
        }

    @app.put("/api/v1/me/preferences", tags=["Identity"])
    def update_preferences(request: Request, body: UpdatePreferencesRequest):
        session = resolve_authenticated_session(request, require_csrf=True)
        updated = repo.update_user_preferences(session["user_id"], body.dict())
        return {"preferences": json.loads(updated["preferences_json"]), "request_id": get_request_id(request)}

    @app.get("/api/v1/sessions", tags=["Identity"])
    def list_sessions(request: Request):
        session = resolve_authenticated_session(request, require_csrf=False)
        rows = repo.list_user_sessions(session["user_id"], session["tenant_id"])
        for r in rows:
            r["is_current"] = r["id_hash"] == session["id_hash"]
            r["session_id_prefix"] = r.pop("id_hash")[:12]
        return {"sessions": rows, "request_id": get_request_id(request)}

    @app.post("/api/v1/sessions/revoke-others", tags=["Identity"])
    def revoke_other_sessions(request: Request):
        session = resolve_authenticated_session(request, require_csrf=True)
        rows = repo.list_user_sessions(session["user_id"], session["tenant_id"])
        revoked_count = 0
        for r in rows:
            if r["id_hash"] != session["id_hash"]:
                if repo.revoke_session(r["id_hash"], user_id=session["user_id"]):
                    revoked_count += 1
        return {"revoked_count": revoked_count, "request_id": get_request_id(request)}

    # =========================================================================
    # Documents, Upload, Reindex, ACL & Deletion (/api/v1/documents/*)
    # =========================================================================
    @app.post("/api/v1/documents", status_code=202, tags=["Documents"])
    async def upload_document(
        request: Request,
        file: UploadFile = File(...),
        title: Optional[str] = Form(default=None),
        visibility: str = Form(default="tenant"),
        process_sync: bool = Form(default=True),
    ):
        session = resolve_authenticated_session(request, require_csrf=True)
        require_min_role(session, "contributor")
        rate_limiter.check(f"upload:{session['user_id']}", custom_limit=30)

        if visibility not in ("tenant", "restricted", "owner"):
            raise AppError(400, "invalid_visibility", "Invalid Visibility", "Visibility must be tenant, restricted, or owner.")

        raw_bytes = await file.read()
        try:
            validated = validate_uploaded_file(
                filename=file.filename or "upload.txt",
                data=raw_bytes,
                max_upload_size_mb=settings.max_upload_size_mb,
            )
        except FileValidationError as exc:
            raise AppError(exc.status_code, exc.error_code, "File Validation Failed", exc.message) from exc

        # Check tenant storage quota
        used_bytes = repo.get_tenant_storage_used(session["tenant_id"])
        quota_bytes = settings.tenant_storage_quota_mb * 1024 * 1024
        if used_bytes + validated.size_bytes > quota_bytes:
            raise AppError(
                413,
                "tenant_storage_quota_exceeded",
                "Storage Quota Exceeded",
                "Uploading this file would exceed the tenant storage quota.",
            )

        storage_key = storage.put(
            tenant_id=session["tenant_id"],
            extension=validated.extension,
            data=raw_bytes,
            quarantine=False,
        )
        doc_title = (title or "").strip() or validated.sanitized_filename
        try:
            doc, job, is_dup = repo.create_document_and_enqueue_job(
                tenant_id=session["tenant_id"],
                owner_id=session["user_id"],
                title=doc_title,
                filename=validated.sanitized_filename,
                mime_type=validated.detected_mime,
                size_bytes=validated.size_bytes,
                sha256=validated.sha256,
                storage_key=storage_key,
                visibility=visibility,
            )
        except Exception:
            storage.delete(storage_key)
            raise

        if is_dup:
            # Remove duplicate blob we just wrote since existing document is returned
            storage.delete(storage_key)
            return {
                "document_id": doc["id"],
                "status": doc["status"],
                "active_version": doc["active_version"],
                "duplicate": True,
                "job_id": job.get("id"),
                "request_id": get_request_id(request),
            }

        app.state.metrics["uploads_total"] += 1
        repo.record_audit_event(
            tenant_id=session["tenant_id"],
            actor_id=session["user_id"],
            action="document.upload",
            resource_type="document",
            resource_id=doc["id"],
            metadata={"filename": validated.sanitized_filename, "size_bytes": validated.size_bytes, "visibility": visibility},
            request_id=get_request_id(request),
        )

        # In single-container local/dev mode, optionally process immediately so UX is snappy while still using the DB job queue
        if process_sync:
            worker_service.process_next_job()
            refreshed = repo.get_authorized_document(
                session["tenant_id"], session["user_id"], session["role"], doc["id"]
            )
            if refreshed:
                doc = refreshed

        return {
            "document_id": doc["id"],
            "status": doc["status"],
            "active_version": doc["active_version"],
            "duplicate": False,
            "job_id": job["id"],
            "request_id": get_request_id(request),
        }

    @app.get("/api/v1/documents", tags=["Documents"])
    def list_documents(
        request: Request,
        status: Optional[str] = None,
        q: Optional[str] = None,
        cursor: int = 0,
        limit: int = 50,
    ):
        session = resolve_authenticated_session(request, require_csrf=False)
        docs = repo.list_authorized_documents(
            tenant_id=session["tenant_id"],
            user_id=session["user_id"],
            role=session["role"],
            status_filter=status,
            search_query=q,
        )
        sliced = docs[cursor : cursor + limit]
        next_cursor = cursor + limit if cursor + limit < len(docs) else None
        return {
            "items": sliced,
            "total": len(docs),
            "next_cursor": next_cursor,
            "request_id": get_request_id(request),
        }

    @app.get("/api/v1/documents/{document_id}", tags=["Documents"])
    def get_document_details(request: Request, document_id: str):
        session = resolve_authenticated_session(request, require_csrf=False)
        doc = repo.get_authorized_document(
            tenant_id=session["tenant_id"],
            user_id=session["user_id"],
            role=session["role"],
            document_id=document_id,
        )
        if not doc:
            raise AppError(404, "document_not_found", "Document Not Found", "Document does not exist or you do not have access.")
        return {**doc, "request_id": get_request_id(request)}

    @app.get("/api/v1/documents/{document_id}/file", tags=["Documents"])
    def download_document_file(request: Request, document_id: str):
        session = resolve_authenticated_session(request, require_csrf=False)
        doc = repo.get_authorized_document(
            tenant_id=session["tenant_id"],
            user_id=session["user_id"],
            role=session["role"],
            document_id=document_id,
        )
        if not doc:
            raise AppError(404, "document_not_found", "Document Not Found", "Document does not exist or you do not have access.")

        raw_bytes = storage.get(doc["storage_key"])
        repo.record_audit_event(
            tenant_id=session["tenant_id"],
            actor_id=session["user_id"],
            action="document.download",
            resource_type="document",
            resource_id=document_id,
            request_id=get_request_id(request),
        )
        return Response(
            content=raw_bytes,
            media_type=doc["mime_type"],
            headers={
                "Content-Disposition": f'attachment; filename="{doc["filename"]}"',
                "X-Content-Type-Options": "nosniff",
            },
        )

    @app.put("/api/v1/documents/{document_id}/acl", tags=["Documents"])
    def update_document_acl(request: Request, document_id: str, body: UpdateACLRequest):
        session = resolve_authenticated_session(request, require_csrf=True)
        doc = repo.get_authorized_document(
            tenant_id=session["tenant_id"],
            user_id=session["user_id"],
            role=session["role"],
            document_id=document_id,
        )
        if not doc:
            raise AppError(404, "document_not_found", "Document Not Found", "Document not found.")
        if doc["owner_id"] != session["user_id"] and session["role"] not in ("knowledge_admin", "system_admin"):
            raise AppError(403, "forbidden", "Forbidden", "Only the document owner or an administrator can modify ACLs.")

        repo.set_document_acl(
            tenant_id=session["tenant_id"],
            document_id=document_id,
            visibility=body.visibility,
            acl_entries=body.acl_entries,
        )
        repo.record_audit_event(
            tenant_id=session["tenant_id"],
            actor_id=session["user_id"],
            action="document.acl_updated",
            resource_type="document",
            resource_id=document_id,
            metadata={"visibility": body.visibility, "acl_count": len(body.acl_entries)},
            request_id=get_request_id(request),
        )
        updated = repo.get_authorized_document(
            session["tenant_id"], session["user_id"], session["role"], document_id
        )
        return {**(updated or {}), "request_id": get_request_id(request)}

    @app.post("/api/v1/documents/{document_id}/reindex", status_code=202, tags=["Documents"])
    def reindex_document(request: Request, document_id: str, process_sync: bool = True):
        session = resolve_authenticated_session(request, require_csrf=True)
        doc = repo.get_authorized_document(
            tenant_id=session["tenant_id"],
            user_id=session["user_id"],
            role=session["role"],
            document_id=document_id,
        )
        if not doc:
            raise AppError(404, "document_not_found", "Document Not Found", "Document not found.")
        if doc["owner_id"] != session["user_id"] and session["role"] not in ("knowledge_admin", "system_admin"):
            raise AppError(403, "forbidden", "Forbidden", "Only the owner or an administrator can reindex this document.")

        try:
            ver, job = repo.create_reindex_version_and_job(session["tenant_id"], document_id)
        except ValueError as exc:
            if "job_already_running" in str(exc):
                raise AppError(409, "job_already_running", "Ingestion Already Running", "An ingestion job is already active for this document.") from exc
            raise

        repo.record_audit_event(
            tenant_id=session["tenant_id"],
            actor_id=session["user_id"],
            action="document.reindex",
            resource_type="document",
            resource_id=document_id,
            metadata={"new_version": ver["version"], "job_id": job["id"]},
            request_id=get_request_id(request),
        )
        if process_sync:
            worker_service.process_next_job()

        return {"document_id": document_id, "version": ver["version"], "job_id": job["id"], "request_id": get_request_id(request)}

    @app.delete("/api/v1/documents/{document_id}", status_code=202, tags=["Documents"])
    def delete_document(request: Request, document_id: str):
        session = resolve_authenticated_session(request, require_csrf=True)
        doc = repo.get_authorized_document(
            tenant_id=session["tenant_id"],
            user_id=session["user_id"],
            role=session["role"],
            document_id=document_id,
        )
        if not doc:
            raise AppError(404, "document_not_found", "Document Not Found", "Document not found.")
        if doc["owner_id"] != session["user_id"] and session["role"] not in ("knowledge_admin", "system_admin"):
            raise AppError(403, "forbidden", "Forbidden", "Only the document owner or an administrator can delete this document.")

        repo.soft_delete_and_purge_document(
            tenant_id=session["tenant_id"],
            document_id=document_id,
            actor_id=session["user_id"],
            storage_backend=storage,
        )
        return {"deleted": True, "document_id": document_id, "request_id": get_request_id(request)}

    @app.get("/api/v1/documents/{document_id}/ingestion", tags=["Documents"])
    def get_document_ingestion_status(request: Request, document_id: str):
        session = resolve_authenticated_session(request, require_csrf=False)
        doc = repo.get_authorized_document(
            tenant_id=session["tenant_id"],
            user_id=session["user_id"],
            role=session["role"],
            document_id=document_id,
        )
        if not doc:
            raise AppError(404, "document_not_found", "Document Not Found", "Document not found.")
        return {
            "document_id": doc["id"],
            "status": doc["status"],
            "active_version": doc["active_version"],
            "error_code": doc["error_code"],
            "jobs": doc.get("jobs", []),
            "request_id": get_request_id(request),
        }

    @app.post("/api/v1/ingestion-jobs/{job_id}/retry", status_code=202, tags=["Documents"])
    def retry_ingestion_job(request: Request, job_id: str, process_sync: bool = True):
        session = resolve_authenticated_session(request, require_csrf=True)
        require_min_role(session, "contributor")
        try:
            job = repo.retry_failed_job(session["tenant_id"], job_id)
        except KeyError as exc:
            raise AppError(404, "job_not_found", "Job Not Found", "Ingestion job not found.") from exc
        except ValueError as exc:
            raise AppError(409, "non_retryable_job", "Job Cannot Be Retried", str(exc)) from exc

        if process_sync:
            worker_service.process_next_job()
        return {"job": job, "request_id": get_request_id(request)}

    # =========================================================================
    # Hybrid Search, RAG Chat, Conversations & Citations
    # =========================================================================
    @app.post("/api/v1/search", tags=["Retrieval & Chat"])
    def retrieval_only_search(request: Request, body: SearchRequest):
        session = resolve_authenticated_session(request, require_csrf=True)
        rate_limiter.check(f"search:{session['user_id']}")
        app.state.metrics["searches_total"] += 1

        res = app.state.retriever.retrieve(
            tenant_id=session["tenant_id"],
            user_id=session["user_id"],
            role=session["role"],
            query=body.query,
            top_k=body.top_k,
        )
        return {
            "query": body.query,
            "mode": res["mode"],
            "total_candidates": res["total_candidates"],
            "passages": res["passages"],
            "notice": "Retrieved passages from authorized active documents (retrieval-only, not an AI-generated answer).",
            "request_id": get_request_id(request),
        }

    @app.post("/api/v1/chat/ask", tags=["Retrieval & Chat"])
    def chat_ask(request: Request, body: ChatAskRequest):
        session = resolve_authenticated_session(request, require_csrf=True)
        rate_limiter.check(f"chat:{session['user_id']}")
        app.state.metrics["chat_asks_total"] += 1

        try:
            result = app.state.rag_service.ask(
                tenant_id=session["tenant_id"],
                user_id=session["user_id"],
                role=session["role"],
                question=body.question,
                conversation_id=body.conversation_id,
                top_k=body.top_k,
            )
        except KeyError as exc:
            raise AppError(404, "conversation_not_found", "Conversation Not Found", "Conversation not found.") from exc

        return {**result, "request_id": get_request_id(request)}

    @app.post("/api/v1/chat/ask/stream", tags=["Retrieval & Chat"])
    def chat_ask_stream(request: Request, body: ChatAskRequest):
        session = resolve_authenticated_session(request, require_csrf=True)
        rate_limiter.check(f"chat:{session['user_id']}")
        result = app.state.rag_service.ask(
            tenant_id=session["tenant_id"],
            user_id=session["user_id"],
            role=session["role"],
            question=body.question,
            conversation_id=body.conversation_id,
            top_k=body.top_k,
        )

        def event_stream():
            if result.get("answer"):
                for token in result["answer"].split(" "):
                    yield f"data: {json.dumps({'type': 'token', 'text': token + ' '})}\n\n"
            yield f"data: {json.dumps({'type': 'final', 'payload': {**result, 'request_id': get_request_id(request)}})}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @app.get("/api/v1/conversations", tags=["Retrieval & Chat"])
    def list_conversations(request: Request):
        session = resolve_authenticated_session(request, require_csrf=False)
        items = repo.list_user_conversations(session["tenant_id"], session["user_id"])
        return {"items": items, "request_id": get_request_id(request)}

    @app.get("/api/v1/conversations/{conversation_id}", tags=["Retrieval & Chat"])
    def get_conversation(request: Request, conversation_id: str):
        session = resolve_authenticated_session(request, require_csrf=False)
        conv = repo.get_user_conversation(
            tenant_id=session["tenant_id"],
            user_id=session["user_id"],
            role=session["role"],
            conversation_id=conversation_id,
        )
        if not conv:
            raise AppError(404, "conversation_not_found", "Conversation Not Found", "Conversation not found.")
        return {**conv, "request_id": get_request_id(request)}

    @app.delete("/api/v1/conversations/{conversation_id}", status_code=204, tags=["Retrieval & Chat"])
    def delete_conversation(request: Request, conversation_id: str):
        session = resolve_authenticated_session(request, require_csrf=True)
        deleted = repo.delete_user_conversation(session["tenant_id"], session["user_id"], conversation_id)
        if not deleted:
            raise AppError(404, "conversation_not_found", "Conversation Not Found", "Conversation not found.")
        return Response(status_code=204)

    @app.get("/api/v1/sources/{chunk_id}", tags=["Retrieval & Chat"])
    def get_authorized_source_citation(request: Request, chunk_id: str):
        session = resolve_authenticated_session(request, require_csrf=False)
        chunk = repo.get_authorized_source_chunk(
            tenant_id=session["tenant_id"],
            user_id=session["user_id"],
            role=session["role"],
            chunk_id=chunk_id,
        )
        if not chunk:
            raise AppError(
                404,
                "source_not_available",
                "Source Not Available",
                "The requested source citation does not exist or access is not authorized.",
            )
        repo.record_audit_event(
            tenant_id=session["tenant_id"],
            actor_id=session["user_id"],
            action="source.inspect",
            resource_type="chunk",
            resource_id=chunk_id,
            metadata={"document_id": chunk["document_id"]},
            request_id=get_request_id(request),
        )
        return {**chunk, "request_id": get_request_id(request)}

    @app.post("/api/v1/feedback", status_code=201, tags=["Retrieval & Chat"])
    def submit_feedback(request: Request, body: FeedbackRequest):
        session = resolve_authenticated_session(request, require_csrf=True)
        rec = repo.record_feedback(
            tenant_id=session["tenant_id"],
            user_id=session["user_id"],
            rating=body.rating,
            message_id=body.message_id,
            chunk_id=body.chunk_id,
            comment=body.comment,
        )
        return {**rec, "request_id": get_request_id(request)}

    # =========================================================================
    # Administration Endpoints (/api/v1/admin/*)
    # =========================================================================
    @app.get("/api/v1/admin/users", tags=["Administration"])
    def admin_list_users(request: Request):
        session = resolve_authenticated_session(request, require_csrf=False)
        require_min_role(session, "knowledge_admin")
        users = repo.list_tenant_users(session["tenant_id"])
        return {"users": users, "request_id": get_request_id(request)}

    @app.put("/api/v1/admin/users/role", tags=["Administration"])
    def admin_update_user_role(request: Request, body: UpdateRoleRequest):
        session = resolve_authenticated_session(request, require_csrf=True)
        require_min_role(session, "system_admin")
        updated = repo.upsert_membership(session["tenant_id"], body.user_id, body.role)
        repo.revoke_all_user_sessions(body.user_id, session["tenant_id"])
        repo.record_audit_event(
            tenant_id=session["tenant_id"],
            actor_id=session["user_id"],
            action="admin.role_updated",
            resource_type="user",
            resource_id=body.user_id,
            metadata={"new_role": body.role},
            request_id=get_request_id(request),
        )
        return {"membership": updated, "request_id": get_request_id(request)}

    @app.get("/api/v1/admin/jobs", tags=["Administration"])
    def admin_list_jobs(request: Request, status: Optional[str] = None):
        session = resolve_authenticated_session(request, require_csrf=False)
        require_min_role(session, "knowledge_admin")
        jobs = repo.list_ingestion_jobs(session["tenant_id"], status_filter=status)
        return {"jobs": jobs, "request_id": get_request_id(request)}

    @app.get("/api/v1/admin/audit", tags=["Administration"])
    def admin_list_audit_events(request: Request, limit: int = 50):
        session = resolve_authenticated_session(request, require_csrf=False)
        require_min_role(session, "knowledge_admin")
        events = repo.list_audit_events(session["tenant_id"], limit=limit)
        return {"events": events, "request_id": get_request_id(request)}

    @app.get("/api/v1/admin/usage", tags=["Administration"])
    def admin_get_usage(request: Request):
        session = resolve_authenticated_session(request, require_csrf=False)
        require_min_role(session, "knowledge_admin")
        summary = repo.get_usage_summary(session["tenant_id"])
        return {**summary, "request_id": get_request_id(request)}

    @app.get("/api/v1/admin/providers", tags=["Administration"])
    def admin_get_providers(request: Request):
        session = resolve_authenticated_session(request, require_csrf=False)
        require_min_role(session, "knowledge_admin")
        emb_health = app.state.embedder.health()
        llm_health = app.state.llm_provider.health()
        models = repo.list_embedding_models()
        return {
            "embedding_provider": emb_health,
            "generation_provider": llm_health,
            "embedding_models_registry": models,
            "allow_training_use_providers": settings.allow_training_use_providers,
            "request_id": get_request_id(request),
        }

    @app.post("/api/v1/admin/providers/test", tags=["Administration"])
    def admin_test_providers(request: Request):
        session = resolve_authenticated_session(request, require_csrf=True)
        require_min_role(session, "system_admin")
        probe = app.state.embedder.embed_query("health probe test")
        return {
            "embedding_probe_ok": len(probe.vectors[0]) == settings.embedding_dim,
            "embedding_dim": len(probe.vectors[0]),
            "embedding_latency_ms": probe.latency_ms,
            "generation_health": app.state.llm_provider.health(),
            "request_id": get_request_id(request),
        }

    @app.post("/api/v1/admin/embedding-migrations", status_code=202, tags=["Administration"])
    def admin_start_embedding_migration(request: Request, body: StartEmbeddingMigrationRequest):
        session = resolve_authenticated_session(request, require_csrf=True)
        require_min_role(session, "system_admin")
        try:
            row = repo.start_embedding_migration(
                provider=body.provider,
                model_name=body.model_name,
                revision=body.revision,
                dim=body.dim,
                max_input_tokens=body.max_input_tokens,
                query_prefix=body.query_prefix,
                document_prefix=body.document_prefix,
                promote_immediately=body.promote_immediately,
            )
        except ValueError as exc:
            raise AppError(
                409,
                "migration_already_running",
                "Migration Already Running",
                "An embedding migration is already in 'building' state.",
            ) from exc

        repo.record_audit_event(
            tenant_id=session["tenant_id"],
            actor_id=session["user_id"],
            action="admin.embedding_migration_started",
            resource_type="embedding_model",
            resource_id=row["id"],
            metadata={"model_name": body.model_name, "dim": body.dim, "status": row["status"]},
            request_id=get_request_id(request),
        )
        return {"embedding_model": row, "request_id": get_request_id(request)}

    return app


app = create_app()
