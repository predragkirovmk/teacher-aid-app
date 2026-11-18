"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import type { Query } from "@/lib/app/api/hooks";
import { errorCopy, useT } from "@/lib/app/i18n";

/** What a screen shows in place of its content while the API has not answered, or has refused. */
export function QueryState({ query }: { query: Pick<Query<unknown>, "status" | "error" | "refetch"> }) {
  const { t } = useT();
  if (query.status === "error") {
    return (
      <div role="alert" className="arrive" style={{ textAlign: "center", marginTop: 60 }}>
        <p className="muted" style={{ margin: "0 0 16px" }}>
          {errorCopy(t, query.error)}
        </p>
        <button className="btn btn--ghost btn--block" onClick={query.refetch}>
          {t("state.retry")}
        </button>
      </div>
    );
  }
  return (
    <p className="muted" role="status" style={{ textAlign: "center", marginTop: 60 }}>
      {t("state.loading")}
    </p>
  );
}

/** The longest an entrance runs: the last item's 240 ms delay plus the 390 ms rise. */
const ARRIVE_MS = 700;

/** How many Gates hold the mark on <html> right now, so one that ends or unmounts never takes it off while another is still rising. */
let holders = 0;

/**
 * Puts `data-arrive` on <html> for ARRIVE_MS, or until the screen goes away, whichever is first (a screen left early must not
 * leave the mark for the next one, which would then rise after a tab switch). Returns the cleanup.
 */
function markArriving() {
  const root = document.documentElement;
  let held = true;
  const drop = () => {
    if (!held) return;
    held = false;
    if (--holders === 0) root.removeAttribute("data-arrive");
  };
  holders++;
  root.setAttribute("data-arrive", "");
  const done = setTimeout(drop, ARRIVE_MS);
  return () => {
    clearTimeout(done);
    drop();
  };
}

/**
 * Shows `children` once the query has data. Until then the screen keeps its header and says it is
 * loading or why it could not load, so a slow or failed request never leaves a blank page.
 */
export function Gate<T>({
  query,
  header,
  children,
}: {
  query: Query<T>;
  header?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const ready = query.status === "ready";
  // A screen that had to wait for its data lets that content rise in when it lands (the calm entrance in app.css, set on <html>
  // for under a second); one that had its data at once, like every tab and screen the student has been on, shows it still.
  const [waited] = useState(!ready);
  useLayoutEffect(() => (waited && ready ? markArriving() : undefined), [waited, ready]);
  if (ready) return <>{children(query.data as T)}</>;
  return (
    <main className="screen">
      {header}
      <QueryState query={query} />
    </main>
  );
}
