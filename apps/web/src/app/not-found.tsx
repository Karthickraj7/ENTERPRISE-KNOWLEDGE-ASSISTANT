import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-surface border border-subtle rounded-panel p-8 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-panel bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-ink">Page Not Found</h2>
          <p className="text-xs text-muted">
            The requested console path does not exist or has been relocated within the workspace.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-accent hover:bg-accent-hover text-white rounded-control shadow-xs transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Workspace Overview</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

