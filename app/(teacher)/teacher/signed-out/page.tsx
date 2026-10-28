"use client";

import Link from "next/link";
import { Mark } from "@/components/app/Mark";
import { PageTitle } from "@/components/teacher/PageTitle";
import { useT } from "@/lib/teacher/i18n";

/** Where Sign out lands. A placeholder: real sign-in comes later. */
export default function SignedOutPage() {
  const { t } = useT();
  return (
    <main className="solo">
      <PageTitle title={t("signedout.title")} />
      <div className="card card--stack">
        <Mark size={56} />
        <h1>{t("signedout.title")}</h1>
        <p>{t("signedout.body")}</p>
        <Link href="/teacher" className="btn btn--primary">
          {t("signedout.cta")}
        </Link>
      </div>
    </main>
  );
}
