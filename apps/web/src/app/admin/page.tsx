"use client";

import React, { useEffect, useState, useCallback } from "react";
import { apiRequest } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";

export default function AdministrationPage() {
  const [users, setUsers] = useState<Array<any>>([]);
  const [jobs, setJobs] = useState<Array<any>>([]);
  const [auditEvents, setAuditEvents] = useState<Array<any>>([]);
  const [usage, setUsage] = useState<any>(null);
  const [providers, setProviders] = useState<any>(null);
  const [migrationModel, setMigrationModel] = useState("intfloat/multilingual-e5-small");
  const [adminNotice, setAdminNotice] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    try {
      const [uRes, jRes, aRes, usgRes, pRes] = await Promise.all([
        apiRequest<{ users: Array<any> }>("/api/v1/admin/users"),
        apiRequest<{ jobs: Array<any> }>("/api/v1/admin/jobs"),
        apiRequest<{ events: Array<any> }>("/api/v1/admin/audit"),
        apiRequest<any>("/api/v1/admin/usage"),
        apiRequest<any>("/api/v1/admin/providers")
      ]);
      setUsers(uRes.users || []);
      setJobs(jRes.jobs || []);
      setAuditEvents(aRes.events || []);
      setUsage(usgRes);
      setProviders(pRes);
    } catch {
      // Handled by role guard
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  async function handleRoleChange(userId: string, role: string) {
    await apiRequest("/api/v1/admin/users/role", {
      method: "PUT",
      body: JSON.stringify({ user_id: userId, role })
    });
    setAdminNotice(`Updated user role to ${role} and rotated active sessions.`);
    await loadAdminData();
  }

  async function handleRetryJob(jobId: string) {
    await apiRequest(`/api/v1/ingestion-jobs/${jobId}/retry`, { method: "POST" });
    setAdminNotice(`Retried job ${jobId}.`);
    await loadAdminData();
  }

  async function handleStartMigration(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest("/api/v1/admin/embedding-migrations", {
      method: "POST",
      body: JSON.stringify({
        provider: "sentence_transformers",
        model_name: migrationModel,
        revision: "main",
        dim: 384,
        max_input_tokens: 512,
        query_prefix: "query: ",
        document_prefix: "passage: ",
        promote_immediately: false
      })
    });
    setAdminNotice(`Registered embedding model '${migrationModel}' in building state.`);
    await loadAdminData();
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-subtle pb-4">
        <h1 className="text-2xl font-bold text-ink">Platform Administration & Governance</h1>
        <p className="text-sm text-muted mt-1">
          Manage tenant RBAC memberships, ingestion queues, embedding migrations, usage costs, and security audit logs.
        </p>
      </div>

      {adminNotice && (
        <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-panel text-xs">
          {adminNotice}
        </div>
      )}

      {/* Provider Health & Embedding Model Registry */}
      {providers && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface border border-subtle rounded-panel p-5 space-y-3">
            <h2 className="text-sm font-semibold text-ink">AI Provider Health (No Secrets Exposed)</h2>
            <div className="text-xs space-y-2 tabular-nums">
              <div className="flex justify-between py-1 border-b border-subtle">
                <span className="text-muted">Embedding Provider:</span>
                <span className="font-mono font-medium">
                  {providers.embedding_provider?.provider} ({providers.embedding_provider?.model_name}, {providers.embedding_provider?.dim}d)
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-subtle">
                <span className="text-muted">Generation Provider:</span>
                <span className="font-mono font-medium">
                  {providers.generation_provider?.provider} ({providers.generation_provider?.status})
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted">Allow Training-Use Providers:</span>
                <span className="font-mono font-medium">
                  {providers.allow_training_use_providers ? "true" : "false (Protected)"}
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={handleStartMigration} className="bg-surface border border-subtle rounded-panel p-5 space-y-3">
            <h2 className="text-sm font-semibold text-ink">Embedding Model Registry & Migration</h2>
            <p className="text-xs text-muted">
              Register a new embedding model (such as multilingual-e5-small) without mixing incompatible vector spaces.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={migrationModel}
                onChange={(e) => setMigrationModel(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs bg-canvas border border-subtle rounded-control"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-control"
              >
                Start Migration
              </button>
            </div>
            <div className="divide-y divide-subtle text-xs pt-2">
              {(providers.embedding_models_registry || []).map((m: any) => (
                <div key={m.id} className="py-1.5 flex items-center justify-between font-mono">
                  <span>{m.model_name} ({m.dim}d)</span>
                  <span className="uppercase text-[11px] px-2 py-0.5 bg-elevated rounded-control">{m.status}</span>
                </div>
              ))}
            </div>
          </form>
        </section>
      )}

      {/* User & Role Management */}
      <section className="bg-surface border border-subtle rounded-panel p-5 space-y-3">
        <h2 className="text-sm font-semibold text-ink">Tenant Users & RBAC Roles</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-subtle text-muted">
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Email</th>
                <th className="py-2 px-3">Role</th>
                <th className="py-2 px-3 text-right">Change Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 px-3 font-medium text-ink">{u.full_name}</td>
                  <td className="py-2.5 px-3 text-muted">{u.email}</td>
                  <td className="py-2.5 px-3 font-mono uppercase">{u.role}</td>
                  <td className="py-2.5 px-3 text-right">
                    <select
                      aria-label={`Change role for ${u.email}`}
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className="px-2 py-1 bg-canvas border border-subtle rounded-control"
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

      {/* Ingestion Jobs Queue */}
      <section className="bg-surface border border-subtle rounded-panel p-5 space-y-3">
        <h2 className="text-sm font-semibold text-ink">Ingestion Jobs & Retry Queue</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs tabular-nums">
            <thead>
              <tr className="border-b border-subtle text-muted">
                <th className="py-2 px-3">Job ID</th>
                <th className="py-2 px-3">Document</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Attempts</th>
                <th className="py-2 px-3">Error Code</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="py-2 px-3 font-mono">{j.id}</td>
                  <td className="py-2 px-3">{j.document_title} (v{j.version})</td>
                  <td className="py-2 px-3"><StatusBadge status={j.status} /></td>
                  <td className="py-2 px-3">{j.attempts} / {j.max_attempts}</td>
                  <td className="py-2 px-3 font-mono text-red-600">{j.error_code || "-"}</td>
                  <td className="py-2 px-3 text-right">
                    {j.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => handleRetryJob(j.id)}
                        className="px-2.5 py-1 bg-accent text-white rounded-control"
                      >
                        Retry Job
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Usage & Audit Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-surface border border-subtle rounded-panel p-5 space-y-3">
          <h2 className="text-sm font-semibold text-ink">Token Usage & Cost Accounting</h2>
          {usage && (
            <div className="text-xs space-y-2 tabular-nums">
              <div className="font-semibold">
                Total Calls: {usage.total_calls} | Estimated Spend: ${usage.total_estimated_cost_usd.toFixed(4)}
              </div>
              <div className="divide-y divide-subtle">
                {(usage.breakdown || []).map((b: any, i: number) => (
                  <div key={i} className="py-2 flex justify-between">
                    <span>{b.kind} ({b.provider} / {b.model_name})</span>
                    <span>{b.total_tokens_in} in / {b.total_tokens_out} out (${b.total_cost_usd.toFixed(4)})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="bg-surface border border-subtle rounded-panel p-5 space-y-3">
          <h2 className="text-sm font-semibold text-ink">Immutable Security Audit Events</h2>
          <div className="divide-y divide-subtle text-xs max-h-64 overflow-y-auto">
            {auditEvents.map((ev) => (
              <div key={ev.id} className="py-2 flex items-center justify-between gap-2 tabular-nums">
                <div>
                  <span className="font-mono font-semibold text-ink">{ev.action}</span>
                  <span className="text-muted ml-2">({ev.resource_type}: {ev.resource_id || "-"})</span>
                </div>
                <span className="text-muted text-[11px]">{ev.created_at.slice(11, 19)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
