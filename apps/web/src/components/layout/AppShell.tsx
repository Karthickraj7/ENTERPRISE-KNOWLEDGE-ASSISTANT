"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", minRole: "viewer" },
  { href: "/documents", label: "Documents", minRole: "viewer" },
  { href: "/chat", label: "RAG Chat", minRole: "viewer" },
  { href: "/search", label: "Hybrid Search", minRole: "viewer" },
  { href: "/settings", label: "Settings", minRole: "viewer" },
  { href: "/admin", label: "Administration", minRole: "knowledge_admin" }
];

const ROLE_WEIGHT: Record<string, number> = {
  viewer: 1,
  contributor: 2,
  knowledge_admin: 3,
  system_admin: 4
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (pathname === "/login") {
    return <main className="min-h-screen bg-canvas text-ink">{children}</main>;
  }

  const userRoleWeight = ROLE_WEIGHT[user?.active_tenant.role || "viewer"] || 1;
  const visibleNav = NAV_ITEMS.filter((item) => userRoleWeight >= (ROLE_WEIGHT[item.minRole] || 1));

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-canvas text-ink">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-subtle">
        <div className="font-semibold text-sm tracking-tight">
          Enterprise Knowledge Assistant
        </div>
        <button
          type="button"
          aria-expanded={mobileNavOpen}
          aria-controls="primary-sidebar"
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="px-3 py-1.5 text-xs font-medium border border-subtle rounded-control bg-elevated"
        >
          {mobileNavOpen ? "Close Menu" : "Menu"}
        </button>
      </header>

      {/* Responsive Sidebar */}
      <aside
        id="primary-sidebar"
        aria-label="Primary Workspace Navigation"
        className={`${
          mobileNavOpen ? "block" : "hidden"
        } md:flex md:flex-col md:w-64 bg-surface border-r border-subtle shrink-0 justify-between`}
      >
        <div className="p-5 space-y-6">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-muted">
              {user?.active_tenant.name || "Enterprise Workspace"}
            </div>
            <div className="text-base font-bold text-ink mt-0.5">
              Knowledge Assistant
            </div>
          </div>

          {/* Provider Status Pill */}
          {user && (
            <div className="p-3 bg-elevated border border-subtle rounded-panel text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted">Embeddings:</span>
                <span className="font-mono font-medium text-ink">
                  {user.features.embedding_provider === "sentence_transformers" ? "Local (384d)" : user.features.embedding_provider}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Generation:</span>
                <span className="font-mono font-medium text-ink">
                  {user.features.generation_available
                    ? user.features.generation_provider
                    : "Retrieval-Only"}
                </span>
              </div>
            </div>
          )}

          <nav className="space-y-1" aria-label="Main sections">
            {visibleNav.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={`block px-3 py-2 text-sm font-medium rounded-control transition-colors ${
                    active
                      ? "bg-accent text-white"
                      : "text-ink hover:bg-elevated"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-subtle text-xs space-y-2">
          {user ? (
            <>
              <div className="font-medium text-ink truncate">{user.full_name}</div>
              <div className="text-muted truncate">{user.email}</div>
              <div className="flex items-center justify-between pt-1">
                <span className="px-2 py-0.5 bg-elevated border border-subtle rounded-control font-mono uppercase text-[10px]">
                  {user.active_tenant.role}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <Link
              href="/login"
              className="block w-full text-center px-3 py-2 bg-accent text-white font-medium rounded-control"
            >
              Sign in
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 p-6 md:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
