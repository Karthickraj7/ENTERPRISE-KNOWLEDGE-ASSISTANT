"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiRequest, ApiClientError } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";

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

export default function DocumentLibraryPage() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [uploading, setUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [visibility, setVisibility] = useState("tenant");

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (searchQuery) params.set("q", searchQuery);
      const res = await apiRequest<{ items: DocumentItem[] }>(`/api/v1/documents?${params.toString()}`);
      setDocs(res.items || []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  async function handleFileUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadFeedback(null);
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
      setUploadFeedback({
        type: "success",
        text: res.duplicate
          ? `SHA-256 duplicate detected: linked to existing document (${res.document_id}).`
          : `Uploaded and processed '${file.name}' (Status: ${res.status}).`
      });
      await fetchDocuments();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setUploadFeedback({
          type: "error",
          text: `Upload failed (${err.errorCode}): ${err.message} [Request ID: ${err.requestId}]`
        });
      } else {
        setUploadFeedback({ type: "error", text: "Upload failed." });
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-subtle pb-5">
        <div>
          <h1 className="text-2xl font-bold text-ink">Document Library</h1>
          <p className="text-sm text-muted mt-1">
            Upload, version, inspect, and manage access control for enterprise documents (PDF, DOCX, MD, TXT).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`px-3 py-1.5 text-xs font-medium rounded-control border ${
              viewMode === "table" ? "bg-accent text-white border-accent" : "bg-surface border-subtle text-ink"
            }`}
          >
            Table View
          </button>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`px-3 py-1.5 text-xs font-medium rounded-control border ${
              viewMode === "grid" ? "bg-accent text-white border-accent" : "bg-surface border-subtle text-ink"
            }`}
          >
            Grid View
          </button>
        </div>
      </div>

      {/* Drag and Drop Upload Panel */}
      <section
        aria-label="Upload new document"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFileUpload(e.dataTransfer.files);
        }}
        className="p-6 bg-surface border-2 border-dashed border-subtle rounded-panel flex flex-col sm:flex-row items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="text-sm font-semibold text-ink">
            Drag and drop a file here, or select from your computer
          </div>
          <p className="text-xs text-muted">
            Supported formats: PDF, DOCX, Markdown (.md), Plain Text (.txt). Max size: 25 MB. Magic-byte verified.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <select
            aria-label="Document visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="px-3 py-2 text-xs bg-canvas border border-subtle rounded-control"
          >
            <option value="tenant">Tenant-Wide Read</option>
            <option value="restricted">Restricted ACL</option>
            <option value="owner">Owner & Admins Only</option>
          </select>
          <label className="cursor-pointer px-4 py-2 text-xs font-medium bg-accent text-white rounded-control hover:bg-accent-hover">
            {uploading ? "Uploading..." : "Choose File"}
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

      {uploadFeedback && (
        <div
          role="status"
          className={`p-3.5 rounded-panel border text-xs ${
            uploadFeedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          {uploadFeedback.text}
        </div>
      )}

      {/* Search and Status Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          placeholder="Filter by title or filename..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-3.5 py-2 text-sm bg-surface border border-subtle rounded-control"
        />
        <select
          aria-label="Filter by ingestion status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3.5 py-2 text-sm bg-surface border border-subtle rounded-control"
        >
          <option value="">All Statuses</option>
          <option value="indexed">Indexed</option>
          <option value="processing">Processing</option>
          <option value="queued">Queued</option>
          <option value="failed">Failed</option>
          <option value="needs_ocr">Needs OCR</option>
        </select>
      </div>

      {/* Document Listing */}
      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-12 bg-elevated rounded-control" />
          <div className="h-12 bg-elevated rounded-control" />
        </div>
      ) : docs.length === 0 ? (
        <div className="p-10 bg-surface border border-subtle rounded-panel text-center space-y-2">
          <div className="text-base font-semibold text-ink">No matching documents found</div>
          <p className="text-xs text-muted">
            Upload a PDF, DOCX, Markdown, or TXT file above to index it with local CPU embeddings.
          </p>
        </div>
      ) : viewMode === "table" ? (
        <div className="bg-surface border border-subtle rounded-panel overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-subtle bg-elevated/60 text-xs font-semibold text-muted">
                <th className="py-3 px-4">Title & Filename</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Visibility</th>
                <th className="py-3 px-4 text-right">Version</th>
                <th className="py-3 px-4 text-right">Chunks</th>
                <th className="py-3 px-4 text-right">Size</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-elevated/30">
                  <td className="py-3 px-4">
                    <Link href={`/documents/${doc.id}`} className="font-medium text-ink hover:text-accent">
                      {doc.title}
                    </Link>
                    <div className="text-xs text-muted">{doc.filename}</div>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={doc.status} />
                    {doc.error_code && (
                      <div className="text-[11px] font-mono text-red-600 mt-0.5">{doc.error_code}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs font-mono uppercase text-muted">{doc.visibility}</td>
                  <td className="py-3 px-4 text-right tabular-nums">v{doc.active_version}</td>
                  <td className="py-3 px-4 text-right tabular-nums">{doc.chunk_count}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-xs text-muted">
                    {(doc.size_bytes / 1024).toFixed(1)} KB
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      href={`/documents/${doc.id}`}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map((doc) => (
            <div key={doc.id} className="p-5 bg-surface border border-subtle rounded-panel flex flex-col justify-between space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/documents/${doc.id}`} className="font-semibold text-sm text-ink hover:text-accent">
                    {doc.title}
                  </Link>
                  <StatusBadge status={doc.status} />
                </div>
                <div className="text-xs text-muted truncate">{doc.filename}</div>
              </div>
              <div className="pt-3 border-t border-subtle flex items-center justify-between text-xs text-muted tabular-nums">
                <span>v{doc.active_version} ({doc.chunk_count} chunks)</span>
                <Link href={`/documents/${doc.id}`} className="font-medium text-accent hover:underline">
                  Open Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
