"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { PageHeader } from "@/components/teacher/PageHeader";
import { useT } from "@/lib/teacher/i18n";

/** A page that does not exist, inside the teacher shell so the sidebar is still there to get back. */
export default function TeacherNotFound() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("notfound.title")} />
      <div className="content">
        <div className="card card--stack">
          <span className="card__icon">
            <MagnifyingGlassIcon size={32} aria-hidden="true" />
          </span>
          <p>{t("notfound.body")}</p>
          <Link href="/teacher" className="btn btn--primary">
            {t("notfound.cta")}
          </Link>
        </div>
      </div>
    </>
  );
}
