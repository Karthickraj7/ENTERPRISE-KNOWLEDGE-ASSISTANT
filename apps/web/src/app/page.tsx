"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  MessageSquare,
  Files,
  Cpu,
  Radio,
  ArrowRight,
  ShieldCheck,
  Clock,
  Sparkles,
  Layers,
  UploadCloud,
  ChevronRight,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
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
  size_bytes?: number;
  updated_at: string;
}

interface ConvItem {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [convs, setConvs] = useState<ConvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickQuery, setQuickQuery] = useState("");

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

  function handleQuickSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!quickQuery.trim()) return;
    router.push(`/chat?q=${encodeURIComponent(quickQuery.trim())}`);
  }

  return (
    <div className="space-y-8 max-w-content mx-auto">
      {/* =====================================================================
       * RESEARCH HERO & QUICK ENTRY
       * ===================================================================== */}
      <section className="relative overflow-hidden bg-surface border border-subtle rounded-panel p-6 sm:p-8 bg-signal-grid shadow-sm">
        <div className="relative z-10 space-y-6 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-soft border border-subtle rounded-control text-xs font-mono text-accent">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-signal" />
            <span>Telemetry & Grounded Knowledge Workspace</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-ink tracking-tight">
              Knowledge Workspace Overview
            </h1>
            <p className="text-sm sm:text-base text-muted leading-relaxed">
              Enterprise Grounded Research Center: query authorized corporate runbooks, technical specifications, and security policies.
              Every insight is traced to verbatim indexed chunks.
            </p>
          </div>

          {/* Quick Inquiry Search Bar */}
          <form onSubmit={handleQuickSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              <input
                type="text"
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                placeholder="Ask an analytical question or search policy codes..."
                aria-label="Direct research query input"
                className="w-full pl-10 pr-4 py-3 text-sm bg-elevated/70 border border-subtle focus:border-accent focus:shadow-glow-violet rounded-control text-ink placeholder:text-faint transition-all outline-none"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-3 text-sm font-medium bg-accent hover:bg-accent-hover active:bg-accent-active text-white rounded-control shadow-xs transition-colors shrink-0"
            >
              Launch Inquiry
            </button>
          </form>
        </div>
      </section>

      {/* =====================================================================
       * HONEST RETRIEVAL-ONLY MODE STATUS BANNER
       * ===================================================================== */}
      {user && !user.features.generation_available && (
        <div
          role="status"
          className="p-4 bg-status-processing-bg border border-status-processing-border rounded-panel text-xs text-status-processing flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-start gap-2.5">
            <Radio className="w-4 h-4 text-cyan shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-ink">Retrieval-Only Mode Active: </span>
              <span>
                External LLM provider is not configured. Document ingestion, local CPU embeddings ({user.features.embedding_model}),
                pgvector cosine indexing, and verified source citations are fully functional without external keys.
              </span>
            </div>
          </div>
          <Link
            href="/settings"
            className="font-semibold text-accent hover:underline shrink-0 text-xs inline-flex items-center gap-1"
          >
            <span>Review Provider Specs</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* =====================================================================
       * HIGH-SIGNAL CORPUS TELEMETRY CELLS
       * ===================================================================== */}
      <section aria-label="Corpus Telemetry Statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 sm:p-5 bg-surface border border-subtle rounded-panel space-y-1 shadow-xs">
          <div className="text-xs font-mono uppercase tracking-wider text-faint flex items-center justify-between">
            <span>Authorized Corpus</span>
            <Files className="w-3.5 h-3.5 text-accent" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-ink tabular-nums">
            {counts.total}
          </div>
          <div className="text-[11px] text-muted">Active Tenant Documents</div>
        </div>

        <div className="p-4 sm:p-5 bg-surface border border-subtle rounded-panel space-y-1 shadow-xs">
          <div className="text-xs font-mono uppercase tracking-wider text-faint flex items-center justify-between">
            <span>Indexed & Ready</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tabular-nums">
            {counts.indexed}
          </div>
          <div className="text-[11px] text-muted">Searchable & Vectorized</div>
        </div>

        <div className="p-4 sm:p-5 bg-surface border border-subtle rounded-panel space-y-1 shadow-xs">
          <div className="text-xs font-mono uppercase tracking-wider text-faint flex items-center justify-between">
            <span>Pipeline Ingesting</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-400 tabular-nums">
            {counts.processing}
          </div>
          <div className="text-[11px] text-muted">Queued or Parsing</div>
        </div>

        <div className="p-4 sm:p-5 bg-surface border border-subtle rounded-panel space-y-1 shadow-xs">
          <div className="text-xs font-mono uppercase tracking-wider text-faint flex items-center justify-between">
            <span>Attention Needed</span>
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-red-400 tabular-nums">
            {counts.failed}
          </div>
          <div className="text-[11px] text-muted">Failed Parsing or Needs OCR</div>
        </div>
      </section>

      {/* =====================================================================
       * RECENT DOCUMENTS & RECENT RESEARCH THREADS
       * ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Documents In Corpus */}
        <section className="bg-surface border border-subtle rounded-panel flex flex-col shadow-xs">
          <div className="p-4 sm:p-5 border-b border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Files className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-ink">Recent Corpus Documents</h2>
            </div>
            <Link
              href="/documents"
              className="text-xs font-medium text-accent hover:underline flex items-center gap-1"
            >
              <span>View Library</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="p-4 sm:p-5 flex-1">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-10 bg-elevated rounded-control" />
                <div className="h-10 bg-elevated rounded-control" />
                <div className="h-10 bg-elevated rounded-control" />
              </div>
            ) : docs.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Files className="w-8 h-8 text-faint mx-auto mb-2" />
                <p className="text-sm font-medium text-ink">No documents uploaded yet</p>
                <p className="text-xs text-muted max-w-xs mx-auto">
                  Upload PDF, DOCX, Markdown, or TXT runbooks to begin indexing.
                </p>
                <div className="pt-2">
                  <Link
                    href="/documents"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-control"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload Document</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-subtle">
                {docs.slice(0, 5).map((doc) => (
                  <div key={doc.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="text-sm font-medium text-ink hover:text-accent truncate block"
                      >
                        {doc.title}
                      </Link>
                      <div className="text-xs font-mono text-muted tabular-nums">
                        v{doc.active_version} | {doc.chunk_count} chunks | {doc.filename}
                      </div>
                    </div>
                    <StatusBadge status={doc.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Recent Research Threads */}
        <section className="bg-surface border border-subtle rounded-panel flex flex-col shadow-xs">
          <div className="p-4 sm:p-5 border-b border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-cyan" />
              <h2 className="text-sm font-semibold text-ink">Recent Research Threads</h2>
            </div>
            <Link
              href="/chat"
              className="text-xs font-medium text-accent hover:underline flex items-center gap-1"
            >
              <span>Open Chat Console</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="p-4 sm:p-5 flex-1">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-10 bg-elevated rounded-control" />
                <div className="h-10 bg-elevated rounded-control" />
                <div className="h-10 bg-elevated rounded-control" />
              </div>
            ) : convs.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <MessageSquare className="w-8 h-8 text-faint mx-auto mb-2" />
                <p className="text-sm font-medium text-ink">No research threads yet</p>
                <p className="text-xs text-muted max-w-xs mx-auto">
                  Ask analytical questions against authorized documents to inspect citations.
                </p>
                <div className="pt-2">
                  <Link
                    href="/chat"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-control"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Launch Research Chat</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-subtle">
                {convs.slice(0, 5).map((conv) => (
                  <div key={conv.id} className="py-3 flex items-center justify-between gap-4">
                    <Link
                      href={`/chat?id=${conv.id}`}
                      className="text-sm font-medium text-ink hover:text-accent truncate flex-1 block"
                    >
                      {conv.title}
                    </Link>
                    <span className="text-xs font-mono text-faint tabular-nums shrink-0 px-2 py-0.5 bg-elevated rounded">
                      {conv.message_count} turn{conv.message_count === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* =====================================================================
       * QUICK WORKFLOW SHORTCUTS
       * ===================================================================== */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <Link
          href="/documents"
          className="p-4 bg-surface hover:bg-elevated border border-subtle hover:border-accent/40 rounded-panel transition-all space-y-1.5 group shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-accent font-semibold uppercase">01 / Corpus</span>
            <ChevronRight className="w-4 h-4 text-faint group-hover:text-accent transition-transform group-hover:translate-x-1" />
          </div>
          <div className="text-sm font-bold text-ink">Upload Knowledge Document</div>
          <p className="text-xs text-muted">
            Ingest PDF, DOCX, Markdown, or TXT documents into the local vector space.
          </p>
        </Link>

        <Link
          href="/search"
          className="p-4 bg-surface hover:bg-elevated border border-subtle hover:border-accent/40 rounded-panel transition-all space-y-1.5 group shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-cyan font-semibold uppercase">02 / Search</span>
            <ChevronRight className="w-4 h-4 text-faint group-hover:text-cyan transition-transform group-hover:translate-x-1" />
          </div>
          <div className="text-sm font-bold text-ink">Hybrid Passage Retrieval</div>
          <p className="text-xs text-muted">
            Perform Reciprocal Rank Fusion queries across dense vectors and full-text terms.
          </p>
        </Link>

        <Link
          href="/chat"
          className="p-4 bg-surface hover:bg-elevated border border-subtle hover:border-accent/40 rounded-panel transition-all space-y-1.5 group shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-accent font-semibold uppercase">03 / Analysis</span>
            <ChevronRight className="w-4 h-4 text-faint group-hover:text-accent transition-transform group-hover:translate-x-1" />
          </div>
          <div className="text-sm font-bold text-ink">Grounded AI Research</div>
          <p className="text-xs text-muted">
            Ask complex questions with verified provenance citations and context inspector.
          </p>
        </Link>
      </section>
    </div>
  );
}
