"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Files,
  UploadCloud,
  Search,
  Filter,
  LayoutGrid,
  List,
  FileText,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Shield,
  Layers,
  HardDrive
} from "lucide-react";
import { apiRequest, ApiClientError } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

interface DocumentItem {
  id: string;
  title: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  active_version: number;
  status: string;
  visibility: string;
  chunk_count: number;
  error_code: string | null;
  owner_email: string;
  created_at: string;
}

function getFormatBadge(mimeType: string, filename: string) {
  const ext = filename.split(".").pop()?.toUpperCase() || "DOC";
  if (mimeType.includes("pdf") || ext === "PDF") {
    return { label: "PDF", bg: "bg-red-500/15 text-red-400 border-red-500/30" };
  }
  if (mimeType.includes("word") || ext === "DOCX") {
    return { label: "DOCX", bg: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  }
  if (ext === "MD") {
    return { label: "MD", bg: "bg-violet-soft text-accent border-subtle" };
  }
  return { label: ext, bg: "bg-elevated text-muted border-subtle" };
}

export default function DocumentLibraryPage() {
  const { toast } = useToast();
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [visibility, setVisibility] = useState("tenant");

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (searchQuery) params.set("q", searchQuery);
      const res = await apiRequest<{ items: DocumentItem[] }>(`/api/v1/documents?${params.toString()}`);
      setDocs(res.items || []);
    } catch {
      toast("error", "Could not retrieve document library.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, toast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  async function handleFileUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const file = fileList[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name);
    formData.append("visibility", visibility);

    try {
      const res = await apiRequest<{ document_id: string; status: string; duplicate: boolean }>(
        "/api/v1/documents",
        { method: "POST", body: formData }
      );
      if (res.duplicate) {
        toast("info", `SHA-256 duplicate linked to existing record (${res.document_id.slice(0, 8)}).`);
      } else {
        toast("success", `Uploaded '${file.name}' (Status: ${res.status}).`);
      }
      await fetchDocuments();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        toast("error", `Upload failed (${err.errorCode}): ${err.message}`);
      } else {
        toast("error", "Upload failed. Verify magic bytes and 25 MB quota.");
      }
    } finally {
      setUploading(false);
      setIsDragOver(false);
    }
  }

  return (
    <div className="space-y-6 max-w-content mx-auto">
      {/* =====================================================================
       * PAGE HEADER & VIEW CONTROLS
       * ===================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-subtle pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan animate-signal" />
            <span className="text-xs font-mono uppercase tracking-wider text-faint">
              Corpus Explorer
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
            Document Library
          </h1>
          <p className="text-sm text-muted">
            Upload, version, inspect provenance, and manage access boundaries across enterprise files.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-control border transition-colors ${
              viewMode === "table"
                ? "bg-accent text-white border-accent"
                : "bg-surface border-subtle text-muted hover:text-ink hover:bg-elevated"
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Table</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-control border transition-colors ${
              viewMode === "grid"
                ? "bg-accent text-white border-accent"
                : "bg-surface border-subtle text-muted hover:text-ink hover:bg-elevated"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Grid</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
       * DRAG & DROP UPLOAD CONSOLE
       * ===================================================================== */}
      <section
        aria-label="Upload document to vector corpus"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFileUpload(e.dataTransfer.files);
        }}
        className={`p-6 sm:p-8 bg-surface border-2 border-dashed rounded-panel transition-all flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs ${
          isDragOver
            ? "border-accent bg-violet-soft/40 shadow-glow-violet"
            : "border-subtle hover:border-default"
        }`}
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-elevated border border-subtle rounded-panel text-accent shrink-0">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-semibold text-ink">
              Drag and drop runbooks or research documents
            </div>
            <p className="text-xs text-muted max-w-xl">
              Supported formats: PDF, DOCX, Markdown (.md), Plain Text (.txt). Maximum size: 25 MB.
              Content is magic-byte verified, SHA-256 fingerprinted, and partitioned into vectorized chunks.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0 w-full md:w-auto justify-end">
          <select
            aria-label="Document visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="px-3 py-2 text-xs bg-elevated border border-subtle rounded-control text-ink outline-none"
          >
            <option value="tenant">Tenant-Wide Read</option>
            <option value="restricted">Restricted ACL</option>
            <option value="owner">Owner & Admins Only</option>
          </select>

          <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-accent hover:bg-accent-hover active:bg-accent-active text-white rounded-control shadow-xs transition-colors">
            {uploading ? (
              <span>Processing Ingestion...</span>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Select File</span>
              </>
            )}
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => handleFileUpload(e.target.files)}
            />
          </label>
        </div>
      </section>

      {/* =====================================================================
       * SEARCH AND STATUS FILTER TOOLBAR
       * ===================================================================== */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
          <input
            type="search"
            placeholder="Filter corpus by title, filename, or owner..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter documents by text query"
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-surface border border-subtle focus:border-accent rounded-control text-ink placeholder:text-faint transition-colors outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-faint shrink-0" />
          <select
            aria-label="Filter by ingestion status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3.5 py-2 text-sm bg-surface border border-subtle focus:border-accent rounded-control text-ink outline-none"
          >
            <option value="">All Ingestion Statuses</option>
            <option value="indexed">Indexed & Searchable</option>
            <option value="processing">Processing In Pipeline</option>
            <option value="queued">Queued In Worker</option>
            <option value="failed">Failed Indexing</option>
            <option value="needs_ocr">Needs OCR Extraction</option>
          </select>
        </div>
      </div>

      {/* =====================================================================
       * DOCUMENT LISTINGS: TABLE VIEW OR GRID VIEW
       * ===================================================================== */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-12 bg-elevated rounded-control" />
          <div className="h-12 bg-elevated rounded-control" />
          <div className="h-12 bg-elevated rounded-control" />
        </div>
      ) : docs.length === 0 ? (
        <div className="p-12 bg-surface border border-subtle rounded-panel text-center space-y-3">
          <Files className="w-10 h-10 text-faint mx-auto mb-2" />
          <div className="text-base font-semibold text-ink">No matching documents found</div>
          <p className="text-xs text-muted max-w-sm mx-auto">
            Try adjusting your search query or ingestion status filter, or upload a document to begin vectorization.
          </p>
        </div>
      ) : viewMode === "table" ? (
        <div className="bg-surface border border-subtle rounded-panel overflow-x-auto shadow-xs">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-subtle bg-elevated/40 text-xs font-semibold text-faint font-mono uppercase tracking-wider">
                <th className="py-3 px-4">Document & Filename</th>
                <th className="py-3 px-4">Format</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Visibility</th>
                <th className="py-3 px-4 text-right">Version</th>
                <th className="py-3 px-4 text-right">Chunks</th>
                <th className="py-3 px-4 text-right">Size</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {docs.map((doc) => {
                const badge = getFormatBadge(doc.mime_type, doc.filename);
                return (
                  <tr key={doc.id} className="hover:bg-elevated/30 transition-colors">
                    <td className="py-3 px-4 min-w-[220px]">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="font-semibold text-sm text-ink hover:text-accent transition-colors block truncate"
                      >
                        {doc.title}
                      </Link>
                      <div className="text-xs font-mono text-faint truncate">{doc.filename}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-1.5 py-0.5 text-[10px] font-mono border rounded-control ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={doc.status} />
                      {doc.error_code && (
                        <div className="text-[10px] font-mono text-red-400 mt-0.5">{doc.error_code}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono uppercase text-muted">
                      {doc.visibility}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-mono text-xs text-ink">
                      v{doc.active_version}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-mono text-xs text-accent">
                      {doc.chunk_count}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-xs text-muted font-mono">
                      {(doc.size_bytes / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="text-xs font-medium text-accent hover:underline inline-flex items-center gap-1"
                      >
                        <span>Inspect</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map((doc) => {
            const badge = getFormatBadge(doc.mime_type, doc.filename);
            return (
              <div
                key={doc.id}
                className="p-5 bg-surface border border-subtle hover:border-default rounded-panel flex flex-col justify-between space-y-4 shadow-xs transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`px-1.5 py-0.5 text-[10px] font-mono border rounded-control ${badge.bg}`}>
                      {badge.label}
                    </span>
                    <StatusBadge status={doc.status} />
                  </div>
                  <Link
                    href={`/documents/${doc.id}`}
                    className="font-bold text-sm text-ink hover:text-accent transition-colors block line-clamp-1"
                  >
                    {doc.title}
                  </Link>
                  <div className="text-xs font-mono text-faint truncate">{doc.filename}</div>
                </div>

                <div className="pt-3 border-t border-subtle flex items-center justify-between text-xs text-muted tabular-nums font-mono">
                  <span>
                    v{doc.active_version} ({doc.chunk_count} chunks)
                  </span>
                  <Link
                    href={`/documents/${doc.id}`}
                    className="font-medium text-accent hover:underline flex items-center gap-0.5"
                  >
                    <span>Details</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
