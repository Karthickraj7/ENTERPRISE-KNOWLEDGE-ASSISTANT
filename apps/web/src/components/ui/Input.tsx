import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, icon, id, className = "", ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-ink">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full px-3 py-2 text-sm bg-surface border rounded-control text-ink placeholder:text-faint transition-colors duration-fast focus:border-accent focus:ring-0 ${
              icon ? "pl-9" : ""
            } ${error ? "border-status-failed" : "border-subtle"} ${className}`}
            {...props}
          />
        </div>
        {hint && !error && <p className="text-xs text-faint">{hint}</p>}
        {error && <p className="text-xs text-status-failed">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
