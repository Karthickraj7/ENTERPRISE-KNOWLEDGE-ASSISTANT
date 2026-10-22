import React from "react";

interface SkeletonProps {
  className?: string;
  rows?: number;
}

export function Skeleton({ className = "h-4 w-full" }: SkeletonProps) {
  return <div className={`skeleton rounded-control ${className}`} />;
}

export function SkeletonRows({ rows = 3 }: SkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="p-5 bg-surface border border-subtle rounded-panel space-y-3">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-12" />
      </div>
    </div>
  );
}
