import React from "react";

interface StatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  indexed: {
    label: "Indexed",
    classes: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
  },
  processing: {
    label: "Processing",
    classes: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
  },
  queued: {
    label: "Queued",
    classes: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
  },
  failed: {
    label: "Failed",
    classes: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800"
  },
  needs_ocr: {
    label: "Needs OCR",
    classes: "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800"
  }
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_STYLES[status] || {
    label: status,
    classes: "bg-slate-100 text-slate-700 border-slate-300"
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-control tabular-nums ${cfg.classes}`}
    >
      {cfg.label}
    </span>
  );
}
