"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  ArrowRight,
  Sparkles,
  Cpu,
  Radio,
  AlertCircle
} from "lucide-react";
import { apiRequest, ApiClientError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function SignInPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState("admin@acme-corp.internal");
  const [fullName, setFullName] = useState("Ada Lovelace");
  const [role, setRole] = useState("system_admin");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    try {
      const data = await apiRequest<{ authorization_url: string }>("/auth/google/login");
      window.location.href = data.authorization_url;
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(`${err.message} [ID: ${err.requestId}]`);
      } else {
        setError("Google Workspace OAuth is not active on this environment. Use the isolated local developer authentication below.");
      }
    }
  }

  async function handleDevSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest("/auth/dev/login", {
        method: "POST",
        body: JSON.stringify({ email, full_name: fullName, role })
      });
      await refreshUser();
      router.push("/");
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(`${err.message} (Code: ${err.errorCode})`);
      } else {
        setError("Local authentication failed. Check backend connectivity.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-canvas bg-signal-grid relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-accent/15 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md bg-surface border border-subtle rounded-panel p-6 sm:p-8 space-y-6 relative z-10 shadow-overlay">
        {/* Knowledge Signal Emblem */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="relative w-9 h-9 flex items-center justify-center rounded-panel bg-[#0D1220] border border-[#263047] shadow-xs">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-5 h-5"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M12 2L21 12L12 21L3 12L12 2Z"
                  stroke="#9B8CFF"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 7L17 12L12 17L7 12L12 7Z"
                  fill="rgba(103, 223, 245, 0.22)"
                  stroke="#67DFF5"
                  strokeWidth="1.2"
                />
                <circle cx="12" cy="12" r="1.5" fill="#F2F5FC" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#67DFF5] animate-ping" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#67DFF5]" />
            </div>

            <span className="px-2 py-0.5 bg-elevated border border-subtle rounded-control font-mono text-[10px] text-faint uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Tenant Boundary
            </span>
          </div>

          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-accent flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Knowledge Signal v2.0</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight mt-1">
              Sign in to Knowledge Workspace
            </h1>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              Provider-independent grounded intelligence, pgvector hybrid search, and verified provenance.
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 bg-status-failed-bg border border-status-failed-border rounded-panel text-xs text-status-failed flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-snug">{error}</div>
          </div>
        )}

        {/* Primary Enterprise OIDC Action */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full py-2.5 px-4 bg-accent hover:bg-accent-hover active:bg-accent-active text-white font-medium text-xs sm:text-sm rounded-control shadow-xs transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-cyan" />
            <span>Continue with Google Workspace (OIDC)</span>
          </button>
          <p className="text-[10px] text-faint text-center leading-normal">
            Server-side OAuth 2.0 PKCE flow with encrypted HttpOnly session cookies.
          </p>
        </div>

        {/* Isolated Local Developer Form */}
        <div className="border-t border-subtle pt-5 space-y-4">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-faint flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-accent" />
            <span>Isolated Local Development Sign-In</span>
          </div>

          <form onSubmit={handleDevSignIn} className="space-y-3.5">
            <div className="space-y-1">
              <label htmlFor="dev-email" className="block text-xs font-medium text-ink">
                Work Email
              </label>
              <input
                id="dev-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-elevated border border-subtle focus:border-accent rounded-control text-ink outline-none font-mono"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="dev-name" className="block text-xs font-medium text-ink">
                Operator Full Name
              </label>
              <input
                id="dev-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-elevated border border-subtle focus:border-accent rounded-control text-ink outline-none"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="dev-role" className="block text-xs font-medium text-ink">
                Assigned RBAC Role
              </label>
              <select
                id="dev-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-elevated border border-subtle focus:border-accent rounded-control text-ink outline-none font-mono"
              >
                <option value="viewer">Viewer (Read & Search Only)</option>
                <option value="contributor">Contributor (Upload & Ask)</option>
                <option value="knowledge_admin">Knowledge Admin (Manage Docs & Jobs)</option>
                <option value="system_admin">System Admin (Full Tenant Control)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-elevated hover:bg-inset border border-subtle text-ink font-semibold text-xs sm:text-sm rounded-control transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <span>{submitting ? "Establishing Session..." : "Sign In to Workspace"}</span>
              <ArrowRight className="w-3.5 h-3.5 text-accent" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
