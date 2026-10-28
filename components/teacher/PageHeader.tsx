"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useTeacherName } from "@/lib/teacher/api/hooks";
import { useT } from "@/lib/teacher/i18n";
import { PageTitle } from "./PageTitle";

/**
 * Every screen starts here: a plain title that says where you are, an optional one-line subtitle,
 * a labelled Back on deep screens, and at the top right the teacher, who leads to Settings.
 */
export function PageHeader({ title, subtitle, back }: { title: string; subtitle?: string; back?: string }) {
  const { t } = useT();
  const teacher = useTeacherName();
  return (
    <header className="head">
      <PageTitle title={title} />
      <div className="head__text">
        {back && (
          <Link href={back} className="btn btn--secondary btn--small back">
            <ArrowLeftIcon size={24} aria-hidden="true" />
            {t("back")}
          </Link>
        )}
        <h1 className="head__title">{title}</h1>
        {subtitle && <p className="head__sub">{subtitle}</p>}
      </div>
      {teacher && (
        <Link href="/teacher/settings" className="me" aria-label={t("user.link", { name: teacher.full })}>
          <span className="me__badge" aria-hidden="true">
            {teacher.initials}
          </span>
          {teacher.full}
        </Link>
      )}
    </header>
  );
}
