"use client";

import Link from "next/link";
import { Mark } from "@/components/app/Mark";
import { PageTitle } from "@/components/teacher/PageTitle";
import { useT } from "@/lib/teacher/i18n";

/** Shown instead of a screen that fails to render, with a way to try again and a way back. */
export default function TeacherError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { t } = useT();
  return (
    <main className="solo">
      <PageTitle title={t("error.title")} />
      <div className="card card--stack">
        <Mark size={56} />
        <h1>{t("error.title")}</h1>
        <p>{t("error.body")}</p>
        <button type="button" className="btn btn--primary" onClick={retry}>
          {t("error.retry")}
        </button>
        <Link href="/teacher" className="btn btn--secondary">
          {t("error.home")}
        </Link>
      </div>
    </main>
  );
}
