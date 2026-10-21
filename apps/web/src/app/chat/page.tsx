"use client";

import React, { useState, useEffect } from "react";
import { apiRequest, ApiClientError } from "@/lib/api";
import { CitationDrawer, SelectedCitation } from "@/components/citations/CitationDrawer";

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

export default function ChatWorkspacePage() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedCitation, setSelectedCitation] = useState<SelectedCitation | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, string>>({});

  useEffect(() => {
    apiRequest<{ items: Array<{ id: string; title: string }> }>("/api/v1/conversations")
      .then((res) => setConversations(res.items || []))
      .catch(() => {});
  }, [turns.length]);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    setAsking(true);
    setError(null);

    try {
      const res = await apiRequest<ChatTurn & { conversation_id: string }>("/api/v1/chat/ask", {
        method: "POST",
        body: JSON.stringify({
          question: trimmed,
          conversation_id: conversationId || undefined,
          top_k: 6
        })
      });
      setConversationId(res.conversation_id);
      setTurns((prev) => [...prev, res]);
      setQuestion("");
    } catch (err: unknown) {
      // Preserve the user's question in input on error so they can retry without retyping
      if (err instanceof ApiClientError) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: "Request timed out or failed. Your question has been preserved for retry." });
      }
    } finally {
      setAsking(false);
    }
  }

  async function handleFeedback(messageId: string, rating: "helpful" | "unhelpful") {
    await apiRequest("/api/v1/feedback", {
      method: "POST",
      body: JSON.stringify({ message_id: messageId, rating })
    });
    setFeedbackSent((prev) => ({ ...prev, [messageId]: rating }));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Conversation History Column */}
      <aside className="bg-surface border border-subtle rounded-panel p-4 space-y-4 lg:col-span-1 h-fit">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Conversations</h2>
          <button
            type="button"
            onClick={() => {
              setConversationId(null);
              setTurns([]);
            }}
            className="px-2.5 py-1 text-xs font-medium bg-accent text-white rounded-control"
          >
            New Thread
          </button>
        </div>
        {conversations.length === 0 ? (
          <p className="text-xs text-muted">No saved threads yet.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setConversationId(c.id)}
                  className={`w-full text-left px-2.5 py-2 rounded-control truncate ${
                    conversationId === c.id ? "bg-elevated font-semibold text-ink" : "text-muted hover:bg-elevated/50"
                  }`}
                >
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Main RAG Chat Workspace */}
      <section className="lg:col-span-3 flex flex-col space-y-5">
        <div className="border-b border-subtle pb-4">
          <h1 className="text-2xl font-bold text-ink">Grounded RAG Assistant</h1>
          <p className="text-sm text-muted mt-1">
            Answers are strictly bounded to authorized active documents and verified with inline [S1] citations.
          </p>
        </div>

        <div className="space-y-6">
          {turns.length === 0 && (
            <div className="p-8 bg-surface border border-subtle rounded-panel space-y-3">
              <div className="text-sm font-semibold text-ink">Ask a question about your authorized documents</div>
              <p className="text-xs text-muted">
                Example queries based on the sample corpus:
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  "How are session cookies secured and when do idle sessions expire?",
                  "What embedding model is used by default and what is its dimension?",
                  "How does soft deletion and the purge workflow handle citations?"
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setQuestion(sample)}
                    className="px-3 py-1.5 text-xs bg-elevated border border-subtle rounded-control hover:border-accent text-left"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.message_id} className="bg-surface border border-subtle rounded-panel p-5 space-y-4">
              <div className="text-sm font-semibold text-ink">Q: {turn.question}</div>

              {turn.banner_message && (
                <div
                  role="status"
                  className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-control text-xs text-amber-900 dark:text-amber-200"
                >
                  {turn.banner_message}
                </div>
              )}

              {turn.answer && (
                <div className="text-sm leading-relaxed text-ink whitespace-pre-wrap">
                  {turn.answer}
                </div>
              )}

              {/* Verifiable Citations List */}
              {turn.citations && turn.citations.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-subtle">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Verified Source Passages (Click to Inspect Original)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {turn.citations.map((cit) => (
                      <button
                        key={`${turn.message_id}-${cit.label}`}
                        type="button"
                        onClick={() => setSelectedCitation(cit)}
                        className="p-3 text-left bg-elevated/60 hover:bg-elevated border border-subtle rounded-control space-y-1 transition-colors"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-accent">
                            [{cit.label}] {cit.document_title}
                          </span>
                          <span className="text-[11px] font-mono text-muted tabular-nums">
                            {cit.page_start ? `Page ${cit.page_start}` : cit.heading_path || "Section"}
                          </span>
                        </div>
                        <p className="text-xs text-muted line-clamp-2">{cit.excerpt}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Copy & Feedback Controls */}
              <div className="pt-2 flex items-center justify-between text-xs text-muted border-t border-subtle">
                <div className="font-mono text-[11px]">
                  Mode: {turn.generation_status} | Provider: {turn.provider_name}
                </div>
                <div className="flex items-center gap-3">
                  {turn.answer && (
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(turn.answer || "")}
                      className="hover:text-ink underline"
                    >
                      Copy Answer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleFeedback(turn.message_id, "helpful")}
                    className={`px-2 py-0.5 border border-subtle rounded-control ${
                      feedbackSent[turn.message_id] === "helpful" ? "bg-emerald-100 text-emerald-900" : ""
                    }`}
                  >
                    Helpful
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFeedback(turn.message_id, "unhelpful")}
                    className={`px-2 py-0.5 border border-subtle rounded-control ${
                      feedbackSent[turn.message_id] === "unhelpful" ? "bg-red-100 text-red-900" : ""
                    }`}
                  >
                    Report Issue
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-panel text-xs text-red-900 flex items-center justify-between">
            <div>
              <span className="font-semibold">Error: </span>
              {error.message} {error.requestId ? `(Request ID: ${error.requestId})` : ""}
            </div>
            <button
              type="button"
              onClick={handleAsk}
              className="px-3 py-1 bg-red-700 text-white rounded-control font-medium"
            >
              Retry Question
            </button>
          </div>
        )}

        <form onSubmit={handleAsk} className="flex gap-3">
          <input
            type="text"
            aria-label="Ask a question about your authorized documents"
            placeholder="Ask a question about policies, architecture, or procedures..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="flex-1 px-4 py-3 text-sm bg-surface border border-subtle rounded-control"
          />
          <button
            type="submit"
            disabled={asking}
            className="px-5 py-3 text-sm font-medium bg-accent text-white rounded-control hover:bg-accent-hover"
          >
            {asking ? "Retrieving..." : "Ask Assistant"}
          </button>
        </form>
      </section>

      <CitationDrawer citation={selectedCitation} onClose={() => setSelectedCitation(null)} />
    </div>
  );
}
