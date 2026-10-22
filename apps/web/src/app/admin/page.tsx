"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  ShieldAlert,
  Cpu,
  Layers,
  Users,
  RotateCw,
  Clock,
  Coins,
  History,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Database
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

interface UserItem {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface JobItem {
  id: string;
  document_title: string;
  version: number;
  status: string;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
}

interface AuditEvent {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
}

interface UsageBreakdown {
  kind: string;
  provider: string;
  model_name: string;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
}

interface UsageData {
  total_calls: number;
  total_estimated_cost_usd: number;
  breakdown: UsageBreakdown[];
}

interface ProviderData {
  embedding_provider?: {
    provider: string;
    model_name: string;
    dim: number;
  };
  generation_provider?: {
    provider: string;
    status: string;
  };
  allow_training_use_providers?: boolean;
  embedding_models_registry?: Array<{
    id: string;
    model_name: string;
    dim: number;
    status: string;
  }>;
}

export default function AdministrationPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [providers, setProviders] = useState<ProviderData | null>(null);
  const [migrationModel, setMigrationModel] = useState("intfloat/multilingual-e5-small");
  const [migrating, setMigrating] = useState(false);

  const loadAdminData = useCallback(async () => {
    try {
      const [uRes, jRes, aRes, usgRes, pRes] = await Promise.all([
        apiRequest<{ users: UserItem[] }>("/api/v1/admin/users"),
        apiRequest<{ jobs: JobItem[] }>("/api/v1/admin/jobs"),
        apiRequest<{ events: AuditEvent[] }>("/api/v1/admin/audit"),
        apiRequest<UsageData>("/api/v1/admin/usage"),
        apiRequest<ProviderData>("/api/v1/admin/providers")
      ]);
      setUsers(uRes.users || []);
      setJobs(jRes.jobs || []);
      setAuditEvents(aRes.events || []);
      setUsage(usgRes);
      setProviders(pRes);
    } catch {
      // Role guards handle forbidden states
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  async function handleRoleChange(userId: string, role: string) {
    try {
      await apiRequest("/api/v1/admin/users/role", {
        method: "PUT",
        body: JSON.stringify({ user_id: userId, role })
      });
      toast("success", `Updated user role to ${role} and rotated active sessions.`);
      await loadAdminData();
    } catch {
      toast("error", "Could not update user role.");
    }
  }

  async function handleRetryJob(jobId: string) {
    try {
      await apiRequest(`/api/v1/ingestion-jobs/${jobId}/retry`, { method: "POST" });
      toast("success", `Enqueued retry for ingestion job ${jobId.slice(0, 8)}.`);
      await loadAdminData();
    } catch {
      toast("error", "Failed to enqueue job retry.");
    }
  }

  async function handleStartMigration(e: React.FormEvent) {
    e.preventDefault();
    if (!migrationModel.trim()) return;
    setMigrating(true);
    try {
      await apiRequest("/api/v1/admin/embedding-migrations", {
        method: "POST",
        body: JSON.stringify({
          provider: "sentence_transformers",
          model_name: migrationModel.trim(),
          revision: "main",
          dim: 384,
          max_input_tokens: 512,
          query_prefix: "query: ",
          document_prefix: "passage: ",
          promote_immediately: false
        })
      });
      toast("success", `Registered embedding model '${migrationModel}' in building state.`);
      await loadAdminData();
    } catch {
      toast("error", "Could not register embedding model migration.");
    } finally {
      setMigrating(false);
    }
  }

  return (
    <div className="space-y-8 max-w-content mx-auto">
      {/* =====================================================================
       * PAGE HEADER
       * ===================================================================== */}
      <div className="space-y-1 border-b border-subtle pb-5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan animate-signal" />
          <span className="text-xs font-mono uppercase tracking-wider text-faint">
            Governance & Operational Controls
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
          Platform Administration & Governance
        </h1>
        <p className="text-sm text-muted">
          Manage tenant RBAC memberships, ingestion queues, embedding migrations, token usage accounting, and security audit logs.
        </p>
      </div>

      {/* =====================================================================
       * AI PROVIDER HEALTH & EMBEDDING MODEL REGISTRY
       * ===================================================================== */}
      {providers && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Provider Health */}
          <div className="bg-surface border border-subtle rounded-panel p-5 sm:p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 pb-3 border-b border-subtle">
              <Cpu className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-ink">AI Provider Health (Zero Secrets Exposed)</h2>
            </div>

            <div className="text-xs font-mono space-y-3 tabular-nums">
              <div className="flex items-center justify-between p-2.5 bg-elevated/40 border border-subtle rounded-control">
                <span className="text-faint">Embedding Provider</span>
                <span className="font-semibold text-ink">
                  {providers.embedding_provider?.provider} ({providers.embedding_provider?.model_name}, {providers.embedding_provider?.dim}d)
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-elevated/40 border border-subtle rounded-control">
                <span className="text-faint">Generation Provider</span>
                <span className="font-semibold text-cyan">
                  {providers.generation_provider?.provider} ({providers.generation_provider?.status})
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-elevated/40 border border-subtle rounded-control">
                <span className="text-faint">Training-Use Restriction</span>
                <span className="font-semibold text-emerald-400">
                  {providers.allow_training_use_providers ? "Allowed" : "Protected (Zero Retention)"}
                </span>
              </div>
            </div>
          </div>

          {/* Model Migration Form */}
          <form
            onSubmit={handleStartMigration}
            className="bg-surface border border-subtle rounded-panel p-5 sm:p-6 space-y-4 shadow-xs"
          >
            <div className="flex items-center gap-2 pb-3 border-b border-subtle">
              <Layers className="w-4 h-4 text-cyan" />
              <h2 className="text-sm font-semibold text-ink">Embedding Model Registry & Migration</h2>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Register a new dense vector model without mixing incompatible vector spaces. Models are staged in building state.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={migrationModel}
                onChange={(e) => setMigrationModel(e.target.value)}
                placeholder="Model identifier (e.g. sentence-transformers/...)"
                aria-label="Migration model name"
                className="flex-1 px-3 py-2 text-xs bg-elevated border border-subtle focus:border-accent rounded-control text-ink font-mono outline-none"
              />
              <button
                type="submit"
                disabled={migrating || !migrationModel.trim()}
                className="px-4 py-2 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded-control shadow-xs transition-colors shrink-0 disabled:opacity-50"
              >
                {migrating ? "Registering..." : "Stage Model"}
              </button>
            </div>

            <div className="divide-y divide-subtle text-xs font-mono pt-1">
              {(providers.embedding_models_registry || []).map((m) => (
                <div key={m.id} className="py-2 flex items-center justify-between">
                  <span className="text-ink truncate">{m.model_name} ({m.dim}d)</span>
                  <span className="uppercase text-[10px] px-2 py-0.5 bg-elevated border border-subtle rounded text-faint">
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          </form>
        </section>
      )}

      {/* =====================================================================
       * TENANT USERS & RBAC ROLES TABLE
       * ===================================================================== */}
      <section className="bg-surface border border-subtle rounded-panel p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-subtle">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-ink">Tenant Users & RBAC Permissions</h2>
          </div>
          <span className="text-xs font-mono text-faint">
            {users.length} Active Member{users.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-subtle text-faint font-mono uppercase tracking-wider bg-elevated/40">
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Email Address</th>
                <th className="py-2.5 px-3">Current Role</th>
                <th className="py-2.5 px-3 text-right">Modify Permission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-elevated/30">
                  <td className="py-3 px-3 font-semibold text-ink">{u.full_name}</td>
                  <td className="py-3 px-3 text-muted font-mono">{u.email}</td>
                  <td className="py-3 px-3 font-mono uppercase text-accent font-medium">{u.role}</td>
                  <td className="py-3 px-3 text-right">
                    <select
                      aria-label={`Change role for ${u.email}`}
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className="px-2.5 py-1 text-xs bg-elevated border border-subtle focus:border-accent rounded-control text-ink font-mono outline-none"
                    >
                      <option value="viewer">viewer</option>
                      <option value="contributor">contributor</option>
                      <option value="knowledge_admin">knowledge_admin</option>
                      <option value="system_admin">system_admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* =====================================================================
       * INGESTION JOBS QUEUE
       * ===================================================================== */}
      <section className="bg-surface border border-subtle rounded-panel p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-subtle">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan" />
            <h2 className="text-sm font-semibold text-ink">Ingestion Pipeline & Retry Engine</h2>
          </div>
          <span className="text-xs font-mono text-faint">
            {jobs.length} Monitored Job{jobs.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs tabular-nums font-mono">
            <thead>
              <tr className="border-b border-subtle text-faint uppercase tracking-wider bg-elevated/40">
                <th className="py-2.5 px-3">Job ID</th>
                <th className="py-2.5 px-3">Document Version</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Attempts</th>
                <th className="py-2.5 px-3">Error Code</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-elevated/30">
                  <td className="py-3 px-3 text-faint">{j.id.slice(0, 10)}...</td>
                  <td className="py-3 px-3 font-semibold text-ink font-sans">
                    {j.document_title} (v{j.version})
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="py-3 px-3 text-muted">
                    {j.attempts} / {j.max_attempts}
                  </td>
                  <td className="py-3 px-3 text-red-400">
                    {j.error_code || "None"}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {j.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => handleRetryJob(j.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent hover:bg-accent-hover text-white rounded-control transition-colors"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* =====================================================================
       * TOKEN USAGE & SECURITY AUDIT LOGS
       * ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token Usage Accounting */}
        <section className="bg-surface border border-subtle rounded-panel p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 pb-3 border-b border-subtle">
            <Coins className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-ink">Token Usage & Cost Accounting</h2>
          </div>

          {usage && (
            <div className="text-xs font-mono space-y-3 tabular-nums">
              <div className="p-3 bg-elevated/40 border border-subtle rounded-control flex items-center justify-between">
                <span className="text-faint">Total Pipeline Invocations: {usage.total_calls}</span>
                <span className="font-bold text-accent">
                  Est. Spend: ${usage.total_estimated_cost_usd.toFixed(4)}
                </span>
              </div>

              <div className="divide-y divide-subtle">
                {(usage.breakdown || []).map((b, i) => (
                  <div key={i} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-ink">{b.kind}</div>
                      <div className="text-[11px] text-faint">
                        {b.provider} / {b.model_name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-muted">
                        {b.total_tokens_in} in / {b.total_tokens_out} out
                      </div>
                      <div className="text-accent text-[11px] font-bold">
                        ${b.total_cost_usd.toFixed(4)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Immutable Security Audit Trail */}
        <section className="bg-surface border border-subtle rounded-panel p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 pb-3 border-b border-subtle">
            <History className="w-4 h-4 text-cyan" />
            <h2 className="text-sm font-semibold text-ink">Immutable Security Audit Trail</h2>
          </div>

          <div className="divide-y divide-subtle text-xs font-mono max-h-72 overflow-y-auto scrollbar-thin">
            {auditEvents.map((ev) => (
              <div key={ev.id} className="py-2.5 flex items-center justify-between gap-2 tabular-nums">
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{ev.action}</div>
                  <div className="text-[11px] text-faint truncate">
                    {ev.resource_type}: {ev.resource_id || "global"}
                  </div>
                </div>
                <span className="text-faint text-[11px] shrink-0">
                  {ev.created_at.slice(11, 19)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
