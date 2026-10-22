"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Files,
  MessageSquare,
  Search,
  Settings,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Command,
  Sun,
  Moon,
  LogOut,
  Radio,
  Cpu,
  Layers,
  Database
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { CommandPalette } from "@/components/ui/CommandPalette";

interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  minRole: "viewer" | "contributor" | "knowledge_admin" | "system_admin";
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Overview",
    description: "System Telemetry & Signals",
    icon: LayoutDashboard,
    minRole: "viewer"
  },
  {
    href: "/chat",
    label: "Research Chat",
    description: "Grounded AI Inquiries",
    icon: MessageSquare,
    minRole: "viewer"
  },
  {
    href: "/search",
    label: "Hybrid Search",
    description: "Vector & Full-Text Fusion",
    icon: Search,
    minRole: "viewer"
  },
  {
    href: "/documents",
    label: "Corpus Library",
    description: "Ingestion & Provenance",
    icon: Files,
    minRole: "viewer"
  },
  {
    href: "/settings",
    label: "Configuration",
    description: "Preferences & Sessions",
    icon: Settings,
    minRole: "viewer"
  },
  {
    href: "/admin",
    label: "Governance",
    description: "RBAC & Model Registry",
    icon: ShieldAlert,
    minRole: "knowledge_admin"
  }
];

const ROLE_WEIGHT: Record<string, number> = {
  viewer: 1,
  contributor: 2,
  knowledge_admin: 3,
  system_admin: 4
};

// Geometric Knowledge Signal Mark
function KnowledgeSignalLogo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-8 h-8 shrink-0 flex items-center justify-center rounded-panel bg-[#0D1220] border border-[#263047] shadow-xs">
        {/* Futuristic aperture graphic */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="w-5 h-5"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Outer diamond */}
          <path
            d="M12 2L21 12L12 21L3 12L12 2Z"
            stroke="#9B8CFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Inner core */}
          <path
            d="M12 7L17 12L12 17L7 12L12 7Z"
            fill="rgba(103, 223, 245, 0.22)"
            stroke="#67DFF5"
            strokeWidth="1.2"
          />
          {/* Center signal node */}
          <circle cx="12" cy="12" r="1.5" fill="#F2F5FC" />
        </svg>
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#67DFF5] animate-ping" />
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#67DFF5]" />
      </div>

      {!collapsed && (
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold tracking-tight text-ink">
              Knowledge Signal
            </span>
            <span className="px-1.5 py-0.2 bg-violet-soft border border-subtle text-[10px] font-mono text-accent rounded-control">
              v2.0
            </span>
          </div>
          <div className="text-[11px] font-mono text-faint truncate">
            AI Research Console
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Keyboard shortcut listener for Command Palette (Cmd+K / Ctrl+K)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Login page bypasses shell layout entirely
  if (pathname === "/login") {
    return <main className="min-h-screen bg-canvas text-ink">{children}</main>;
  }

  const userRoleWeight = ROLE_WEIGHT[user?.active_tenant?.role || "viewer"] || 1;
  const visibleNav = NAV_ITEMS.filter(
    (item) => userRoleWeight >= (ROLE_WEIGHT[item.minRole] || 1)
  );

  // Active page title resolution
  const currentNav = NAV_ITEMS.find(
    (item) =>
      pathname === item.href ||
      (item.href !== "/" && pathname?.startsWith(item.href))
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-canvas text-ink antialiased">
      {/* =====================================================================
       * MOBILE HEADER (Viewports < 768px)
       * ===================================================================== */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-subtle sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <KnowledgeSignalLogo collapsed={false} />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="p-2 text-muted hover:text-ink bg-elevated border border-subtle rounded-control"
            aria-label="Open command search"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="mobile-sidebar"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 text-muted hover:text-ink bg-elevated border border-subtle rounded-control"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-[var(--bg-overlay)] overlay-enter"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* =====================================================================
       * DESKTOP & MOBILE SIDEBAR NAVIGATION
       * ===================================================================== */}
      <aside
        id="primary-sidebar"
        aria-label="Primary Workspace Navigation"
        className={`fixed md:sticky top-0 left-0 z-40 h-screen flex flex-col justify-between bg-surface border-r border-subtle transition-all duration-normal select-none ${
          mobileOpen
            ? "translate-x-0 w-72 shadow-overlay"
            : "-translate-x-full md:translate-x-0"
        } ${collapsed ? "md:w-16" : "md:w-64"}`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-subtle flex items-center justify-between gap-2">
          <KnowledgeSignalLogo collapsed={collapsed} />
          {/* Collapse desktop toggle */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex p-1 text-faint hover:text-ink hover:bg-elevated rounded-control transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
          {/* Mobile close toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1 text-faint hover:text-ink"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Runtime Diagnostics Pill (Visible when expanded) */}
        {!collapsed && user && (
          <div className="px-3 pt-3">
            <div className="p-2.5 bg-elevated/70 border border-subtle rounded-panel text-[11px] space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-muted">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-accent" />
                  Embeddings
                </span>
                <span className="font-semibold text-ink">
                  {user.features.embedding_provider === "sentence_transformers"
                    ? "Local (384d)"
                    : user.features.embedding_provider}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted border-t border-subtle/50 pt-1">
                <span className="flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-cyan" />
                  Mode
                </span>
                <span className="font-semibold text-cyan">
                  {user.features.generation_available
                    ? user.features.generation_provider
                    : "Retrieval-Only"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="p-3 flex-1 overflow-y-auto space-y-1" aria-label="Main Navigation">
          {visibleNav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : undefined}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-control text-sm transition-all duration-fast ${
                  active
                    ? "bg-accent text-white font-medium shadow-xs"
                    : "text-muted hover:text-ink hover:bg-elevated"
                } ${collapsed ? "justify-center px-2" : ""}`}
              >
                {/* Active indicator bar */}
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-cyan rounded-r" />
                )}

                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    active ? "text-white" : "text-faint group-hover:text-accent"
                  }`}
                />

                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{item.label}</div>
                    <div
                      className={`text-[10px] truncate leading-tight ${
                        active ? "text-white/75" : "text-faint"
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Quick Command Palette Launcher Trigger */}
        <div className="p-3 border-t border-subtle">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={`w-full flex items-center gap-2 px-2.5 py-2 text-xs font-mono text-faint hover:text-ink bg-elevated/60 hover:bg-elevated border border-subtle rounded-control transition-colors ${
              collapsed ? "justify-center" : "justify-between"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Command className="w-3.5 h-3.5 text-accent" />
              {!collapsed && <span>Command Menu</span>}
            </span>
            {!collapsed && (
              <kbd className="px-1.5 py-0.5 text-[9px] bg-canvas border border-subtle rounded">
                Ctrl+K
              </kbd>
            )}
          </button>
        </div>

        {/* User Account / Tenant Footer */}
        <div className="p-3 border-t border-subtle bg-elevated/30">
          {user ? (
            <div className={`space-y-2 ${collapsed ? "text-center" : ""}`}>
              {!collapsed ? (
                <div>
                  <div className="text-xs font-medium text-ink truncate">
                    {user.full_name}
                  </div>
                  <div className="text-[11px] text-faint truncate">{user.email}</div>
                  <div className="flex items-center justify-between pt-1.5">
                    <span className="px-1.5 py-0.5 bg-canvas border border-subtle rounded-control font-mono uppercase text-[9px] text-accent">
                      {user.active_tenant?.role || "viewer"}
                    </span>
                    <button
                      type="button"
                      onClick={logout}
                      className="inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 transition-colors"
                      title="Sign out"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={logout}
                  className="p-2 text-faint hover:text-red-400 rounded-control mx-auto block"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="block w-full py-1.5 text-center text-xs font-medium bg-accent text-white rounded-control"
            >
              Sign In
            </Link>
          )}
        </div>
      </aside>

      {/* =====================================================================
       * MAIN APPLICATION CONTENT AREA
       * ===================================================================== */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Contextual Desktop Top Bar */}
        <header className="hidden md:flex items-center justify-between px-6 py-3 bg-surface/90 backdrop-blur border-b border-subtle sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-faint uppercase tracking-wider">
              Workspace / {user?.active_tenant?.name || "Acme Enterprise"}
            </span>
            <span className="text-faint">/</span>
            <span className="text-sm font-semibold text-ink">
              {currentNav?.label || "Console"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Status Telemetry Beacon */}
            {user && (
              <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 bg-elevated/70 border border-subtle rounded-control text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-signal" />
                <span className="text-faint">Index Status:</span>
                <span className="text-emerald-400 font-medium">Synced</span>
                <span className="text-subtle">|</span>
                <span className="text-faint">RAG Model:</span>
                <span className="text-accent font-medium">
                  {user.features.embedding_model}
                </span>
              </div>
            )}

            {/* Quick Command Launcher */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted hover:text-ink bg-elevated hover:bg-inset border border-subtle rounded-control transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-faint" />
              <span>Quick Search</span>
              <kbd className="px-1.5 py-0.2 text-[9px] font-mono bg-canvas border border-subtle rounded text-faint">
                Ctrl+K
              </kbd>
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="p-2 text-muted hover:text-ink bg-elevated hover:bg-inset border border-subtle rounded-control transition-colors"
              aria-label="Toggle visual theme"
              title={resolvedTheme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"}
            >
              {resolvedTheme === "dark" ? (
                <Sun className="w-3.5 h-3.5 text-amber-300" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-violet" />
              )}
            </button>
          </div>
        </header>

        {/* Main Routed Page Surface */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-content w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
