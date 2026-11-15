"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Mark } from "@/components/app/Mark";
import { PageTitle } from "@/components/teacher/PageTitle";
import { isChunkLoadError, reloadOnce } from "@/lib/teacher/chunk";
import { useT } from "@/lib/teacher/i18n";

/**
 * Shown instead of a screen that fails to render, with a way to try again and a way back. A screen whose code could not be fetched
 * (the connection was down when the browser fetched it ahead of time) is not broken: it is loaded afresh as soon as the connection is
 * there, once, and "Обиди се повторно" loads it afresh too, since rendering it again would reuse the failed fetch.
 */
export default function TeacherError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { t } = useT();
  const chunk = isChunkLoadError(error);

  useEffect(() => {
    if (!chunk) return;
    const load = () => reloadOnce(window.location.href, () => window.location.reload());
    if (navigator.onLine) {
      load();
      return;
    }
    window.addEventListener("online", load, { once: true });
    return () => window.removeEventListener("online", load);
  }, [chunk]);

  return (
    <main className="solo">
      <PageTitle title={t("error.title")} />
      <div className="card card--stack">
        <Mark size={56} />
        <h1>{t("error.title")}</h1>
        <p>{t("error.body")}</p>
        <button type="button" className="btn btn--primary" onClick={chunk ? () => window.location.reload() : retry}>
          {t("error.retry")}
        </button>
        <Link href="/teacher" className="btn btn--secondary">
          {t("error.home")}
        </Link>
      </div>
    </main>
  );
}
