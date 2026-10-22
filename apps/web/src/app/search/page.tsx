"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Search,
  Cpu,
  Layers,
  Sparkles,
  Radio,
  FileText,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Zap,
  Info
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { CitationDrawer, SelectedCitation } from "@/components/citations/CitationDrawer";

interface SearchResultItem extends SelectedCitation {
  vector_rank: number | null;
  fts_rank: number | null;
}

const SEARCH_PRESETS = [
  "idle session timeout and cookie security",
  "default embedding model dimension and CPU provider",
  "soft delete purge workflow and citations",
  "hybrid retrieval reciprocal rank fusion k=60",
  "RBAC permissions and knowledge admin roles"
];

export default function SearchWorkspacePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [mode, setMode] = useState<string>("hybrid");
  const [totalCandidates, setTotalCandidates] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<SelectedCitation | null>(null);

  async function executeSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await apiRequest<{
        mode: string;
        total_candidates?: number;
        passages: SearchResultItem[];
      }>("/api/v1/search", {
        method: "POST",
        body: JSON.stringify({ query: trimmed, top_k: 10 })
      });
      setResults(res.passages || []);
      setMode(res.mode || "hybrid");
      setTotalCandidates(res.total_candidates ?? null);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    executeSearch(query);
  }

  function handlePresetClick(preset: string) {
    setQuery(preset);
    executeSearch(preset);
  }

  return (
    <div className="space-y-6 max-w-content mx-auto">
      {/* =====================================================================
       * PAGE HEADER & ALGORITHM TELEMETRY
       * ===================================================================== */}
      <div className="space-y-2 border-b border-subtle pb-5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan animate-signal" />
          <span className="text-xs font-mono uppercase tracking-wider text-faint">
            Dense + Sparse Retrieval
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
          Hybrid Passage Search
        </h1>
        <p className="text-sm text-muted max-w-3xl leading-relaxed">
          Executes simultaneous dense vector search (pgvector HNSW cosine index) and sparse lexical search
          (PostgreSQL full-text tsvector), merged with Reciprocal Rank Fusion (k = 60).
        </p>
      </div>

      {/* Retrieval-Only Provenance Notice */}
      <div className="p-3.5 bg-elevated/70 border border-subtle rounded-panel text-xs text-muted flex items-start gap-2.5">
        <Radio className="w-4 h-4 text-cyan shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-ink">Retrieval-Only Grounding: </span>
          Passages below are verbatim text extracts partitioned from authorized active documents.
          Scores reflect Reciprocal Rank Fusion weighting without synthetic model generation.
        </div>
      </div>

      {/* =====================================================================
       * SEARCH COMPOSER FORM
       * ===================================================================== */}
      <form onSubmit={handleSearchSubmit} className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            <input
              type="search"
              aria-label="Hybrid search query"
              placeholder="Search concepts, policy identifiers, runbook sections..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 text-sm bg-surface border border-subtle focus:border-accent focus:shadow-glow-violet rounded-control text-ink placeholder:text-faint transition-all outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-6 py-3 text-sm font-medium bg-accent hover:bg-accent-hover active:bg-accent-active disabled:opacity-40 text-white rounded-control shadow-xs transition-colors shrink-0"
          >
            {loading ? "Fusing RRF..." : "Search Passages"}
          </button>
        </div>

        {/* Quick Search Preset Tags */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-faint font-mono text-[11px]">Quick Queries:</span>
          {SEARCH_PRESETS.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handlePresetClick(preset)}
              className="px-2.5 py-1 bg-elevated/70 hover:bg-elevated border border-subtle hover:border-accent/40 rounded-control text-[11px] text-muted hover:text-ink transition-colors font-mono"
            >
              {preset}
            </button>
          ))}
        </div>
      </form>

      {/* =====================================================================
       * SEARCH RESULTS SECTION
       * ===================================================================== */}
      {loading && (
        <div className="space-y-4 animate-pulse pt-2">
          <div className="h-4 bg-elevated rounded-control w-1/4" />
          <div className="h-28 bg-surface border border-subtle rounded-panel" />
          <div className="h-28 bg-surface border border-subtle rounded-panel" />
          <div className="h-28 bg-surface border border-subtle rounded-panel" />
        </div>
      )}

      {!loading && searched && (
        <div className="space-y-4 pt-2">
          {/* Telemetry Summary Bar */}
          <div className="flex items-center justify-between px-1 text-xs font-mono text-faint border-b border-subtle pb-2">
            <span>
              Found {results.length} authorized passage{results.length === 1 ? "" : "s"}
              {totalCandidates !== null && ` (${totalCandidates} candidates evaluated)`}
            </span>
            <span className="text-accent uppercase">Mode: {mode} Fusion</span>
          </div>

          {results.length === 0 ? (
            <div className="p-12 bg-surface border border-subtle rounded-panel text-center space-y-2">
              <Search className="w-8 h-8 text-faint mx-auto mb-2" />
              <div className="text-sm font-semibold text-ink">No authorized passages matched your query</div>
              <p className="text-xs text-muted max-w-sm mx-auto">
                Try broader technical terms, or verify that relevant documents are uploaded and indexed.
              </p>
            </div>
          ) : (
            results.map((item, idx) => (
              <article
                key={item.chunk_id || idx}
                className="p-5 bg-surface border border-subtle hover:border-default rounded-panel space-y-3 shadow-xs transition-all"
              >
                {/* Result Header & Ranking Telemetry */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-block px-1.5 py-0.2 bg-cyan-soft border border-cyan-border text-cyan font-mono font-bold rounded-control text-xs">
                      [{item.label}]
                    </span>
                    <span className="font-bold text-ink truncate text-sm">
                      {item.document_title}
                    </span>
                  </div>

                  {/* Rank Telemetry Chips */}
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums">
                    {item.score !== undefined && (
                      <span className="px-2 py-0.5 bg-violet-soft border border-subtle text-accent rounded-control">
                        RRF: {item.score.toFixed(4)}
                      </span>
                    )}
                    {item.vector_rank !== null && (
                      <span className="px-2 py-0.5 bg-elevated border border-subtle text-muted rounded-control">
                        Vec #{item.vector_rank}
                      </span>
                    )}
                    {item.fts_rank !== null && (
                      <span className="px-2 py-0.5 bg-elevated border border-subtle text-muted rounded-control">
                        FTS #{item.fts_rank}
                      </span>
                    )}
                    {(item.page_start || item.heading_path) && (
                      <span className="px-2 py-0.5 bg-elevated border border-subtle text-faint rounded-control">
                        {item.page_start ? `Page ${item.page_start}` : item.heading_path}
                      </span>
                    )}
                  </div>
                </div>

                {/* Excerpt Body */}
                <p className="text-xs sm:text-sm text-ink leading-relaxed whitespace-pre-wrap font-sans bg-elevated/30 p-3.5 rounded-control border border-subtle/50 select-text">
                  {item.excerpt}
                </p>

                {/* Card Action Strip */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedCitation(item)}
                    className="inline-flex items-center gap-1.5 text-accent hover:text-accent-hover font-medium underline"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Inspect Full Source & Surrounding Context</span>
                  </button>

                  {item.document_id && (
                    <Link
                      href={`/documents/${item.document_id}`}
                      className="text-faint hover:text-ink font-mono text-[11px] inline-flex items-center gap-1"
                    >
                      <span>Document Record</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {/* Slide-over Verified Evidence Inspector */}
      <CitationDrawer
        citation={selectedCitation}
        onClose={() => setSelectedCitation(null)}
      />
    </div>
  );
}
