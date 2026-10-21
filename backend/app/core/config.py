import os
from dataclasses import dataclass, field
from typing import List, Optional

VALID_EMBEDDING_PROVIDERS = {"sentence_transformers", "gemini", "openai", "mock"}
VALID_GENERATION_PROVIDERS = {"none", "openai_compatible", "gemini", "openai", "anthropic", "mock"}


class ConfigurationError(RuntimeError):
    """Raised at startup when configuration contract validation fails."""


@dataclass
class Settings:
    app_name: str = field(default_factory=lambda: os.getenv("APP_NAME", "Enterprise Knowledge Assistant"))
    app_env: str = field(default_factory=lambda: os.getenv("APP_ENV", "development").lower())
    app_version: str = field(default_factory=lambda: os.getenv("APP_VERSION", "2.0.0"))
    api_host: str = field(default_factory=lambda: os.getenv("API_HOST", "0.0.0.0"))
    api_port: int = field(default_factory=lambda: int(os.getenv("API_PORT", "8000")))
    web_origin: str = field(default_factory=lambda: os.getenv("WEB_ORIGIN", "http://localhost:3000"))
    cors_origins: List[str] = field(
        default_factory=lambda: [
            o.strip()
            for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
            if o.strip()
        ]
    )

    database_url: str = field(
        default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./var/eka_local.db")
    )

    # Auth & Security
    session_secret_key: str = field(
        default_factory=lambda: os.getenv(
            "SESSION_SECRET_KEY", "dev-session-secret-key-change-in-production-0123456789abcdef"
        )
    )
    csrf_secret_key: str = field(
        default_factory=lambda: os.getenv(
            "CSRF_SECRET_KEY", "dev-csrf-secret-key-change-in-production-abcdef0123456789"
        )
    )
    session_cookie_name: str = field(default_factory=lambda: os.getenv("SESSION_COOKIE_NAME", "eka_session"))
    session_idle_ttl_seconds: int = field(
        default_factory=lambda: int(os.getenv("SESSION_IDLE_TTL_SECONDS", "28800"))
    )
    session_absolute_ttl_seconds: int = field(
        default_factory=lambda: int(os.getenv("SESSION_ABSOLUTE_TTL_SECONDS", "86400"))
    )
    cookie_secure: bool = field(
        default_factory=lambda: os.getenv("COOKIE_SECURE", "false").lower() in ("true", "1", "yes")
    )

    google_client_id: str = field(default_factory=lambda: os.getenv("GOOGLE_CLIENT_ID", ""))
    google_client_secret: str = field(default_factory=lambda: os.getenv("GOOGLE_CLIENT_SECRET", ""))
    google_redirect_uri: str = field(
        default_factory=lambda: os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
    )
    allowed_email_domains: List[str] = field(
        default_factory=lambda: [
            d.strip().lower()
            for d in os.getenv("ALLOWED_EMAIL_DOMAINS", "").split(",")
            if d.strip()
        ]
    )
    enable_dev_auth: bool = field(
        default_factory=lambda: os.getenv("ENABLE_DEV_AUTH", "true").lower() in ("true", "1", "yes")
    )
    default_tenant_slug: str = field(
        default_factory=lambda: os.getenv("DEFAULT_TENANT_SLUG", "acme-enterprise")
    )
    default_tenant_name: str = field(
        default_factory=lambda: os.getenv("DEFAULT_TENANT_NAME", "Acme Enterprise Knowledge Base")
    )

    # Storage
    storage_backend: str = field(default_factory=lambda: os.getenv("STORAGE_BACKEND", "local").lower())
    local_storage_path: str = field(default_factory=lambda: os.getenv("LOCAL_STORAGE_PATH", "./var/storage"))
    s3_endpoint_url: Optional[str] = field(default_factory=lambda: os.getenv("S3_ENDPOINT_URL") or None)
    s3_bucket: str = field(default_factory=lambda: os.getenv("S3_BUCKET", "eka-documents-private"))
    max_upload_size_mb: int = field(default_factory=lambda: int(os.getenv("MAX_UPLOAD_SIZE_MB", "25")))
    tenant_storage_quota_mb: int = field(
        default_factory=lambda: int(os.getenv("TENANT_STORAGE_QUOTA_MB", "500"))
    )

    # Embeddings (Free-first local default: BAAI/bge-small-en-v1.5, 384 dim, CPU)
    embedding_provider: str = field(
        default_factory=lambda: os.getenv("EMBEDDING_PROVIDER", "sentence_transformers").lower()
    )
    embedding_model: str = field(
        default_factory=lambda: os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
    )
    embedding_revision: str = field(default_factory=lambda: os.getenv("EMBEDDING_REVISION", "main"))
    embedding_dim: int = field(default_factory=lambda: int(os.getenv("EMBEDDING_DIM", "384")))
    embedding_device: str = field(default_factory=lambda: os.getenv("EMBEDDING_DEVICE", "cpu"))
    embedding_batch_size: int = field(default_factory=lambda: int(os.getenv("EMBEDDING_BATCH_SIZE", "32")))
    embedding_timeout_s: float = field(default_factory=lambda: float(os.getenv("EMBEDDING_TIMEOUT_S", "30")))

    # Generation (Disabled / retrieval-only by default)
    generation_provider: str = field(
        default_factory=lambda: os.getenv("GENERATION_PROVIDER", "none").lower()
    )
    generation_model: str = field(default_factory=lambda: os.getenv("GENERATION_MODEL", "").strip())
    generation_base_url: str = field(
        default_factory=lambda: os.getenv("GENERATION_BASE_URL", "http://localhost:8080/v1").strip()
    )
    generation_timeout_s: float = field(default_factory=lambda: float(os.getenv("GENERATION_TIMEOUT_S", "45")))
    max_context_tokens: int = field(default_factory=lambda: int(os.getenv("MAX_CONTEXT_TOKENS", "3000")))
    max_output_tokens: int = field(default_factory=lambda: int(os.getenv("MAX_OUTPUT_TOKENS", "768")))
    provider_concurrency: int = field(default_factory=lambda: int(os.getenv("PROVIDER_CONCURRENCY", "4")))
    allow_training_use_providers: bool = field(
        default_factory=lambda: os.getenv("ALLOW_TRAINING_USE_PROVIDERS", "false").lower()
        in ("true", "1", "yes")
    )
    gemini_tier_is_free: bool = field(
        default_factory=lambda: os.getenv("GEMINI_TIER_IS_FREE", "true").lower() in ("true", "1", "yes")
    )

    # Secrets
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", "").strip())
    openai_api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", "").strip())
    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", "").strip())

    # Retrieval & Chunking
    chunk_target_tokens: int = field(default_factory=lambda: int(os.getenv("CHUNK_TARGET_TOKENS", "350")))
    chunk_overlap_tokens: int = field(default_factory=lambda: int(os.getenv("CHUNK_OVERLAP_TOKENS", "50")))
    retrieval_top_k: int = field(default_factory=lambda: int(os.getenv("RETRIEVAL_TOP_K", "6")))
    rrf_k: int = field(default_factory=lambda: int(os.getenv("RRF_K", "60")))
    vector_weight: float = field(default_factory=lambda: float(os.getenv("VECTOR_WEIGHT", "1.0")))
    fts_weight: float = field(default_factory=lambda: float(os.getenv("FTS_WEIGHT", "1.0")))
    min_evidence_score: float = field(default_factory=lambda: float(os.getenv("MIN_EVIDENCE_SCORE", "0.012")))
    rate_limit_requests_per_minute: int = field(
        default_factory=lambda: int(os.getenv("RATE_LIMIT_REQUESTS_PER_MINUTE", "120"))
    )

    def validate_startup(self) -> None:
        """Enforce Section 5.3 & Section 7 startup configuration invariants."""
        if self.embedding_provider not in VALID_EMBEDDING_PROVIDERS:
            raise ConfigurationError(
                f"Unknown EMBEDDING_PROVIDER '{self.embedding_provider}'. "
                f"Allowed: {sorted(VALID_EMBEDDING_PROVIDERS)}"
            )
        if self.generation_provider not in VALID_GENERATION_PROVIDERS:
            raise ConfigurationError(
                f"Unknown GENERATION_PROVIDER '{self.generation_provider}'. "
                f"Allowed: {sorted(VALID_GENERATION_PROVIDERS)}"
            )
        if self.embedding_dim <= 0 or self.embedding_dim > 4000:
            raise ConfigurationError(f"Invalid EMBEDDING_DIM={self.embedding_dim}; must be between 1 and 4000.")

        # Production security checks
        if self.app_env == "production":
            if self.enable_dev_auth:
                raise ConfigurationError("ENABLE_DEV_AUTH must be false when APP_ENV=production.")
            if "dev-session-secret" in self.session_secret_key or len(self.session_secret_key) < 32:
                raise ConfigurationError("Production requires a strong SESSION_SECRET_KEY (>= 32 chars).")
            if "dev-csrf-secret" in self.csrf_secret_key or len(self.csrf_secret_key) < 32:
                raise ConfigurationError("Production requires a strong CSRF_SECRET_KEY (>= 32 chars).")
            if not self.cookie_secure:
                raise ConfigurationError("COOKIE_SECURE must be true in production.")

        # Provider credential & model ID checks
        if self.embedding_provider == "gemini" and not self.gemini_api_key:
            raise ConfigurationError("EMBEDDING_PROVIDER=gemini requires GEMINI_API_KEY.")
        if self.embedding_provider == "openai" and not self.openai_api_key:
            raise ConfigurationError("EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY.")

        if self.generation_provider != "none":
            if not self.generation_model and self.generation_provider != "mock":
                raise ConfigurationError(
                    f"GENERATION_PROVIDER={self.generation_provider} requires an explicit GENERATION_MODEL env var."
                )
            if "argon" in self.generation_model.lower():
                raise ConfigurationError(
                    "Invalid GENERATION_MODEL: coding agent model names (such as Argon) must not be used as runtime API models."
                )
            if self.generation_provider == "gemini":
                if not self.gemini_api_key:
                    raise ConfigurationError("GENERATION_PROVIDER=gemini requires GEMINI_API_KEY.")
                if self.gemini_tier_is_free and not self.allow_training_use_providers:
                    raise ConfigurationError(
                        "Gemini free tier is flagged data_used_for_training=true. "
                        "Set ALLOW_TRAINING_USE_PROVIDERS=true only for non-confidential demo data, "
                        "or set GEMINI_TIER_IS_FREE=false with a paid billing account."
                    )
            elif self.generation_provider == "openai" and not self.openai_api_key:
                raise ConfigurationError("GENERATION_PROVIDER=openai requires OPENAI_API_KEY.")
            elif self.generation_provider == "anthropic" and not self.anthropic_api_key:
                raise ConfigurationError("GENERATION_PROVIDER=anthropic requires ANTHROPIC_API_KEY.")
            elif self.generation_provider == "openai_compatible" and not self.generation_base_url:
                raise ConfigurationError("GENERATION_PROVIDER=openai_compatible requires GENERATION_BASE_URL.")


def get_settings() -> Settings:
    settings = Settings()
    settings.validate_startup()
    return settings
