"use client";

import React, { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface SessionItem {
  session_id_prefix: string;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  is_current: boolean;
}

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [theme, setTheme] = useState("system");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ sessions: SessionItem[] }>("/api/v1/sessions")
      .then((res) => setSessions(res.sessions || []))
      .catch(() => {});
  }, []);

  async function handleSavePreferences(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest("/api/v1/me/preferences", {
      method: "PUT",
      body: JSON.stringify({ theme, reduced_motion: reducedMotion, high_contrast: false })
    });
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (theme === "light") {
      document.documentElement.classList.remove("dark");
    }
    setSavedNotice("Preferences saved.");
    await refreshUser();
  }

  async function handleRevokeOtherSessions() {
    const res = await apiRequest<{ revoked_count: number }>("/api/v1/sessions/revoke-others", {
      method: "POST"
    });
    setSavedNotice(`Revoked ${res.revoked_count} other session(s).`);
    const updated = await apiRequest<{ sessions: SessionItem[] }>("/api/v1/sessions");
    setSessions(updated.sessions || []);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-subtle pb-4">
        <h1 className="text-2xl font-bold text-ink">Account, Session & Accessibility Settings</h1>
        <p className="text-sm text-muted mt-1">
          Manage your server-side sessions, visual preferences, and inspect runtime AI provider status.
        </p>
      </div>

      {savedNotice && (
        <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-panel text-xs">
          {savedNotice}
        </div>
      )}

      {/* User & Tenant Profile */}
      {user && (
        <section className="bg-surface border border-subtle rounded-panel p-5 space-y-3">
          <h2 className="text-sm font-semibold text-ink">Identity & Tenant Membership</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-muted">Full Name</div>
              <div className="font-medium text-ink mt-0.5">{user.full_name}</div>
            </div>
            <div>
              <div className="text-muted">Verified Email</div>
              <div className="font-medium text-ink mt-0.5">{user.email}</div>
            </div>
            <div>
              <div className="text-muted">Active Tenant</div>
              <div className="font-medium text-ink mt-0.5">{user.active_tenant.name}</div>
            </div>
            <div>
              <div className="text-muted">Assigned RBAC Role</div>
              <div className="font-mono uppercase font-semibold text-accent mt-0.5">
                {user.active_tenant.role}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Theme & Accessibility */}
      <form onSubmit={handleSavePreferences} className="bg-surface border border-subtle rounded-panel p-5 space-y-4">
        <h2 className="text-sm font-semibold text-ink">Theme & Accessibility (WCAG 2.2 AA)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="theme-select" className="block text-xs font-medium text-ink mb-1">
              Color Theme
            </label>
            <select
              id="theme-select"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-canvas border border-subtle rounded-control"
            >
              <option value="system">System Default</option>
              <option value="light">Warm Editorial Light (#FAF9F5)</option>
              <option value="dark">High-Contrast Slate Dark (#0E1116)</option>
            </select>
          </div>
          <div className="flex items-center pt-5">
            <label className="inline-flex items-center gap-2 text-xs text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
              />
              Prefer reduced motion across transitions
            </label>
          </div>
        </div>
        <button
          type="submit"
          className="px-4 py-2 text-xs font-medium bg-accent text-white rounded-control hover:bg-accent-hover"
        >
          Save Preferences
        </button>
      </form>

      {/* Active Sessions */}
      <section className="bg-surface border border-subtle rounded-panel p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Active Server-Side Sessions</h2>
          <button
            type="button"
            onClick={handleRevokeOtherSessions}
            className="px-3 py-1.5 text-xs font-medium border border-subtle rounded-control hover:bg-elevated"
          >
            Revoke Other Sessions
          </button>
        </div>
        <div className="divide-y divide-subtle text-xs">
          {sessions.map((s) => (
            <div key={s.session_id_prefix} className="py-2.5 flex items-center justify-between tabular-nums">
              <div>
                <span className="font-mono font-semibold text-ink">Session {s.session_id_prefix}...</span>
                {s.is_current && (
                  <span className="ml-2 px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-control text-[10px]">
                    Current
                  </span>
                )}
                <div className="text-muted mt-0.5">{s.user_agent}</div>
              </div>
              <div className="text-right text-muted">
                <div>Expires: {s.expires_at.slice(0, 19).replace("T", " ")}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
