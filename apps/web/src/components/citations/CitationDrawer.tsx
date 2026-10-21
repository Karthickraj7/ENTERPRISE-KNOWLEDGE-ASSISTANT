"use client";

import React, { useEffect, useState } from "react";
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
  context_window: Array<{
    chunk_index: number;
    content: string;
    page_start: number | null;
    heading_path: string | null;
  }>;
}

interface CitationDrawerProps {
  citation: SelectedCitation | null;
  onClose: () => void;
}

export function CitationDrawer({ citation, onClose }: CitationDrawerProps) {
  const [detail, setDetail] = useState<SourceChunkDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!citation || !citation.chunk_id) {
      setDetail(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    apiRequest<SourceChunkDetail>(`/api/v1/sources/${citation.chunk_id}`)
      .then((res) => {
        if (active) setDetail(res);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 404) {
          setError("Source passage is no longer available or access has been revoked.");
        } else {
          setError("Could not load verified source passage.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [citation]);

  if (!citation) return null;

  return (
    <aside
      aria-label="Verified source citation inspector"
      className="fixed inset-y-0 right-0 z-40 w-full max-w-lg bg-surface border-l border-subtle shadow-lg flex flex-col"
    >
      <div className="px-5 py-4 border-b border-subtle flex items-center justify-between">
        <div>
          <span className="inline-block px-2 py-0.5 text-xs font-mono font-semibold bg-accent-soft text-accent rounded-control mr-2">
            [{citation.label}]
          </span>
          <h2 className="inline text-base font-semibold text-ink">
            Verified Source Passage
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-2.5 py-1 text-xs font-medium text-muted hover:text-ink border border-subtle rounded-control"
        >
          Close (Esc)
        </button>
      </div>

      <div className="p-5 overflow-y-auto flex-1 space-y-4">
        {loading && (
          <div role="status" className="space-y-3 animate-pulse">
            <div className="h-4 bg-elevated rounded-control w-3/4" />
            <div className="h-24 bg-elevated rounded-panel w-full" />
          </div>
        )}

        {error && (
          <div role="alert" className="p-4 border border-red-300 bg-red-50 text-red-900 rounded-panel text-sm">
            <p className="font-semibold">Source Not Available</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {!loading && !error && detail && (
          <>
            <div className="p-3.5 bg-elevated border border-subtle rounded-panel space-y-1 text-xs">
              <div className="font-semibold text-sm text-ink">{detail.document_title}</div>
              <div className="text-muted flex flex-wrap gap-3 tabular-nums">
                <span>File: {detail.filename}</span>
                <span>Version: v{detail.version}</span>
                {detail.page_start ? (
                  <span>Page: {detail.page_start}</span>
                ) : (
                  <span>Section: {detail.heading_path || "Root"}</span>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                Exact Cited Passage
              </h3>
              <blockquote className="p-4 bg-accent-soft/50 border-l-4 border-accent rounded-r-panel text-sm leading-relaxed text-ink whitespace-pre-wrap">
                {detail.content}
              </blockquote>
            </div>

            {detail.context_window && detail.context_window.length > 1 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                  Surrounding Document Context
                </h3>
                <div className="space-y-2">
                  {detail.context_window.map((cw) => (
                    <div
                      key={cw.chunk_index}
                      className="p-3 bg-elevated/60 border border-subtle rounded-panel text-xs text-muted whitespace-pre-wrap"
                    >
                      <div className="font-mono text-[11px] mb-1">
                        Chunk #{cw.chunk_index} {cw.page_start ? `| Page ${cw.page_start}` : cw.heading_path ? `| ${cw.heading_path}` : ""}
                      </div>
                      {cw.content}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between border-t border-subtle">
              <a
                href={`/documents/${detail.document_id}`}
                className="text-xs font-medium text-accent hover:underline"
              >
                Open Document Details & Version History
              </a>
              <a
                href={`/api/v1/documents/${detail.document_id}/file`}
                className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-control hover:bg-accent-hover"
              >
                Download Original File
              </a>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
