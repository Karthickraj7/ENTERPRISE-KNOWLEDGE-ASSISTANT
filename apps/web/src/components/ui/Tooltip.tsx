"use client";

import React, { useState, useRef } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  function handleEnter() {
    timeoutRef.current = setTimeout(() => setVisible(true), 400);
  }

  function handleLeave() {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  }

  return (
    <div className="relative inline-flex" onMouseEnter={handleEnter} onMouseLeave={handleLeave} onFocus={handleEnter} onBlur={handleLeave}>
      {children}
      {visible && (
        <div
          role="tooltip"
          className={`absolute z-40 px-2.5 py-1.5 text-xs font-medium text-white bg-[#14171F] dark:bg-[#F0F3F6] dark:text-[#14171F] rounded-control shadow-md whitespace-nowrap pointer-events-none animate-fade-in ${
            side === "top" ? "bottom-full left-1/2 -translate-x-1/2 mb-1.5" : "top-full left-1/2 -translate-x-1/2 mt-1.5"
          }`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
