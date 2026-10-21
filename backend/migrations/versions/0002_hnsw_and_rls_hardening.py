"""Add partial index for active indexed documents and embedding migration tracking

Revision ID: 0002_hnsw_and_rls_hardening
Revises: 0001_initial_schema
Create Date: 2026-10-21 00:10:00
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_hnsw_and_rls_hardening"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_documents_active_indexed "
        "ON documents (tenant_id, id, active_version) "
        "WHERE status = 'indexed' AND deleted_at IS NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_tenant_sha256_active "
        "ON documents (tenant_id, sha256) "
        "WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_documents_tenant_sha256_active")
    op.execute("DROP INDEX IF EXISTS ix_documents_active_indexed")
