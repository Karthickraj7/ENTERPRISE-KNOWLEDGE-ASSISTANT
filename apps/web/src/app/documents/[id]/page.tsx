"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  RotateCw,
  Trash2,
  Copy,
  Check,
  FileText,
  ShieldCheck,
  Layers,
  Clock,
  Search,
  HardDrive,
  Cpu,
  AlertTriangle
} from "lucide-react";
import { apiRequest, ApiClientError } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";

interface VersionItem {
  id: string;
  version: number;
  status: string;
  chunk_count: number;
  parser_version: string;
  created_at: string;
}

interface ChunkItem {
  id: string;
  chunk_index: number;
  page_start: number | null;
  heading_path: string | null;
  content: string;
  token_count: number;
}

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
  versions: VersionItem[];
  chunks: ChunkItem[];
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const docId = String(params?.id || "");

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedSha, setCopiedSha] = useState(false);
  const [chunkQuery, setChunkQuery] = useState("");

  const loadDoc = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const res = await apiRequest<DocumentDetail>(`/api/v1/documents/${docId}`);
      setDoc(res);
    } catch {
      setDoc(null);
      toast("error", "Failed to retrieve document details.");
    } finally {
      setLoading(false);
    }
  }, [docId, toast]);

  useEffect(() => {
    loadDoc();
  }, [loadDoc]);

  async function handleReindex() {
    if (!doc) return;
    setReindexing(true);
    try {
      await apiRequest(`/api/v1/documents/${doc.id}/reindex`, { method: "POST" });
      toast("success", "Reindex job enqueued and active version updated.");
      await loadDoc();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        toast("error", `Reindex failed: ${err.message}`);
      } else {
        toast("error", "Could not start reindex job.");
      }
    } finally {
      setReindexing(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!doc) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/v1/documents/${doc.id}`, { method: "DELETE" });
      toast("info", `Document '${doc.title}' deleted and purged.`);
      router.push("/documents");
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        toast("error", `Delete failed: ${err.message}`);
      } else {
        toast("error", "Could not delete document.");
      }
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  }

  function handleCopySha() {
    if (doc?.sha256 && navigator.clipboard) {
      navigator.clipboard.writeText(doc.sha256);
      setCopiedSha(true);
      toast("success", "SHA-256 fingerprint copied.");
      setTimeout(() => setCopiedSha(false), 2000);
    }
  }

  const filteredChunks = (doc?.chunks || []).filter((chk) => {
    if (!chunkQuery.trim()) return true;
    const q = chunkQuery.toLowerCase();
    return (
      chk.content.toLowerCase().includes(q) ||
      (chk.heading_path && chk.heading_path.toLowerCase().includes(q)) ||
      String(chk.chunk_index).includes(q)
    );
  });

  if (loading) {
    return (
      <div className="space-y-6 max-w-content mx-auto animate-pulse">
        <div className="h-6 w-48 bg-elevated rounded-control" />
        <div className="h-32 bg-elevated rounded-panel" />
        <div className="h-64 bg-elevated rounded-panel" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-8 bg-surface border border-subtle rounded-panel space-y-4 max-w-lg mx-auto text-center">
        <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
        <h1 className="text-lg font-bold text-ink">Document Not Available</h1>
        <p className="text-xs text-muted">
          The requested document was not found or your tenant credentials do not permit access.
        </p>
        <Link
          href="/documents"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-accent text-white rounded-control"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Document Library</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-content mx-auto">
      {/* =====================================================================
       * BREADCRUMB & ACTION HEADER
       * ===================================================================== */}
      <div className="space-y-4">
        <Link
          href="/documents"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-faint hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Library</span>
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-subtle pb-5">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
                {doc.title}
              </h1>
              <StatusBadge status={doc.status} />
              <span className="px-2 py-0.5 bg-elevated border border-subtle rounded-control font-mono text-xs text-accent">
                Active v{doc.active_version}
              </span>
            </div>

            {/* SHA-256 Fingerprint Pill */}
            <div className="flex items-center gap-2 text-xs font-mono text-faint">
              <span className="truncate">
                SHA-256: {doc.sha256}
              </span>
              <button
                type="button"
                onClick={handleCopySha}
                className="p-1 hover:text-ink rounded"
                title="Copy full SHA-256 hash"
                aria-label="Copy SHA-256 checksum"
              >
                {copiedSha ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <a
              href={`/api/v1/documents/${doc.id}/file`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-surface border border-subtle text-ink hover:bg-elevated rounded-control transition-colors shadow-xs"
              download
            >
              <Download className="w-3.5 h-3.5 text-faint" />
              <span>Download Original</span>
            </a>

            <button
              type="button"
              disabled={reindexing}
              onClick={handleReindex}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded-control shadow-xs transition-colors disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${reindexing ? "animate-spin" : ""}`} />
              <span>{reindexing ? "Reindexing..." : "Reindex Version"}</span>
            </button>

            <button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-red-600/15 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 rounded-control shadow-xs transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Document</span>
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
       * METADATA INSTRUMENT PANEL
       * ===================================================================== */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-surface border border-subtle rounded-panel space-y-1">
          <div className="text-[11px] font-mono uppercase tracking-wider text-faint">
            File Details
          </div>
          <div className="text-sm font-semibold text-ink truncate" title={doc.filename}>
            {doc.filename}
          </div>
          <div className="text-xs font-mono text-muted tabular-nums">
            {(doc.size_bytes / 1024).toFixed(1)} KB ({doc.mime_type})
          </div>
        </div>

        <div className="p-4 bg-surface border border-subtle rounded-panel space-y-1">
          <div className="text-[11px] font-mono uppercase tracking-wider text-faint">
            Vector Chunks
          </div>
          <div className="text-sm font-semibold text-accent font-mono tabular-nums">
            {doc.chunks.length} Passages
          </div>
          <div className="text-xs font-mono text-muted">
            Partitioned & Vectorized
          </div>
        </div>

        <div className="p-4 bg-surface border border-subtle rounded-panel space-y-1">
          <div className="text-[11px] font-mono uppercase tracking-wider text-faint">
            Access Boundary
          </div>
          <div className="text-sm font-semibold text-ink font-mono uppercase">
            {doc.visibility}
          </div>
          <div className="text-xs text-muted">
            Tenant Isolated ACL
          </div>
        </div>

        <div className="p-4 bg-surface border border-subtle rounded-panel space-y-1">
          <div className="text-[11px] font-mono uppercase tracking-wider text-faint">
            Ingestion State
          </div>
          <div className="text-sm font-semibold text-emerald-400 font-mono">
            {doc.status}
          </div>
          <div className="text-xs text-muted">
            {doc.error_code ? `Code: ${doc.error_code}` : "Clean Embedding Match"}
          </div>
        </div>
      </section>

      {/* =====================================================================
       * VERSION & INGESTION TIMELINE
       * ===================================================================== */}
      <section className="bg-surface border border-subtle rounded-panel p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-subtle">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-ink">Version & Pipeline History</h2>
          </div>
          <span className="text-xs font-mono text-faint">
            Total Versions: {doc.versions.length}
          </span>
        </div>

        <div className="divide-y divide-subtle text-xs">
          {doc.versions.map((ver) => (
            <div key={ver.id} className="py-3 flex flex-wrap items-center justify-between gap-3 tabular-nums font-mono">
              <div className="flex items-center gap-3">
                <span className="font-bold text-ink">v{ver.version}</span>
                <span className="text-faint">Parser: {ver.parser_version}</span>
                <span className="text-faint">{ver.created_at.slice(0, 19).replace("T", " ")}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-muted">{ver.chunk_count} chunks</span>
                <StatusBadge status={ver.status} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* =====================================================================
       * EXTRACTED PASSAGES EXPLORER
       * ===================================================================== */}
      <section className="bg-surface border border-subtle rounded-panel p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-subtle">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan" />
            <h2 className="text-sm font-semibold text-ink">
              Indexed Passages ({doc.chunks.length} Chunks in v{doc.active_version})
            </h2>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="text"
              placeholder="Search extracted passages..."
              value={chunkQuery}
              onChange={(e) => setChunkQuery(e.target.value)}
              aria-label="Filter passages"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-elevated border border-subtle rounded-control text-ink placeholder:text-faint outline-none"
            />
          </div>
        </div>

        {filteredChunks.length === 0 ? (
          <div className="py-8 text-center text-xs text-faint border border-subtle rounded-panel">
            No passages match your query.
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto scrollbar-thin">
            {filteredChunks.map((chk) => (
              <div
                key={chk.id}
                className="p-4 bg-elevated/40 border border-subtle rounded-panel space-y-2 text-xs"
              >
                <div className="flex items-center justify-between font-mono text-[11px] text-faint border-b border-subtle/50 pb-1.5">
                  <span className="font-semibold text-ink">
                    Passage #{chk.chunk_index}
                    {chk.page_start && ` | Page ${chk.page_start}`}
                    {chk.heading_path && ` | ${chk.heading_path}`}
                  </span>
                  <span className="text-accent">{chk.token_count} tokens</span>
                </div>
                <p className="text-ink leading-relaxed whitespace-pre-wrap font-sans">
                  {chk.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Confirmation Dialog for Purge */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Delete Document & Purge Index?"
        description={`This will permanently remove '${doc.title}', purge all ${doc.chunks.length} vectors from pgvector, and delete the underlying storage file.`}
        confirmLabel="Permanently Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
