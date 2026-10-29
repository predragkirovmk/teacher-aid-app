"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Mark } from "@/components/app/Mark";
import { useAuth } from "@/lib/teacher/api/hooks";
import { destinationOf, viewOf } from "@/lib/teacher/guard";
import { useT } from "@/lib/teacher/i18n";
import { PageTitle } from "./PageTitle";
import { Splash } from "./Splash";

/**
 * Every page of the teacher app passes through here (it wraps them in the root layout), so that a page cannot forget to
 * ask who is signed in. The rules are in lib/teacher/guard.ts. What this draws until the answer is known, and while the
 * teacher is sent elsewhere, is the logo alone, so a protected page is never drawn for somebody who may not see it.
 */
export function Gate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, reason, me } = useAuth();
  const firstRunDone = me.data?.first_run_done;
  const view = viewOf({ pathname, status, firstRunDone });

  useEffect(() => {
    // The address is read here and not in the render: the server knows no query, and the first render must match its markup.
    const next = new URLSearchParams(window.location.search).get("next");
    const to = destinationOf({ pathname, status, reason, firstRunDone }, pathname, next);
    if (to) router.replace(to);
  }, [pathname, status, reason, firstRunDone, router]);

  if (view === "wait") return <Splash />;
  if (view === "retry") return <Retry onRetry={me.refetch} error={me.error} />;
  return children;
}

/** `GET /me` did not answer: the teacher may well be signed in, so they are not sent to sign in, only asked to try again. */
function Retry({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t, te } = useT();
  return (
    <main className="solo">
      <PageTitle title={t("gate.title")} />
      <div className="card card--stack">
        <Mark size={56} />
        <h1>{t("gate.title")}</h1>
        <p>{t("gate.body")}</p>
        {error ? <p role="alert">{te(error)}</p> : null}
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          <ArrowClockwiseIcon size={24} weight="bold" aria-hidden="true" />
          {t("error.retry")}
        </button>
      </div>
    </main>
  );
}
