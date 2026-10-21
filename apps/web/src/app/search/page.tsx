"use client";

import React, { useState } from "react";
import { apiRequest } from "@/lib/api";
import { CitationDrawer, SelectedCitation } from "@/components/citations/CitationDrawer";

interface SearchResultItem extends SelectedCitation {
  vector_rank: number | null;
  fts_rank: number | null;
}

export default function SearchWorkspacePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [mode, setMode] = useState<string>("hybrid");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<SelectedCitation | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ mode: string; passages: SearchResultItem[] }>("/api/v1/search", {
        method: "POST",
        body: JSON.stringify({ query: query.trim(), top_k: 10 })
      });
      setResults(res.passages || []);
      setMode(res.mode);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-subtle pb-4">
        <h1 className="text-2xl font-bold text-ink">Hybrid Passage Search</h1>
        <p className="text-sm text-muted mt-1">
          Combines pgvector cosine similarity with PostgreSQL full-text search using Reciprocal Rank Fusion (k = 60).
        </p>
      </div>

      <div className="p-3.5 bg-elevated border border-subtle rounded-panel text-xs text-muted">
        <span className="font-semibold text-ink">Retrieval-Only Provenance Notice: </span>
        Results below are direct verbatim passages extracted from authorized active documents, not AI-generated summaries.
      </div>

      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="search"
          aria-label="Hybrid search query"
          placeholder="Search terms, policy codes, or natural language concepts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 px-4 py-2.5 text-sm bg-surface border border-subtle rounded-control"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 text-sm font-medium bg-accent text-white rounded-control hover:bg-accent-hover"
        >
          {loading ? "Searching..." : "Search Passages"}
        </button>
      </form>

      {searched && (
        <div className="space-y-3">
          <div className="text-xs font-mono text-muted tabular-nums">
            Found {results.length} authorized passages (Retrieval mode: {mode})
          </div>
          {results.length === 0 ? (
            <div className="p-8 bg-surface border border-subtle rounded-panel text-center text-sm text-muted">
              No authorized passages matched your query.
            </div>
          ) : (
            results.map((item) => (
              <article
                key={item.chunk_id}
                className="p-5 bg-surface border border-subtle rounded-panel space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-semibold text-ink">
                    <span className="font-mono text-accent mr-2">[{item.label}]</span>
                    {item.document_title}
                  </div>
                  <div className="font-mono text-muted tabular-nums flex items-center gap-3">
                    <span>RRF Score: {item.score?.toFixed(4)}</span>
                    <span>Vec Rank: {item.vector_rank ?? "-"}</span>
                    <span>FTS Rank: {item.fts_rank ?? "-"}</span>
                    <span>{item.page_start ? `Page ${item.page_start}` : item.heading_path || "Section"}</span>
                  </div>
                </div>
                <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{item.excerpt}</p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCitation(item)}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Inspect Full Source Context
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      <CitationDrawer citation={selectedCitation} onClose={() => setSelectedCitation(null)} />
    </div>
  );
}
