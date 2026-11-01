"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A line said once, on the page that a change has just led to (a lesson deleted, saved or copied): a tick and the words, in bold, in a
 * small card. The button that was pressed went with the page it was on, so the focus would be left on nothing; it goes to the line
 * instead, as DemoCard's does, because a message that appears together with its live region is often not read out and one that holds
 * the focus is. A keyboard carries on from the line, to the buttons under it.
 */
export function OnceLine({ children }: { children: ReactNode }) {
  const line = useRef<HTMLDivElement>(null);
  useEffect(() => {
    line.current?.focus();
  }, []);
  return (
    <div ref={line} className="card card--compact draft__note" role="status" tabIndex={-1}>
      <span className="card__icon card__icon--small">
        <CheckCircleIcon size={24} weight="fill" aria-hidden="true" />
      </span>
      <p>
        <strong>{children}</strong>
      </p>
    </div>
  );
}
