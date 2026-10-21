"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
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
        setError(`${err.message} (Request ID: ${err.requestId})`);
      } else {
        setError("Google OAuth is not configured on this instance. Use the isolated local development login below.");
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
        setError("Authentication failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-canvas">
      <div className="w-full max-w-md bg-surface border border-subtle rounded-panel p-8 space-y-6">
        <div className="space-y-2">
          <div className="text-xs font-mono uppercase tracking-wider text-muted">
            Acme Enterprise Security Boundary
          </div>
          <h1 className="text-2xl font-bold text-ink">
            Sign in to Knowledge Workspace
          </h1>
          <p className="text-sm text-muted">
            Access authorized company documents, hybrid vector and full-text search, and verifiable source citations.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3.5 bg-red-50 border border-red-200 text-red-900 rounded-panel text-xs">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full py-2.5 px-4 bg-accent text-white font-medium text-sm rounded-control hover:bg-accent-hover transition-colors"
          >
            Continue with Google Workspace (OIDC)
          </button>
          <p className="text-[11px] text-muted text-center">
            Uses server-side OAuth 2.0 authorization code flow with PKCE and HttpOnly session cookies. No tokens are stored in browser storage.
          </p>
        </div>

        <div className="border-t border-subtle pt-5">
          <form onSubmit={handleDevSignIn} className="space-y-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">
              Isolated Local Development Sign-In
            </div>
            <div>
              <label htmlFor="dev-email" className="block text-xs font-medium text-ink mb-1">
                Work Email
              </label>
              <input
                id="dev-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-canvas border border-subtle rounded-control"
              />
            </div>
            <div>
              <label htmlFor="dev-name" className="block text-xs font-medium text-ink mb-1">
                Full Name
              </label>
              <input
                id="dev-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-canvas border border-subtle rounded-control"
              />
            </div>
            <div>
              <label htmlFor="dev-role" className="block text-xs font-medium text-ink mb-1">
                Tenant Role
              </label>
              <select
                id="dev-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-canvas border border-subtle rounded-control"
              >
                <option value="viewer">Viewer (Read & Search Only)</option>
                <option value="contributor">Contributor (Upload & Ask)</option>
                <option value="knowledge_admin">Knowledge Admin (Manage Docs & Jobs)</option>
                <option value="system_admin">System Admin (Full Tenant & Provider Control)</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 px-4 bg-elevated border border-subtle text-ink font-medium text-sm rounded-control hover:bg-subtle/40"
            >
              {submitting ? "Creating Session..." : "Sign In (Local Development Mode)"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
