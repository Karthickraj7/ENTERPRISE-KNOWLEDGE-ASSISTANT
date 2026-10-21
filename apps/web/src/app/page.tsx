"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface DocItem {
  id: string;
  title: string;
  filename: string;
  status: string;
  active_version: number;
  chunk_count: number;
  updated_at: string;
}

interface ConvItem {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [convs, setConvs] = useState<ConvItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    Promise.all([
      apiRequest<{ items: DocItem[] }>("/api/v1/documents"),
      apiRequest<{ items: ConvItem[] }>("/api/v1/conversations")
    ])
      .then(([dRes, cRes]) => {
        setDocs(dRes.items || []);
        setConvs(cRes.items || []);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const counts = {
    total: docs.length,
    indexed: docs.filter((d) => d.status === "indexed").length,
    processing: docs.filter((d) => d.status === "processing" || d.status === "queued").length,
    failed: docs.filter((d) => d.status === "failed" || d.status === "needs_ocr").length
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-subtle pb-5">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Knowledge Workspace Overview
          </h1>
          <p className="text-sm text-muted mt-1">
            Authorized corpus status, active embedding model, and recent grounded research threads.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/documents"
            className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-control hover:bg-accent-hover"
          >
            Upload Document
          </Link>
          <Link
            href="/search"
            className="px-4 py-2 text-sm font-medium bg-surface border border-subtle text-ink rounded-control hover:bg-elevated"
          >
            Hybrid Search
          </Link>
        </div>
      </div>

      {/* Retrieval-Only Honest Mode Banner when GENERATION_PROVIDER=none */}
      {user && !user.features.generation_available && (
        <div
          role="status"
          className="p-4 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-panel text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
        >
          <div>
            <span className="font-semibold">Retrieval-Only Mode Active: </span>
            Generated answers are disabled because no external LLM provider is configured. Document ingestion, local CPU embeddings ({user.features.embedding_model}), hybrid search, and verifiable source citations are fully operational without API keys.
          </div>
          <Link href="/settings" className="font-semibold underline shrink-0">
            Inspect Provider Config
          </Link>
        </div>
      )}

      {/* Corpus Status Metrics (Tabular Nums, Quiet 1px Borders) */}
      <section aria-label="Document Corpus Metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-surface border border-subtle rounded-panel">
          <div className="text-xs font-medium text-muted">Authorized Documents</div>
          <div className="text-2xl font-bold text-ink mt-1 tabular-nums">{counts.total}</div>
        </div>
        <div className="p-4 bg-surface border border-subtle rounded-panel">
          <div className="text-xs font-medium text-muted">Indexed & Searchable</div>
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
            {counts.indexed}
          </div>
        </div>
        <div className="p-4 bg-surface border border-subtle rounded-panel">
          <div className="text-xs font-medium text-muted">Queued / Processing</div>
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
            {counts.processing}
          </div>
        </div>
        <div className="p-4 bg-surface border border-subtle rounded-panel">
          <div className="text-xs font-medium text-muted">Attention Needed (Failed / OCR)</div>
          <div className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1 tabular-nums">
            {counts.failed}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Documents */}
        <section className="bg-surface border border-subtle rounded-panel flex flex-col">
          <div className="px-5 py-4 border-b border-subtle flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Recent Documents</h2>
            <Link href="/documents" className="text-xs font-medium text-accent hover:underline">
              View All
            </Link>
          </div>
          <div className="p-5 flex-1">
            {loading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-10 bg-elevated rounded-control" />
                <div className="h-10 bg-elevated rounded-control" />
              </div>
            ) : docs.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-sm font-medium text-ink">No documents indexed yet</p>
                <p className="text-xs text-muted">
                  Upload PDF, DOCX, Markdown, or TXT files to start hybrid indexing.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-subtle">
                {docs.slice(0, 5).map((doc) => (
                  <div key={doc.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="text-sm font-medium text-ink hover:text-accent truncate block"
                      >
                        {doc.title}
                      </Link>
                      <div className="text-xs text-muted tabular-nums">
                        v{doc.active_version} | {doc.chunk_count} chunks
                      </div>
                    </div>
                    <StatusBadge status={doc.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Recent Conversations */}
        <section className="bg-surface border border-subtle rounded-panel flex flex-col">
          <div className="px-5 py-4 border-b border-subtle flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Recent Conversations</h2>
            <Link href="/chat" className="text-xs font-medium text-accent hover:underline">
              Open Chat Workspace
            </Link>
          </div>
          <div className="p-5 flex-1">
            {loading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-10 bg-elevated rounded-control" />
                <div className="h-10 bg-elevated rounded-control" />
              </div>
            ) : convs.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-sm font-medium text-ink">No conversations yet</p>
                <p className="text-xs text-muted">
                  Ask questions against your authorized documents with verifiable citations.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-subtle">
                {convs.slice(0, 5).map((conv) => (
                  <div key={conv.id} className="py-3 flex items-center justify-between gap-4">
                    <Link
                      href={`/chat?id=${conv.id}`}
                      className="text-sm font-medium text-ink hover:text-accent truncate"
                    >
                      {conv.title}
                    </Link>
                    <span className="text-xs text-muted tabular-nums shrink-0">
                      {conv.message_count} msgs
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
