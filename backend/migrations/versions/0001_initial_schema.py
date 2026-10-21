"""Initial normalized schema for Enterprise Knowledge Assistant (16 core tables + feedback)

Revision ID: 0001_initial_schema
Revises: None
Create Date: 2026-10-21 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")

    # 1. tenants
    op.create_table(
        "tenants",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("slug", sa.String(120), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("storage_quota_bytes", sa.BigInteger(), nullable=False, server_default="524288000"),
        sa.Column("allowed_providers", sa.Text(), nullable=False, server_default="none,openai_compatible"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 2. users
    op.create_table(
        "users",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("google_sub", sa.String(255), nullable=True, unique=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("preferences_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 3. tenant_memberships
    op.create_table(
        "tenant_memberships",
        sa.Column("tenant_id", sa.String(64), sa.ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role", sa.String(32), nullable=False, server_default="viewer"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 4. sessions (hashed opaque session IDs)
    op.create_table(
        "sessions",
        sa.Column("id_hash", sa.String(128), primary_key=True),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", sa.String(64), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("csrf_secret", sa.String(128), nullable=False),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("ip_hash", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])

    # 5. embedding_models
    op.create_table(
        "embedding_models",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("model_name", sa.String(255), nullable=False),
        sa.Column("revision", sa.String(128), nullable=False, server_default="main"),
        sa.Column("dim", sa.Integer(), nullable=False),
        sa.Column("max_input_tokens", sa.Integer(), nullable=False, server_default="512"),
        sa.Column("normalize", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("query_prefix", sa.String(255), nullable=False, server_default=""),
        sa.Column("document_prefix", sa.String(255), nullable=False, server_default=""),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 6. documents (with composite uniqueness for tenant_id + id)
    op.create_table(
        "documents",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", sa.String(64), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("mime_type", sa.String(128), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("visibility", sa.String(32), nullable=False, server_default="tenant"),
        sa.Column("active_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "id", name="uq_documents_tenant_id_id"),
    )
    op.create_index("ix_documents_tenant_status", "documents", ["tenant_id", "status"])

    # 7. document_versions
    op.create_table(
        "document_versions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("document_id", sa.String(64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("parser_version", sa.String(64), nullable=False, server_default="v2.0"),
        sa.Column("status", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["tenant_id", "document_id"],
            ["documents.tenant_id", "documents.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("document_id", "version", name="uq_document_versions_doc_ver"),
    )

    # 8. document_acl
    op.create_table(
        "document_acl",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("document_id", sa.String(64), nullable=False),
        sa.Column("principal_type", sa.String(32), nullable=False),  # tenant | role | user
        sa.Column("principal_id", sa.String(128), nullable=False),
        sa.Column("permission", sa.String(32), nullable=False, server_default="read"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["tenant_id", "document_id"],
            ["documents.tenant_id", "documents.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "document_id", "principal_type", "principal_id", "permission", name="uq_doc_acl_principal"
        ),
    )
    op.create_index(
        "ix_document_acl_lookup", "document_acl", ["tenant_id", "principal_type", "principal_id", "document_id"]
    )

    # 9. ingestion_jobs
    op.create_table(
        "ingestion_jobs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("document_id", sa.String(64), nullable=False),
        sa.Column("version_id", sa.String(64), sa.ForeignKey("document_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False, server_default="ingest"),
        sa.Column("status", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("error_detail", sa.String(512), nullable=True),
        sa.Column("run_after", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("lease_owner", sa.String(128), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ingestion_jobs_claim", "ingestion_jobs", ["status", "run_after"])

    # 10. chunks
    op.create_table(
        "chunks",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("document_id", sa.String(64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("page_start", sa.Integer(), nullable=True),
        sa.Column("page_end", sa.Integer(), nullable=True),
        sa.Column("heading_path", sa.String(512), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False),
        sa.Column("parser_version", sa.String(64), nullable=False, server_default="v2.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["tenant_id", "document_id"],
            ["documents.tenant_id", "documents.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("document_id", "version", "chunk_index", name="uq_chunks_doc_ver_idx"),
    )
    op.create_index("ix_chunks_tenant_doc_ver", "chunks", ["tenant_id", "document_id", "version"])
    op.execute(
        "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS tsv tsvector "
        "GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading_path, '') || ' ' || content)) STORED"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_chunks_tsv ON chunks USING GIN (tsv)")

    # 11. chunk_embeddings
    op.create_table(
        "chunk_embeddings",
        sa.Column("chunk_id", sa.String(64), sa.ForeignKey("chunks.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "embedding_model_id",
            sa.String(64),
            sa.ForeignKey("embedding_models.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.execute("ALTER TABLE chunk_embeddings ADD COLUMN IF NOT EXISTS embedding vector(384)")
    op.create_index(
        "ix_chunk_embeddings_tenant_model", "chunk_embeddings", ["tenant_id", "embedding_model_id"]
    )

    # 12. conversations
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "id", name="uq_conversations_tenant_id_id"),
    )

    # 13. messages
    op.create_table(
        "messages",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("conversation_id", sa.String(64), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),  # user | assistant
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("generation_status", sa.String(32), nullable=False, server_default="unavailable"),
        sa.Column("insufficient_evidence", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("provider_name", sa.String(64), nullable=True),
        sa.Column("model_name", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["tenant_id", "conversation_id"],
            ["conversations.tenant_id", "conversations.id"],
            ondelete="CASCADE",
        ),
    )

    # 14. message_citations
    op.create_table(
        "message_citations",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("message_id", sa.String(64), sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_id", sa.String(64), sa.ForeignKey("chunks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("label", sa.String(16), nullable=False),
        sa.Column("excerpt_hash", sa.String(64), nullable=False),
        sa.Column("score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("source_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # 15. usage_records
    op.create_table(
        "usage_records",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=True),
        sa.Column("kind", sa.String(32), nullable=False),  # embedding | generation | search
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("model_name", sa.String(128), nullable=False),
        sa.Column("tokens_in", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("latency_ms", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # 16. audit_events (append-only, survives document/user deletion)
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("actor_id", sa.String(64), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("resource_type", sa.String(64), nullable=False),
        sa.Column("resource_id", sa.String(128), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_events_tenant_created", "audit_events", ["tenant_id", "created_at"])

    # 17. feedback_records
    op.create_table(
        "feedback_records",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("message_id", sa.String(64), nullable=True),
        sa.Column("chunk_id", sa.String(64), nullable=True),
        sa.Column("rating", sa.String(16), nullable=False),  # helpful | unhelpful | issue
        sa.Column("comment", sa.String(1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("feedback_records")
    op.drop_table("audit_events")
    op.drop_table("usage_records")
    op.drop_table("message_citations")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("chunk_embeddings")
    op.drop_table("chunks")
    op.drop_table("ingestion_jobs")
    op.drop_table("document_acl")
    op.drop_table("document_versions")
    op.drop_table("documents")
    op.drop_table("embedding_models")
    op.drop_table("sessions")
    op.drop_table("tenant_memberships")
    op.drop_table("users")
    op.drop_table("tenants")
