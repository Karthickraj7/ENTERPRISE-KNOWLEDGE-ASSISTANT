"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Send,
  Plus,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  AlertCircle,
  FileText,
  Search,
  Sparkles,
  Info,
  Radio,
  Cpu,
  Layers,
  ChevronRight,
  Database,
  ExternalLink
} from "lucide-react";
import { apiRequest, ApiClientError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { CitationDrawer, SelectedCitation } from "@/components/citations/CitationDrawer";
import { useToast } from "@/components/ui/Toast";

interface ChatTurn {
  question: string;
  answer: string | null;
  generation_status: "available" | "unavailable" | "degraded" | "insufficient_evidence";
  insufficient_evidence: boolean;
  provider_name: string;
  model_name: string | null;
  citations: SelectedCitation[];
  banner_message: string | null;
  message_id: string;
  request_id: string;
}

interface ConversationItem {
  id: string;
  title: string;
  message_count?: number;
  updated_at?: string;
}

const SAMPLE_QUERIES = [
  {
    title: "Session Security & Idle Timeouts",
    query: "How are session cookies secured and when do idle sessions expire?",
    badge: "Security Policy"
  },
  {
    title: "Default Embeddings & Vector Space",
    query: "What embedding model is used by default and what is its dimension?",
    badge: "Architecture"
  },
  {
    title: "Document Soft Deletion & Citations",
    query: "How does soft deletion and the purge workflow handle citations?",
    badge: "Data Governance"
  },
  {
    title: "Hybrid Retrieval & RRF Fusion",
    query: "How does the hybrid search combine vector cosine similarity and full-text search?",
    badge: "Retrieval SOP"
  }
];

// Helper to render markdown content with interactive citation chips
function FormattedAnswer({
  text,
  citations,
  onSelectCitation
}: {
  text: string;
  citations: SelectedCitation[];
  onSelectCitation: (cit: SelectedCitation) => void;
}) {
  const citationMap = new Map<string, SelectedCitation>();
  (citations || []).forEach((c) => {
    citationMap.set(c.label.toUpperCase(), c);
    citationMap.set(c.label.replace(/^S/i, ""), c);
  });

  // Split lines to detect code blocks, headings, lists, and tables
  const lines = text.split("\n");
  const renderedElements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let tableBuffer: string[] = [];

  function flushCodeBuffer(key: string) {
    if (codeBuffer.length === 0) return;
    const content = codeBuffer.join("\n");
    renderedElements.push(
      <pre
        key={key}
        className="p-3.5 my-3 bg-inset border border-subtle rounded-panel font-mono text-xs text-ink overflow-x-auto"
      >
        <code>{content}</code>
      </pre>
    );
    codeBuffer = [];
  }

  function flushTableBuffer(key: string) {
    if (tableBuffer.length === 0) return;
    const rows = tableBuffer.map((r) =>
      r
        .split("|")
        .map((c) => c.trim())
        .filter((c, i, arr) => i > 0 && i < arr.length - 1)
    );
    tableBuffer = [];

    if (rows.length === 0) return;

    renderedElements.push(
      <div key={key} className="overflow-x-auto my-3 border border-subtle rounded-panel">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-elevated border-b border-subtle">
              {rows[0].map((th, idx) => (
                <th key={idx} className="p-2.5 font-semibold text-ink">
                  {th}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle">
            {rows.slice(2).map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-elevated/30">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="p-2.5 text-ink font-mono text-[11px]">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Parse inline citation chips like [S1] or [S2]
  function renderInline(line: string, lineKey: string) {
    // Regex matching [S1], [S2], or [1], etc.
    const parts = line.split(/(\[S?\d+\])/g);
    return (
      <span key={lineKey}>
        {parts.map((part, pIdx) => {
          const match = part.match(/^\[(S?\d+)\]$/);
          if (match) {
            const label = match[1].toUpperCase();
            const cit =
              citationMap.get(label) ||
              citationMap.get(label.replace(/^S/, "")) ||
              citationMap.get(`S${label}`);

            if (cit) {
              return (
                <button
                  key={pIdx}
                  type="button"
                  onClick={() => onSelectCitation(cit)}
                  className="inline-flex items-center gap-0.5 mx-1 px-1.5 py-0.2 bg-cyan-soft hover:bg-cyan/20 border border-cyan-border text-cyan text-xs font-mono font-bold rounded-control transition-all hover:scale-105"
                  title={`Inspect evidence: ${cit.document_title}`}
                >
                  [{cit.label}]
                </button>
              );
            }
          }
          return part;
        })}
      </span>
    );
  }

  lines.forEach((line, idx) => {
    // Code block toggle
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBuffer(`code-${idx}`);
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    // Markdown Table rows
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      tableBuffer.push(line);
      return;
    } else if (tableBuffer.length > 0) {
      flushTableBuffer(`table-${idx}`);
    }

    // Headings
    if (line.startsWith("### ")) {
      renderedElements.push(
        <h4 key={`h4-${idx}`} className="text-sm font-bold text-ink mt-4 mb-2">
          {renderInline(line.replace("### ", ""), `h4-line-${idx}`)}
        </h4>
      );
      return;
    }
    if (line.startsWith("## ")) {
      renderedElements.push(
        <h3 key={`h3-${idx}`} className="text-base font-bold text-ink mt-5 mb-2 border-b border-subtle pb-1">
          {renderInline(line.replace("## ", ""), `h3-line-${idx}`)}
        </h3>
      );
      return;
    }

    // Lists
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      renderedElements.push(
        <li key={`li-${idx}`} className="ml-4 list-disc text-sm text-ink leading-relaxed my-1">
          {renderInline(line.replace(/^[-*]\s+/, ""), `li-line-${idx}`)}
        </li>
      );
      return;
    }

    // Empty lines
    if (!line.trim()) {
      renderedElements.push(<div key={`br-${idx}`} className="h-2" />);
      return;
    }

    // Standard paragraph
    renderedElements.push(
      <p key={`p-${idx}`} className="text-sm text-ink leading-relaxed my-1.5 font-sans">
        {renderInline(line, `p-line-${idx}`)}
      </p>
    );
  });

  if (inCodeBlock) flushCodeBuffer("code-tail");
  if (tableBuffer.length > 0) flushTableBuffer("table-tail");

  return <div className="space-y-1">{renderedElements}</div>;
}

export default function ChatWorkspacePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<SelectedCitation | null>(null);
  const [asking, setAsking] = useState(false);
  const [retrievalStage, setRetrievalStage] = useState<string>("Ready");
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, string>>({});
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Auto-load conversations list
  const loadConversations = useCallback(async () => {
    try {
      const res = await apiRequest<{ items: ConversationItem[] }>("/api/v1/conversations");
      setConversations(res.items || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations, turns.length]);

  // Scroll to bottom when new turn appears
  useEffect(() => {
    if (turns.length > 0) {
      conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [turns.length, asking]);

  // Dynamic textarea auto-height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [question]);

  async function handleAskSubmit(submittedQuestion?: string) {
    const q = (submittedQuestion !== undefined ? submittedQuestion : question).trim();
    if (!q || asking) return;

    setAsking(true);
    setError(null);
    setRetrievalStage("Querying hybrid vector & FTS index...");

    // Staged telemetry indicators to show progress
    const stageTimer1 = setTimeout(() => {
      setRetrievalStage("Reciprocal Rank Fusion (k=60) & passage reranking...");
    }, 450);

    const stageTimer2 = setTimeout(() => {
      setRetrievalStage("Evaluating evidence and synthesizing grounded response...");
    }, 900);

    try {
      const res = await apiRequest<ChatTurn & { conversation_id: string }>("/api/v1/chat/ask", {
        method: "POST",
        body: JSON.stringify({
          question: q,
          conversation_id: conversationId || undefined,
          top_k: 6
        })
      });

      setConversationId(res.conversation_id);
      setTurns((prev) => [...prev, res]);
      setQuestion("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      loadConversations();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({
          message: "Request timed out or failed. Your question has been preserved for retry."
        });
      }
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setAsking(false);
      setRetrievalStage("Ready");
    }
  }

  async function handleFeedback(messageId: string, rating: "helpful" | "unhelpful") {
    try {
      await apiRequest("/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({ message_id: messageId, rating })
      });
      setFeedbackSent((prev) => ({ ...prev, [messageId]: rating }));
      toast(
        rating === "helpful" ? "success" : "info",
        rating === "helpful"
          ? "Thank you for the verification feedback."
          : "Issue logged for RAG precision review."
      );
    } catch {
      toast("error", "Could not submit feedback.");
    }
  }

  function handleCopyAnswer(turnId: string, text: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedTurnId(turnId);
      toast("success", "Answer copied to clipboard.");
      setTimeout(() => setCopiedTurnId(null), 2000);
    }
  }

  function handleSelectConversation(id: string) {
    setConversationId(id);
    // In real app, load thread from api if desired
  }

  async function handleDeleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await apiRequest(`/api/v1/conversations/${id}`, { method: "DELETE" });
      if (conversationId === id) {
        setConversationId(null);
        setTurns([]);
      }
      await loadConversations();
      toast("info", "Research thread removed.");
    } catch {
      toast("error", "Could not delete thread.");
    }
  }

  function handleStartNewThread() {
    setConversationId(null);
    setTurns([]);
    setQuestion("");
    setError(null);
    textareaRef.current?.focus();
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-8rem)]">
      {/* =====================================================================
       * LEFT COLUMN: SAVED RESEARCH THREADS
       * ===================================================================== */}
      <aside className="w-full lg:w-72 shrink-0 flex flex-col justify-between bg-surface border border-subtle rounded-panel p-4 h-fit lg:sticky lg:top-20 space-y-4 shadow-xs">
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-subtle">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-accent" />
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-ink">
                Research Threads
              </h2>
            </div>
            <button
              type="button"
              onClick={handleStartNewThread}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded-control shadow-xs transition-colors"
              title="Start a new grounded research thread"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>

          {/* Conversation Thread List */}
          {conversations.length === 0 ? (
            <div className="py-8 text-center text-xs text-faint space-y-1">
              <Database className="w-6 h-6 mx-auto text-faint/60 mb-2" />
              <div>No saved threads yet</div>
              <div className="text-[11px] text-muted">
                Inquiries are automatically grouped and saved.
              </div>
            </div>
          ) : (
            <ul className="space-y-1 max-h-[380px] overflow-y-auto scrollbar-thin" aria-label="Saved conversations">
              {conversations.map((c) => {
                const isActive = conversationId === c.id;
                return (
                  <li key={c.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectConversation(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") handleSelectConversation(c.id);
                      }}
                      className={`group flex items-center justify-between px-3 py-2 rounded-control text-xs cursor-pointer transition-colors ${
                        isActive
                          ? "bg-accent/15 border border-accent/40 font-semibold text-ink"
                          : "text-muted hover:text-ink hover:bg-elevated"
                      }`}
                    >
                      <div className="min-w-0 flex-1 truncate pr-2">
                        <div className="truncate">{c.title}</div>
                        {c.message_count !== undefined && (
                          <div className="text-[10px] font-mono text-faint">
                            {c.message_count} turn{c.message_count === 1 ? "" : "s"}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteConversation(c.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-faint hover:text-red-400 rounded transition-opacity"
                        title="Delete thread"
                        aria-label={`Delete thread: ${c.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Local Provider Telemetry Badge */}
        {user && (
          <div className="p-3 bg-elevated/60 border border-subtle rounded-panel text-[11px] font-mono space-y-1">
            <div className="flex items-center justify-between text-faint">
              <span>Embedding Engine</span>
              <span className="text-emerald-400">Online</span>
            </div>
            <div className="text-ink font-semibold truncate">
              {user.features.embedding_model}
            </div>
            <div className="text-[10px] text-faint pt-1 border-t border-subtle/50">
              Dimensionality: {user.features.embedding_dim}d (CPU Cosine)
            </div>
          </div>
        )}
      </aside>

      {/* =====================================================================
       * MAIN RESEARCH CONSOLE CANVAS
       * ===================================================================== */}
      <section className="flex-1 flex flex-col justify-between min-w-0 space-y-6">
        {/* ===================================================================
         * INITIAL LANDING VIEW (When zero turns have been asked)
         * =================================================================== */}
        {turns.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center py-6 sm:py-10 max-w-reading mx-auto w-full space-y-8">
            {/* Editorial Header */}
            <div className="space-y-3 text-center sm:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-soft border border-subtle rounded-control text-xs font-mono text-accent">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Grounded Enterprise Intelligence</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight">
                Explore your organization&apos;s knowledge.
              </h1>
              <p className="text-sm sm:text-base text-muted leading-relaxed max-w-2xl">
                Every response is strictly bounded to authorized active documents, powered by local
                hybrid embeddings and verified with inline provenance citations.
              </p>
            </div>

            {/* Retrieval-Only Honest Mode Notice */}
            {user && !user.features.generation_available && (
              <div
                role="status"
                className="p-4 bg-status-processing-bg border border-status-processing-border rounded-panel text-xs text-status-processing space-y-1.5"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <Radio className="w-4 h-4 text-cyan" />
                  Retrieval-Only Mode Active (Provider Independent)
                </div>
                <p className="text-ink/80 leading-relaxed">
                  External LLM generation is currently unconfigured. Document ingestion, local CPU embeddings
                  ({user.features.embedding_model}), hybrid vector search, and verifiable source citations
                  are fully operational without third-party API dependencies.
                </p>
              </div>
            )}

            {/* Curated Research Starters */}
            <div className="space-y-3">
              <div className="text-xs font-mono uppercase tracking-wider text-faint flex items-center gap-2">
                <Search className="w-3.5 h-3.5" />
                <span>Curated Research Inquiries</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SAMPLE_QUERIES.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setQuestion(item.query);
                      handleAskSubmit(item.query);
                    }}
                    className="p-3.5 text-left bg-surface hover:bg-elevated border border-subtle hover:border-accent/50 rounded-panel space-y-1.5 transition-all group shadow-xs"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-accent font-semibold">{item.badge}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-faint group-hover:text-accent group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <div className="text-xs font-medium text-ink leading-snug">
                      {item.query}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ===================================================================
           * ACTIVE CONVERSATION CANVAS
           * =================================================================== */
          <div className="space-y-6 pb-4">
            {turns.map((turn, tIdx) => (
              <article
                key={turn.message_id || tIdx}
                className="space-y-4 bg-surface border border-subtle rounded-panel p-5 sm:p-6 shadow-sm"
              >
                {/* User Query Block */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-subtle">
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-accent flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                      Research Inquiry
                    </div>
                    <h2 className="text-base font-bold text-ink leading-snug">
                      {turn.question}
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono text-faint tabular-nums shrink-0">
                    Req: {turn.request_id?.slice(0, 8) || "local"}
                  </span>
                </div>

                {/* Optional Telemetry or Model Banner */}
                {turn.banner_message && (
                  <div
                    role="status"
                    className="p-3 bg-status-processing-bg border border-status-processing-border rounded-control text-xs text-status-processing"
                  >
                    {turn.banner_message}
                  </div>
                )}

                {/* Formatted Answer Body */}
                {turn.answer && (
                  <div className="prose-signal max-w-none">
                    <FormattedAnswer
                      text={turn.answer}
                      citations={turn.citations || []}
                      onSelectCitation={(cit) => setSelectedCitation(cit)}
                    />
                  </div>
                )}

                {/* Grounded Citation Evidence Gallery */}
                {turn.citations && turn.citations.length > 0 && (
                  <div className="space-y-2.5 pt-4 border-t border-subtle">
                    <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-faint">
                      <span className="flex items-center gap-1.5 text-cyan font-semibold">
                        <Layers className="w-3.5 h-3.5" />
                        Grounded Source Passages ({turn.citations.length})
                      </span>
                      <span>Click to Inspect Evidence</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {turn.citations.map((cit) => (
                        <button
                          key={`${turn.message_id}-${cit.label}`}
                          type="button"
                          onClick={() => setSelectedCitation(cit)}
                          className="p-3 text-left bg-elevated/40 hover:bg-elevated border border-subtle hover:border-cyan-border rounded-control space-y-1.5 transition-all group"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-cyan">
                              [{cit.label}] {cit.document_title}
                            </span>
                            <span className="text-[10px] font-mono text-faint tabular-nums">
                              {cit.page_start ? `p. ${cit.page_start}` : cit.heading_path || "Section"}
                            </span>
                          </div>
                          <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                            {cit.excerpt}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Toolbar */}
                <div className="pt-3 border-t border-subtle flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                  <div className="flex items-center gap-3 font-mono text-[11px] text-faint">
                    <span>Provider: {turn.provider_name}</span>
                    <span>|</span>
                    <span>Mode: {turn.generation_status}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {turn.answer && (
                      <button
                        type="button"
                        onClick={() => handleCopyAnswer(turn.message_id, turn.answer || "")}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs hover:text-ink bg-elevated border border-subtle rounded-control transition-colors"
                      >
                        {copiedTurnId === turn.message_id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Answer</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleFeedback(turn.message_id, "helpful")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-subtle rounded-control transition-colors ${
                        feedbackSent[turn.message_id] === "helpful"
                          ? "bg-status-indexed-bg text-status-indexed border-status-indexed-border"
                          : "hover:bg-elevated text-muted hover:text-ink"
                      }`}
                      title="Mark as helpful evidence"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>Helpful</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFeedback(turn.message_id, "unhelpful")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-subtle rounded-control transition-colors ${
                        feedbackSent[turn.message_id] === "unhelpful"
                          ? "bg-status-failed-bg text-status-failed border-status-failed-border"
                          : "hover:bg-elevated text-muted hover:text-ink"
                      }`}
                      title="Report an issue or poor citation"
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Report</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {/* In-Flight Processing Indicator */}
            {asking && (
              <div className="p-4 bg-surface border border-subtle rounded-panel space-y-2 animate-fade-in shadow-xs">
                <div className="flex items-center gap-2.5 text-xs font-mono text-cyan">
                  <span className="w-2 h-2 rounded-full bg-cyan animate-signal" />
                  <span className="font-semibold">{retrievalStage}</span>
                </div>
                <div className="h-1.5 w-full bg-elevated rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-accent to-cyan w-1/2 animate-pulse" />
                </div>
              </div>
            )}

            <div ref={conversationEndRef} />
          </div>
        )}

        {/* ===================================================================
         * RECOVERABLE ERROR BANNER
         * =================================================================== */}
        {error && (
          <div
            role="alert"
            className="p-4 bg-status-failed-bg border border-status-failed-border rounded-panel text-xs text-status-failed flex items-center justify-between gap-3 shadow-xs"
          >
            <div>
              <span className="font-semibold">Retrieval Notice: </span>
              {error.message} {error.requestId ? `[ID: ${error.requestId}]` : ""}
            </div>
            <button
              type="button"
              onClick={() => handleAskSubmit()}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-control shrink-0 shadow-xs transition-colors"
            >
              Retry Inquiry
            </button>
          </div>
        )}

        {/* ===================================================================
         * THE SIGNATURE QUESTION COMPOSER
         * =================================================================== */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAskSubmit();
          }}
          className="sticky bottom-4 z-10"
        >
          <div className="relative bg-surface border border-subtle focus-within:border-accent focus-within:shadow-glow-violet rounded-panel transition-all duration-normal shadow-md">
            {/* Context Header Strip */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-subtle/60 text-[11px] font-mono text-faint bg-elevated/40 rounded-t-panel">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-accent" />
                Target Corpus: All Authorized Enterprise Documents
              </span>
              <span className="hidden sm:inline">
                Press Enter to transmit, Shift+Enter for newline
              </span>
            </div>

            {/* Input Area */}
            <div className="p-3 flex items-end gap-3">
              <textarea
                ref={textareaRef}
                rows={1}
                value={question}
                disabled={asking}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAskSubmit();
                  }
                }}
                placeholder="Ask an analytical question across your authorized document corpus..."
                aria-label="Ask a question about your authorized documents"
                className="w-full bg-transparent text-sm text-ink placeholder:text-faint outline-none resize-none leading-relaxed min-h-[38px] max-h-[180px]"
              />

              <button
                type="submit"
                disabled={asking || !question.trim()}
                className="inline-flex items-center justify-center p-2.5 bg-accent hover:bg-accent-hover active:bg-accent-active disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-control shadow-xs transition-all shrink-0"
                aria-label="Submit question to assistant"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Verified Evidence Inspector Drawer */}
      <CitationDrawer
        citation={selectedCitation}
        onClose={() => setSelectedCitation(null)}
      />
    </div>
  );
}
