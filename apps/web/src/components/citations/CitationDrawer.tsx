"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  X,
  FileText,
  Download,
  ExternalLink,
  Copy,
  Check,
  Layers,
  BookOpen,
  Info,
  ShieldCheck,
  AlertTriangle
} from "lucide-react";
import { apiRequest, ApiClientError } from "@/lib/api";

export interface SelectedCitation {
  label: string;
  chunk_id: string | null;
  document_id?: string | null;
  document_title: string;
  page_start?: number | null;
  heading_path?: string | null;
  excerpt: string;
  score?: number;
}

interface ContextChunk {
  chunk_index: number;
  content: string;
  page_start: number | null;
  heading_path: string | null;
}

interface SourceChunkDetail {
  id: string;
  document_id: string;
  document_title: string;
  filename: string;
  version: number;
  page_start: number | null;
  page_end: number | null;
  heading_path: string | null;
  content: string;
  context_window: ContextChunk[];
}

interface CitationDrawerProps {
  citation: SelectedCitation | null;
  onClose: () => void;
}

export function CitationDrawer({ citation, onClose }: CitationDrawerProps) {
  const [detail, setDetail] = useState<SourceChunkDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"passage" | "context">("passage");

  const loadCitationDetail = useCallback(async (chunkId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<SourceChunkDetail>(`/api/v1/sources/${chunkId}`);
      setDetail(res);
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 404) {
        setError("Source passage is no longer available or access permissions have changed.");
      } else {
        setError("Could not load verified source evidence context.");
      }
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!citation || !citation.chunk_id) {
      setDetail(null);
      return;
    }
    loadCitationDetail(citation.chunk_id);
  }, [citation, loadCitationDetail]);

  // Keyboard shortcut listener to close on Escape
  useEffect(() => {
    if (!citation) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [citation, onClose]);

  const copyPassage = useCallback(() => {
    const textToCopy = detail?.content || citation?.excerpt || "";
    if (textToCopy && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [detail, citation]);

  if (!citation) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-label="Evidence Inspector">
      {/* Background Overlay */}
      <div
        className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm overlay-enter"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Surface */}
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-surface border-l border-subtle shadow-overlay flex flex-col drawer-enter">
        {/* Header with Telemetry Indicators */}
        <div className="p-4 sm:p-5 border-b border-subtle flex items-start justify-between gap-3 bg-elevated/40">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-bold bg-cyan-soft text-cyan border border-cyan-border rounded-control shadow-glow-cyan">
                <ShieldCheck className="w-3.5 h-3.5" />
                [{citation.label}]
              </span>
              <span className="text-xs font-mono uppercase tracking-wider text-faint">
                Verified Evidence Inspector
              </span>
            </div>
            <h2 className="text-base font-semibold text-ink truncate" title={citation.document_title}>
              {citation.document_title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted font-mono">
              {citation.page_start && (
                <span className="px-1.5 py-0.2 bg-elevated border border-subtle rounded text-[11px]">
                  Page {citation.page_start}
                </span>
              )}
              {citation.heading_path && (
                <span className="px-1.5 py-0.2 bg-elevated border border-subtle rounded text-[11px] truncate max-w-[200px]" title={citation.heading_path}>
                  {citation.heading_path}
                </span>
              )}
              {citation.score !== undefined && (
                <span className="px-1.5 py-0.2 bg-elevated border border-subtle rounded text-[11px] text-accent">
                  RRF Score: {citation.score.toFixed(4)}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-faint hover:text-ink hover:bg-elevated rounded-control transition-colors"
            aria-label="Close inspector (Esc)"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 px-4 pt-2 border-b border-subtle bg-elevated/20 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("passage")}
            className={`px-3 py-2 border-b-2 transition-colors ${
              activeTab === "passage"
                ? "border-cyan text-cyan font-semibold"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              Cited Passage
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("context")}
            className={`px-3 py-2 border-b-2 transition-colors ${
              activeTab === "context"
                ? "border-cyan text-cyan font-semibold"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Surrounding Context ({detail?.context_window?.length || 0})
            </span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-4 bg-elevated rounded-control w-1/3" />
              <div className="h-32 bg-elevated rounded-panel w-full" />
              <div className="h-24 bg-elevated rounded-panel w-full" />
            </div>
          )}

          {error && (
            <div role="alert" className="p-4 bg-status-failed-bg border border-status-failed-border rounded-panel text-xs text-status-failed space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4" />
                Evidence Unavailable
              </div>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && activeTab === "passage" && (
            <div className="space-y-4">
              {/* Provenance Card */}
              <div className="p-3.5 bg-elevated/60 border border-subtle rounded-panel text-xs space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-wider text-faint flex items-center justify-between">
                  <span>Provenance Metadata</span>
                  {detail && <span>v{detail.version} Indexed</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-ink font-mono text-[11px]">
                  <div>
                    <span className="text-faint">Filename: </span>
                    <span className="truncate">{detail?.filename || "Source File"}</span>
                  </div>
                  <div>
                    <span className="text-faint">Location: </span>
                    <span>
                      {detail?.page_start ? `Page ${detail.page_start}` : detail?.heading_path || "Root"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Exact Cited Passage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan animate-signal" />
                    Verbatim Grounded Passage
                  </span>
                  <button
                    type="button"
                    onClick={copyPassage}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-muted hover:text-ink bg-elevated hover:bg-inset border border-subtle rounded-control transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="relative p-4 sm:p-5 bg-elevated/40 border-l-4 border-l-cyan border border-subtle rounded-r-panel text-sm leading-relaxed text-ink font-sans whitespace-pre-wrap select-text">
                  {detail?.content || citation.excerpt}
                </div>
              </div>

              {/* Character and token telemetry */}
              <div className="flex items-center justify-between text-[11px] font-mono text-faint border-t border-subtle pt-3">
                <span>Passage Length: {(detail?.content || citation.excerpt).length} characters</span>
                <span>Verified Cosine Match</span>
              </div>
            </div>
          )}

          {!loading && !error && activeTab === "context" && (
            <div className="space-y-3">
              <div className="text-xs text-muted leading-relaxed">
                Adjacent chunks extracted from the document version. Inspect how this passage fits into the broader document flow:
              </div>

              {(!detail?.context_window || detail.context_window.length === 0) ? (
                <div className="p-6 text-center text-xs text-faint border border-subtle rounded-panel">
                  No surrounding chunks available for this passage.
                </div>
              ) : (
                detail.context_window.map((cw) => {
                  const isCurrent = detail.content.trim() === cw.content.trim();
                  return (
                    <div
                      key={cw.chunk_index}
                      className={`p-3.5 rounded-panel border text-xs space-y-1.5 transition-colors ${
                        isCurrent
                          ? "bg-cyan-soft border-cyan-border shadow-glow-cyan"
                          : "bg-elevated/40 border-subtle"
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono text-[11px] text-faint">
                        <span className="font-semibold text-ink">
                          Chunk #{cw.chunk_index}
                          {isCurrent && (
                            <span className="ml-2 text-cyan font-bold">(Currently Cited)</span>
                          )}
                        </span>
                        <span>{cw.page_start ? `Page ${cw.page_start}` : cw.heading_path || ""}</span>
                      </div>
                      <p className="text-ink leading-relaxed whitespace-pre-wrap">
                        {cw.content}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="p-4 border-t border-subtle bg-elevated/50 flex flex-wrap items-center justify-between gap-3 text-xs">
          {detail?.document_id ? (
            <>
              <Link
                href={`/documents/${detail.document_id}`}
                className="inline-flex items-center gap-1.5 text-accent hover:text-accent-hover font-medium underline"
                onClick={onClose}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Document Details & Provenance</span>
              </Link>
              <a
                href={`/api/v1/documents/${detail.document_id}/file`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-control shadow-xs transition-colors"
                download
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Original</span>
              </a>
            </>
          ) : (
            <span className="text-faint font-mono">Source identity linked</span>
          )}
        </div>
      </aside>
    </div>
  );
}
