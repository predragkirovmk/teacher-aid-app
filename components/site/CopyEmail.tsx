"use client";

import { useEffect, useRef, useState } from "react";

export function CopyEmail({ email, copy, copied }: { email: string; copy: string; copied: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(email);
      setDone(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDone(false), 1800);
    } catch {
      setDone(false);
    }
  }

  return (
    <button type="button" className="btn btn--ghost btn--sm copy" onClick={onCopy} data-done={done || undefined}>
      <span className="copy__label" aria-live="polite">
        {done ? copied : copy}
      </span>
    </button>
  );
}
