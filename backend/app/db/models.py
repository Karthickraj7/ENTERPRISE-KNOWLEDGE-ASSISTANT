"""SQLAlchemy 2 Declarative Models for Enterprise Knowledge Assistant.

Matches the 17 normalized tables in migrations/versions/0001_initial_schema.py.
"""
try:
    from sqlalchemy import (
        BigInteger,
        Boolean,
        Column,
        DateTime,
        Float,
        ForeignKey,
        ForeignKeyConstraint,
        Index,
        Integer,
        String,
        Text,
        UniqueConstraint,
        func,
    )
    from sqlalchemy.orm import declarative_base

    Base = declarative_base()

    class Tenant(Base):
        __tablename__ = "tenants"
        id = Column(String(64), primary_key=True)
        slug = Column(String(120), nullable=False, unique=True)
        name = Column(String(255), nullable=False)
        storage_quota_bytes = Column(BigInteger, nullable=False, default=524288000)
        allowed_providers = Column(Text, nullable=False, default="none,openai_compatible")
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    class User(Base):
        __tablename__ = "users"
        id = Column(String(64), primary_key=True)
        google_sub = Column(String(255), nullable=True, unique=True)
        email = Column(String(320), nullable=False, unique=True)
        full_name = Column(String(255), nullable=False)
        status = Column(String(32), nullable=False, default="active")
        preferences_json = Column(Text, nullable=False, default="{}")
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    class TenantMembership(Base):
        __tablename__ = "tenant_memberships"
        tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
        user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
        role = Column(String(32), nullable=False, default="viewer")
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    class SessionRecord(Base):
        __tablename__ = "sessions"
        id_hash = Column(String(128), primary_key=True)
        user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
        tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
        csrf_secret = Column(String(128), nullable=False)
        user_agent = Column(String(512), nullable=True)
        ip_hash = Column(String(128), nullable=True)
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
        last_seen_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
        expires_at = Column(DateTime(timezone=True), nullable=False)
        revoked_at = Column(DateTime(timezone=True), nullable=True)

    class EmbeddingModelRecord(Base):
        __tablename__ = "embedding_models"
        id = Column(String(64), primary_key=True)
        provider = Column(String(64), nullable=False)
        model_name = Column(String(255), nullable=False)
        revision = Column(String(128), nullable=False, default="main")
        dim = Column(Integer, nullable=False)
        max_input_tokens = Column(Integer, nullable=False, default=512)
        normalize = Column(Boolean, nullable=False, default=True)
        query_prefix = Column(String(255), nullable=False, default="")
        document_prefix = Column(String(255), nullable=False, default="")
        status = Column(String(32), nullable=False, default="active")
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    class Document(Base):
        __tablename__ = "documents"
        id = Column(String(64), primary_key=True)
        tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
        owner_id = Column(String(64), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
        title = Column(String(512), nullable=False)
        filename = Column(String(512), nullable=False)
        mime_type = Column(String(128), nullable=False)
        size_bytes = Column(BigInteger, nullable=False)
        sha256 = Column(String(64), nullable=False)
        storage_key = Column(String(512), nullable=False)
        visibility = Column(String(32), nullable=False, default="tenant")
        active_version = Column(Integer, nullable=False, default=0)
        status = Column(String(32), nullable=False, default="queued")
        error_code = Column(String(64), nullable=True)
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
        updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
        deleted_at = Column(DateTime(timezone=True), nullable=True)
        __table_args__ = (UniqueConstraint("tenant_id", "id", name="uq_documents_tenant_id_id"),)

    class DocumentVersion(Base):
        __tablename__ = "document_versions"
        id = Column(String(64), primary_key=True)
        tenant_id = Column(String(64), nullable=False)
        document_id = Column(String(64), nullable=False)
        version = Column(Integer, nullable=False)
        sha256 = Column(String(64), nullable=False)
        storage_key = Column(String(512), nullable=False)
        parser_version = Column(String(64), nullable=False, default="v2.0")
        status = Column(String(32), nullable=False, default="queued")
        error_code = Column(String(64), nullable=True)
        chunk_count = Column(Integer, nullable=False, default=0)
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
        indexed_at = Column(DateTime(timezone=True), nullable=True)
        __table_args__ = (
            ForeignKeyConstraint(
                ["tenant_id", "document_id"],
                ["documents.tenant_id", "documents.id"],
                ondelete="CASCADE",
            ),
            UniqueConstraint("document_id", "version", name="uq_document_versions_doc_ver"),
        )

    class DocumentACL(Base):
        __tablename__ = "document_acl"
        id = Column(String(64), primary_key=True)
        tenant_id = Column(String(64), nullable=False)
        document_id = Column(String(64), nullable=False)
        principal_type = Column(String(32), nullable=False)
        principal_id = Column(String(128), nullable=False)
        permission = Column(String(32), nullable=False, default="read")
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
        __table_args__ = (
            ForeignKeyConstraint(
                ["tenant_id", "document_id"],
                ["documents.tenant_id", "documents.id"],
                ondelete="CASCADE",
            ),
        )

    class IngestionJob(Base):
        __tablename__ = "ingestion_jobs"
        id = Column(String(64), primary_key=True)
        tenant_id = Column(String(64), nullable=False)
        document_id = Column(String(64), nullable=False)
        version_id = Column(String(64), ForeignKey("document_versions.id", ondelete="CASCADE"), nullable=False)
        kind = Column(String(32), nullable=False, default="ingest")
        status = Column(String(32), nullable=False, default="queued")
        attempts = Column(Integer, nullable=False, default=0)
        max_attempts = Column(Integer, nullable=False, default=3)
        error_code = Column(String(64), nullable=True)
        error_detail = Column(String(512), nullable=True)
        run_after = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
        lease_owner = Column(String(128), nullable=True)
        lease_expires_at = Column(DateTime(timezone=True), nullable=True)
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
        updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    class Chunk(Base):
        __tablename__ = "chunks"
        id = Column(String(64), primary_key=True)
        tenant_id = Column(String(64), nullable=False)
        document_id = Column(String(64), nullable=False)
        version = Column(Integer, nullable=False)
        chunk_index = Column(Integer, nullable=False)
        page_start = Column(Integer, nullable=True)
        page_end = Column(Integer, nullable=True)
        heading_path = Column(String(512), nullable=True)
        content = Column(Text, nullable=False)
        content_hash = Column(String(64), nullable=False)
        token_count = Column(Integer, nullable=False)
        parser_version = Column(String(64), nullable=False, default="v2.0")
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
        __table_args__ = (
            ForeignKeyConstraint(
                ["tenant_id", "document_id"],
                ["documents.tenant_id", "documents.id"],
                ondelete="CASCADE",
            ),
            UniqueConstraint("document_id", "version", "chunk_index", name="uq_chunks_doc_ver_idx"),
        )

    class ChunkEmbedding(Base):
        __tablename__ = "chunk_embeddings"
        chunk_id = Column(String(64), ForeignKey("chunks.id", ondelete="CASCADE"), primary_key=True)
        embedding_model_id = Column(
            String(64), ForeignKey("embedding_models.id", ondelete="CASCADE"), primary_key=True
        )
        tenant_id = Column(String(64), nullable=False)
        content_hash = Column(String(64), nullable=False)
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    class Conversation(Base):
        __tablename__ = "conversations"
        id = Column(String(64), primary_key=True)
        tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
        user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
        title = Column(String(255), nullable=False)
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
        updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
        __table_args__ = (UniqueConstraint("tenant_id", "id", name="uq_conversations_tenant_id_id"),)

    class Message(Base):
        __tablename__ = "messages"
        id = Column(String(64), primary_key=True)
        tenant_id = Column(String(64), nullable=False)
        conversation_id = Column(String(64), nullable=False)
        role = Column(String(32), nullable=False)
        content = Column(Text, nullable=False)
        generation_status = Column(String(32), nullable=False, default="unavailable")
        insufficient_evidence = Column(Boolean, nullable=False, default=False)
        provider_name = Column(String(64), nullable=True)
        model_name = Column(String(128), nullable=True)
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
        __table_args__ = (
            ForeignKeyConstraint(
                ["tenant_id", "conversation_id"],
                ["conversations.tenant_id", "conversations.id"],
                ondelete="CASCADE",
            ),
        )

    class MessageCitation(Base):
        __tablename__ = "message_citations"
        id = Column(String(64), primary_key=True)
        message_id = Column(String(64), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
        chunk_id = Column(String(64), ForeignKey("chunks.id", ondelete="SET NULL"), nullable=True)
        label = Column(String(16), nullable=False)
        excerpt_hash = Column(String(64), nullable=False)
        score = Column(Float, nullable=False, default=0.0)
        source_deleted = Column(Boolean, nullable=False, default=False)

    class UsageRecord(Base):
        __tablename__ = "usage_records"
        id = Column(String(64), primary_key=True)
        tenant_id = Column(String(64), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
        user_id = Column(String(64), nullable=True)
        kind = Column(String(32), nullable=False)
        provider = Column(String(64), nullable=False)
        model_name = Column(String(128), nullable=False)
        tokens_in = Column(Integer, nullable=False, default=0)
        tokens_out = Column(Integer, nullable=False, default=0)
        estimated_cost_usd = Column(Float, nullable=False, default=0.0)
        latency_ms = Column(Float, nullable=False, default=0.0)
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    class AuditEvent(Base):
        __tablename__ = "audit_events"
        id = Column(String(64), primary_key=True)
        tenant_id = Column(String(64), nullable=False)
        actor_id = Column(String(64), nullable=True)
        action = Column(String(64), nullable=False)
        resource_type = Column(String(64), nullable=False)
        resource_id = Column(String(128), nullable=True)
        metadata_json = Column(Text, nullable=False, default="{}")
        request_id = Column(String(64), nullable=True)
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    class FeedbackRecord(Base):
        __tablename__ = "feedback_records"
        id = Column(String(64), primary_key=True)
        tenant_id = Column(String(64), nullable=False)
        user_id = Column(String(64), nullable=False)
        message_id = Column(String(64), nullable=True)
        chunk_id = Column(String(64), nullable=True)
        rating = Column(String(16), nullable=False)
        comment = Column(String(1000), nullable=True)
        created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

except ImportError:
    Base = None
