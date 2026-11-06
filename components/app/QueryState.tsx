"use client";

import type { ReactNode } from "react";
import type { Query } from "@/lib/app/api/hooks";
import { errorCopy, useT } from "@/lib/app/i18n";

/** What a screen shows in place of its content while the API has not answered, or has refused. */
export function QueryState({ query }: { query: Pick<Query<unknown>, "status" | "error" | "refetch"> }) {
  const { t } = useT();
  if (query.status === "error") {
    return (
      <div role="alert" style={{ textAlign: "center", marginTop: 60 }}>
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
  if (query.status === "ready") return <>{children(query.data as T)}</>;
  return (
    <main className="screen">
      {header}
      <QueryState query={query} />
    </main>
  );
}
