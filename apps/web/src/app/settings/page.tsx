"use client";

import React, { useEffect, useState } from "react";
import {
  Settings,
  User,
  Shield,
  Sun,
  Moon,
  Laptop,
  Monitor,
  Cpu,
  Radio,
  Lock,
  LogOut,
  Check,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Key
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useToast } from "@/components/ui/Toast";

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
  const { theme: activeTheme, setTheme: setActiveTheme } = useTheme();
  const { toast } = useToast();

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string>("dark");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    apiRequest<{ sessions: SessionItem[] }>("/api/v1/sessions")
      .then((res) => setSessions(res.sessions || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.preferences?.theme) {
      setSelectedTheme(user.preferences.theme);
    } else {
      setSelectedTheme(activeTheme);
    }
    if (user?.preferences?.reduced_motion !== undefined) {
      setReducedMotion(user.preferences.reduced_motion);
    }
  }, [user, activeTheme]);

  async function handleSavePreferences(e: React.FormEvent) {
    e.preventDefault();
    setSavingPrefs(true);
    try {
      await apiRequest("/api/v1/me/preferences", {
        method: "PUT",
        body: JSON.stringify({
          theme: selectedTheme,
          reduced_motion: reducedMotion,
          high_contrast: false
        })
      });

      // Apply to local theme context and DOM
      setActiveTheme(selectedTheme as "light" | "dark" | "system");
      toast("success", "Interface preferences synchronized to your profile.");
      await refreshUser();
    } catch {
      toast("error", "Could not save preferences to server.");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleRevokeOtherSessions() {
    setRevoking(true);
    try {
      const res = await apiRequest<{ revoked_count: number }>("/api/v1/sessions/revoke-others", {
        method: "POST"
      });
      toast("info", `Revoked ${res.revoked_count} other active session(s).`);
      const updated = await apiRequest<{ sessions: SessionItem[] }>("/api/v1/sessions");
      setSessions(updated.sessions || []);
    } catch {
      toast("error", "Failed to revoke other sessions.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* =====================================================================
       * PAGE HEADER
       * ===================================================================== */}
      <div className="space-y-1 border-b border-subtle pb-5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan animate-signal" />
          <span className="text-xs font-mono uppercase tracking-wider text-faint">
            Security & Controls
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
          Account, Session & System Settings
        </h1>
        <p className="text-sm text-muted">
          Manage your server-side session credentials, visual theme accessibility, and view runtime provider specifications.
        </p>
      </div>

      {/* =====================================================================
       * IDENTITY & TENANT MEMBERSHIP
       * ===================================================================== */}
      {user && (
        <section className="bg-surface border border-subtle rounded-panel p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-subtle">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-ink">Identity & Active Tenant Membership</h2>
            </div>
            <span className="px-2 py-0.5 bg-violet-soft border border-subtle rounded-control font-mono uppercase text-[10px] text-accent font-semibold">
              RBAC: {user.active_tenant.role}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3 bg-elevated/40 border border-subtle rounded-control space-y-1">
              <div className="text-faint">Operator Name</div>
              <div className="text-sm font-semibold text-ink">{user.full_name}</div>
            </div>
            <div className="p-3 bg-elevated/40 border border-subtle rounded-control space-y-1">
              <div className="text-faint">Corporate Email</div>
              <div className="text-sm font-semibold text-ink truncate">{user.email}</div>
            </div>
            <div className="p-3 bg-elevated/40 border border-subtle rounded-control space-y-1">
              <div className="text-faint">Authorized Tenant</div>
              <div className="text-sm font-semibold text-ink">{user.active_tenant.name}</div>
            </div>
            <div className="p-3 bg-elevated/40 border border-subtle rounded-control space-y-1">
              <div className="text-faint">Tenant Namespace</div>
              <div className="text-sm font-semibold text-accent font-mono">{user.active_tenant.slug}</div>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
       * AI RUNTIME CAPABILITIES SPECIFICATION
       * ===================================================================== */}
      {user && (
        <section className="bg-surface border border-subtle rounded-panel p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 pb-3 border-b border-subtle">
            <Cpu className="w-4 h-4 text-cyan" />
            <h2 className="text-sm font-semibold text-ink">Runtime Vector & AI Provider Specifications</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-3.5 bg-elevated/40 border border-subtle rounded-control space-y-1">
              <span className="text-faint text-[10px] uppercase">Embedding Provider</span>
              <div className="font-bold text-ink truncate">{user.features.embedding_provider}</div>
              <div className="text-muted text-[11px]">{user.features.embedding_model}</div>
            </div>

            <div className="p-3.5 bg-elevated/40 border border-subtle rounded-control space-y-1">
              <span className="text-faint text-[10px] uppercase">Vector Space</span>
              <div className="font-bold text-accent">{user.features.embedding_dim} Dimensions</div>
              <div className="text-muted text-[11px]">HNSW Cosine Parity</div>
            </div>

            <div className="p-3.5 bg-elevated/40 border border-subtle rounded-control space-y-1">
              <span className="text-faint text-[10px] uppercase">Generation Engine</span>
              <div className="font-bold text-cyan truncate">
                {user.features.generation_available
                  ? user.features.generation_provider
                  : "Retrieval-Only (Local)"}
              </div>
              <div className="text-muted text-[11px]">
                {user.features.generation_model || "Zero-API Grounding"}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
       * THEME & ACCESSIBILITY CONTROLS
       * ===================================================================== */}
      <form onSubmit={handleSavePreferences} className="bg-surface border border-subtle rounded-panel p-5 sm:p-6 space-y-5 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-subtle">
          <Monitor className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-ink">Visual Console Theme & Motion (WCAG 2.2 AA)</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="theme-select" className="block text-xs font-medium text-ink">
              Color Theme Palette
            </label>
            <select
              id="theme-select"
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-elevated border border-subtle focus:border-accent rounded-control text-ink outline-none"
            >
              <option value="dark">Futuristic Dark Console (#080B12)</option>
              <option value="light">Crisp Editorial Light (#F6F8FC)</option>
              <option value="system">Follow Operating System Sync</option>
            </select>
            <p className="text-[11px] text-faint">
              Strictly verified for WCAG 2.2 AA contrast parity across all 7 workspaces.
            </p>
          </div>

          <div className="flex flex-col justify-center space-y-1.5 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
                className="w-4 h-4 rounded border-subtle bg-elevated text-accent focus:ring-0"
              />
              <span className="font-medium">Reduced motion mode</span>
            </label>
            <p className="text-[11px] text-faint pl-6">
              Suppresses animated state transitions in accordance with prefers-reduced-motion.
            </p>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={savingPrefs}
            className="px-4 py-2 text-xs font-medium bg-accent hover:bg-accent-hover active:bg-accent-active disabled:opacity-40 text-white rounded-control shadow-xs transition-colors"
          >
            {savingPrefs ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </form>

      {/* =====================================================================
       * ACTIVE SERVER-SIDE SESSIONS
       * ===================================================================== */}
      <section className="bg-surface border border-subtle rounded-panel p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-subtle">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-ink">Active Server-Side Sessions</h2>
            </div>
            <p className="text-xs text-muted">
              Authenticated HttpOnly session cookies managed on the backend with SHA-256 tokens.
            </p>
          </div>

          <button
            type="button"
            disabled={revoking}
            onClick={handleRevokeOtherSessions}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-elevated hover:bg-inset text-ink border border-subtle rounded-control transition-colors disabled:opacity-50 shrink-0"
          >
            <LogOut className="w-3.5 h-3.5 text-faint" />
            <span>{revoking ? "Revoking..." : "Revoke Other Sessions"}</span>
          </button>
        </div>

        <div className="divide-y divide-subtle text-xs font-mono">
          {sessions.map((s) => (
            <div key={s.session_id_prefix} className="py-3 flex flex-wrap items-center justify-between gap-3 tabular-nums">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink">Prefix: {s.session_id_prefix}...</span>
                  {s.is_current && (
                    <span className="px-2 py-0.5 bg-status-indexed-bg text-status-indexed border border-status-indexed-border rounded-control text-[10px] font-bold">
                      Current Session
                    </span>
                  )}
                </div>
                <div className="text-faint text-[11px] truncate max-w-md">{s.user_agent}</div>
              </div>
              <div className="text-right text-[11px] text-faint">
                <div>Expires: {s.expires_at.slice(0, 19).replace("T", " ")}</div>
                <div>Last Seen: {s.last_seen_at.slice(0, 19).replace("T", " ")}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
