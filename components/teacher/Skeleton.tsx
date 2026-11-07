"use client";

import type { CSSProperties, ReactNode } from "react";
import { useT } from "@/lib/teacher/i18n";

/**
 * Calm placeholders while an answer is on its way: still shapes the size of what will come, no shimmer, so the page does
 * not jump when the real thing arrives and nothing moves that does not have to. A screen reader is told once that it is loading.
 */
export function Loading({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="loading" aria-busy="true">
      <p className="sr" role="status">
        {t("loading")}
      </p>
      {children}
    </div>
  );
}

/** One placeholder bar. `width` and `height` are CSS lengths. */
export function Bar({ width = "100%", height = "1.5rem", className = "" }: { width?: string; height?: string; className?: string }) {
  const style: CSSProperties = { width, height };
  return <span className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}
