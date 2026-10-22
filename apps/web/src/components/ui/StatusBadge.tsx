import React from "react";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string; border: string }> = {
  indexed: {
    label: "Indexed",
    dot: "bg-emerald-500",
    bg: "bg-status-indexed-bg",
    text: "text-status-indexed",
    border: "border-status-indexed-border"
  },
  processing: {
    label: "Processing",
    dot: "bg-amber-500 animate-pulse",
    bg: "bg-status-processing-bg",
    text: "text-status-processing",
    border: "border-status-processing-border"
  },
  queued: {
    label: "Queued",
    dot: "bg-slate-400",
    bg: "bg-elevated",
    text: "text-muted",
    border: "border-subtle"
  },
  failed: {
    label: "Failed",
    dot: "bg-red-500",
    bg: "bg-status-failed-bg",
    text: "text-status-failed",
    border: "border-status-failed-border"
  },
  needs_ocr: {
    label: "Needs OCR",
    dot: "bg-orange-500",
    bg: "bg-status-warning-bg",
    text: "text-status-warning",
    border: "border-status-warning-border"
  }
};

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] || {
    label: status,
    dot: "bg-slate-400",
    bg: "bg-elevated",
    text: "text-muted",
    border: "border-subtle"
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium border rounded-control tabular-nums ${cfg.bg} ${cfg.text} ${cfg.border} ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
      }`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
