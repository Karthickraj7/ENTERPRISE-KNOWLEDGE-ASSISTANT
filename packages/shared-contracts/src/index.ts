export type Role = "viewer" | "contributor" | "knowledge_admin" | "system_admin";

export type DocumentStatus =
  | "queued"
  | "processing"
  | "indexed"
  | "failed"
  | "needs_ocr"
  | "deleted";

export type GenerationStatus =
  | "available"
  | "unavailable"
  | "degraded"
  | "insufficient_evidence";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  request_id: string;
  error_code: string;
}

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  role: Role;
}

export interface CurrentUserResponse {
  id: string;
  email: string;
  full_name: string;
  active_tenant: TenantSummary;
  memberships: TenantSummary[];
  csrf_token: string;
  features: {
    embedding_provider: string;
    embedding_model: string;
    embedding_dim: number;
    generation_provider: string;
    generation_model: string | null;
    generation_available: boolean;
    dev_auth_enabled: boolean;
  };
}

export interface DocumentSummary {
  id: string;
  tenant_id: string;
  title: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  owner_id: string;
  owner_email: string;
  active_version: number;
  status: DocumentStatus;
  visibility: "tenant" | "restricted" | "owner";
  chunk_count: number;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface CitationItem {
  label: string;
  chunk_id: string;
  document_id: string;
  document_title: string;
  version: number;
  page_start: number | null;
  page_end: number | null;
  heading_path: string | null;
  excerpt: string;
  score: number;
  vector_rank: number | null;
  fts_rank: number | null;
}

export interface SearchResponse {
  query: string;
  mode: "hybrid" | "fts_only";
  total_candidates: number;
  passages: CitationItem[];
  request_id: string;
}

export interface ChatAskResponse {
  conversation_id: string;
  message_id: string;
  question: string;
  answer: string | null;
  generation_status: GenerationStatus;
  insufficient_evidence: boolean;
  provider_name: string;
  model_name: string | null;
  citations: CitationItem[];
  banner_message: string | null;
  request_id: string;
}
