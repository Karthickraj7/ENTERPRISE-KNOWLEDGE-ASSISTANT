"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface DocumentDetail {
  id: string;
  title: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  status: string;
  visibility: string;
  active_version: number;
  error_code: string | null;
  versions: Array<{
    id: string;
    version: number;
    status: string;
    chunk_count: number;
    parser_version: string;
    created_at: string;
  }>;
  chunks: Array<{
    id: string;
    chunk_index: number;
    page_start: number | null;
    heading_path: string | null;
    content: string;
    token_count: number;
  }>;
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const docId = String(params?.id || "");
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadDoc = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const res = await apiRequest<DocumentDetail>(`/api/v1/documents/${docId}`);
      setDoc(res);
    } catch {
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    loadDoc();
  }, [loadDoc]);

  async function handleReindex() {
    if (!doc) return;
    await apiRequest(`/api/v1/documents/${doc.id}/reindex`, { method: "POST" });
    setActionMsg("Reindex job completed and active version updated.");
    await loadDoc();
  }

  async function handleDelete() {
    if (!doc) return;
    await apiRequest(`/api/v1/documents/${doc.id}`, { method: "DELETE" });
    router.push("/documents");
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted">Loading document details...</div>;
  }

  if (!doc) {
    return (
      <div className="p-6 bg-surface border border-subtle rounded-panel space-y-2">
        <h1 className="text-lg font-bold text-ink">Document Not Available</h1>
        <p className="text-xs text-muted">
          The requested document does not exist or your account is not authorized to view it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-subtle pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-ink">{doc.title}</h1>
            <StatusBadge status={doc.status} />
          </div>
          <p className="text-xs font-mono text-muted mt-1">
            SHA-256: {doc.sha256.slice(0, 24)}... | Active Version: v{doc.active_version} | Visibility: {doc.visibility}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <a
            href={`/api/v1/documents/${doc.id}/file`}
            className="px-3.5 py-2 text-xs font-medium bg-surface border border-subtle rounded-control hover:bg-elevated"
          >
            Download Original
          </a>
          <button
            type="button"
            onClick={handleReindex}
            className="px-3.5 py-2 text-xs font-medium bg-accent text-white rounded-control hover:bg-accent-hover"
          >
            Reindex New Version
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="px-3.5 py-2 text-xs font-medium bg-red-600 text-white rounded-control hover:bg-red-700"
          >
            Delete & Purge
          </button>
        </div>
      </div>

      {actionMsg && (
        <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-panel text-xs">
          {actionMsg}
        </div>
      )}

      {/* Version History */}
      <section className="bg-surface border border-subtle rounded-panel p-5 space-y-3">
        <h2 className="text-sm font-semibold text-ink">Version & Ingestion History</h2>
        <div className="divide-y divide-subtle text-xs">
          {doc.versions.map((ver) => (
            <div key={ver.id} className="py-2.5 flex items-center justify-between tabular-nums">
              <div>
                <span className="font-semibold text-ink">Version v{ver.version}</span>
                <span className="text-muted ml-3">Parser {ver.parser_version}</span>
              </div>
              <div className="flex items-center gap-4">
                <span>{ver.chunk_count} chunks</span>
                <StatusBadge status={ver.status} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Extracted Chunks & Provenance Preview */}
      <section className="bg-surface border border-subtle rounded-panel p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">
          Indexed Passages ({doc.chunks.length} Chunks in Active Version v{doc.active_version})
        </h2>
        <div className="space-y-3">
          {doc.chunks.map((chk) => (
            <div key={chk.id} className="p-4 bg-elevated/50 border border-subtle rounded-panel space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono text-muted tabular-nums">
                <span>
                  Chunk #{chk.chunk_index} | {chk.page_start ? `Page ${chk.page_start}` : chk.heading_path || "Section"}
                </span>
                <span>{chk.token_count} tokens</span>
              </div>
              <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{chk.content}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
