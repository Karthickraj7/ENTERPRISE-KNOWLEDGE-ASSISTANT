import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

const VARIANT_CLASSES = {
  primary: "bg-accent text-white hover:bg-accent-hover active:bg-accent-active border-transparent shadow-xs",
  secondary: "bg-surface text-ink border-subtle hover:bg-elevated active:bg-inset",
  ghost: "bg-transparent text-muted hover:text-ink hover:bg-elevated border-transparent",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 border-transparent shadow-xs"
};

const SIZE_CLASSES = {
  sm: "px-2.5 py-1.5 text-xs gap-1.5",
  md: "px-3.5 py-2 text-sm gap-2",
  lg: "px-5 py-2.5 text-sm gap-2"
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium rounded-control border transition-colors duration-fast select-none disabled:opacity-50 disabled:pointer-events-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
