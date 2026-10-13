"use client";

import Link from "next/link";
import { Top } from "@/components/app/Top";
import { useT } from "@/lib/app/i18n";

/** A screen that does not exist (an unknown subject, say): the app's own page, with a way back. */
export default function NotFound() {
  const { t } = useT();
  return (
    <main className="screen">
      <Top title={t("notfound.title")} />
      <p className="muted">{t("notfound.body")}</p>
      <Link href="/app" replace className="btn btn--ghost btn--block" style={{ marginTop: 16 }}>
        {t("notfound.home")}
      </Link>
    </main>
  );
}
