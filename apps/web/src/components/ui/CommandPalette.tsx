"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  FileText,
  MessageSquare,
  Settings,
  Shield,
  Sun,
  Moon,
  Monitor,
  LogOut
} from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { useAuth } from "@/lib/auth-context";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
  section: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { setTheme } = useTheme();
  const { logout } = useAuth();

  const commands: CommandItem[] = useMemo(() => [
    {
      id: "nav-dashboard",
      label: "Dashboard",
      description: "Knowledge workspace overview",
      icon: <LayoutDashboard className="w-4 h-4" />,
      action: () => { router.push("/"); onClose(); },
      keywords: ["home", "overview", "workspace"],
      section: "Navigation"
    },
    {
      id: "nav-documents",
      label: "Documents",
      description: "Browse and manage document library",
      icon: <FileText className="w-4 h-4" />,
      action: () => { router.push("/documents"); onClose(); },
      keywords: ["files", "upload", "library", "pdf"],
      section: "Navigation"
    },
    {
      id: "nav-chat",
      label: "RAG Chat",
      description: "Ask questions with source citations",
      icon: <MessageSquare className="w-4 h-4" />,
      action: () => { router.push("/chat"); onClose(); },
      keywords: ["ask", "question", "assistant", "conversation"],
      section: "Navigation"
    },
    {
      id: "nav-search",
      label: "Hybrid Search",
      description: "Search passages across all documents",
      icon: <Search className="w-4 h-4" />,
      action: () => { router.push("/search"); onClose(); },
      keywords: ["find", "query", "vector", "retrieval"],
      section: "Navigation"
    },
    {
      id: "nav-settings",
      label: "Settings",
      description: "Account and preferences",
      icon: <Settings className="w-4 h-4" />,
      action: () => { router.push("/settings"); onClose(); },
      keywords: ["preferences", "account", "profile"],
      section: "Navigation"
    },
    {
      id: "nav-admin",
      label: "Administration",
      description: "Platform governance and user management",
      icon: <Shield className="w-4 h-4" />,
      action: () => { router.push("/admin"); onClose(); },
      keywords: ["users", "roles", "audit", "admin"],
      section: "Navigation"
    },
    {
      id: "theme-light",
      label: "Switch to Light Theme",
      icon: <Sun className="w-4 h-4" />,
      action: () => { setTheme("light"); onClose(); },
      keywords: ["light", "bright"],
      section: "Theme"
    },
    {
      id: "theme-dark",
      label: "Switch to Dark Theme",
      icon: <Moon className="w-4 h-4" />,
      action: () => { setTheme("dark"); onClose(); },
      keywords: ["dark", "night"],
      section: "Theme"
    },
    {
      id: "theme-system",
      label: "Use System Theme",
      icon: <Monitor className="w-4 h-4" />,
      action: () => { setTheme("system"); onClose(); },
      keywords: ["system", "auto", "default"],
      section: "Theme"
    },
    {
      id: "auth-logout",
      label: "Sign Out",
      icon: <LogOut className="w-4 h-4" />,
      action: () => { logout(); onClose(); },
      keywords: ["logout", "sign out", "exit"],
      section: "Account"
    }
  ], [router, onClose, setTheme, logout]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q) ||
        cmd.keywords?.some((k) => k.includes(q))
    );
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
    if (open) {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      }
      if (e.key === "Enter" && filtered[activeIndex]) {
        e.preventDefault();
        filtered[activeIndex].action();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, filtered, activeIndex]);

  useEffect(() => {
    if (listRef.current) {
      const active = listRef.current.querySelector("[data-active='true']");
      active?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  if (!open) return null;

  const sections = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4">
      <div
        className="fixed inset-0 bg-[var(--bg-overlay)] overlay-enter"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg bg-surface border border-subtle rounded-panel shadow-overlay palette-enter overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 border-b border-subtle">
          <Search className="w-4 h-4 text-faint shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands..."
            className="flex-1 py-3 bg-transparent text-sm text-ink placeholder:text-faint outline-none"
            aria-label="Search commands"
          />
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono text-faint bg-elevated border border-subtle rounded">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-72 overflow-y-auto p-1.5 scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">
              No matching commands found
            </div>
          ) : (
            Object.entries(sections).map(([section, items]) => (
              <div key={section}>
                <div className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
                  {section}
                </div>
                {items.map((cmd) => {
                  const globalIndex = filtered.indexOf(cmd);
                  const isActive = globalIndex === activeIndex;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      data-active={isActive}
                      onClick={cmd.action}
                      onMouseEnter={() => setActiveIndex(globalIndex)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-control transition-colors ${
                        isActive
                          ? "bg-accent text-white"
                          : "text-ink hover:bg-elevated"
                      }`}
                    >
                      <span className={`shrink-0 ${isActive ? "text-white" : "text-muted"}`}>
                        {cmd.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{cmd.label}</div>
                        {cmd.description && (
                          <div className={`text-xs truncate ${isActive ? "text-white/70" : "text-muted"}`}>
                            {cmd.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-subtle flex items-center gap-4 text-[10px] text-faint">
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 py-0.5 font-mono bg-elevated border border-subtle rounded text-[9px]">&uarr;</kbd>
            <kbd className="px-1 py-0.5 font-mono bg-elevated border border-subtle rounded text-[9px]">&darr;</kbd>
            Navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 py-0.5 font-mono bg-elevated border border-subtle rounded text-[9px]">&crarr;</kbd>
            Select
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 py-0.5 font-mono bg-elevated border border-subtle rounded text-[9px]">ESC</kbd>
            Close
          </span>
        </div>
      </div>
    </div>
  );
}

