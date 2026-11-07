"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useTeacherName } from "@/lib/teacher/api/hooks";
import { useT } from "@/lib/teacher/i18n";
import { PageTitle } from "./PageTitle";

/**
 * Every screen starts here: a plain title that says where you are, an optional date and one-line subtitle,
 * a labelled Back on deep screens (it names where it goes when `backLabel` says so), and at the top right the
 * teacher, who leads to Settings.
 */
export function PageHeader({
  title,
  subtitle,
  date,
  back,
  backLabel,
  compact,
}: {
  title: string;
  subtitle?: string;
  date?: string;
  back?: string;
  backLabel?: string;
  /** A lesson that is running: the Back, the title and the line under it share the height of a title, so what the teacher does is in the first screen. */
  compact?: boolean;
}) {
  const { t } = useT();
  const teacher = useTeacherName();
  return (
    <header className={compact ? "head head--compact" : "head"}>
      <PageTitle title={title} />
      <div className="head__text">
        {back && (
          <Link href={back} className="btn btn--secondary btn--small back">
            <ArrowLeftIcon size={24} aria-hidden="true" />
            {backLabel ?? t("back")}
          </Link>
        )}
        <h1 className="head__title">{title}</h1>
        {date && <p className="head__sub head__date">{date}</p>}
        {subtitle && <p className="head__sub">{subtitle}</p>}
      </div>
      {teacher && (
        <Link href="/teacher/settings" className="me" aria-label={t("user.link", { name: teacher.full })}>
          {/* The initials are drawn by the style sheet, so the name the link has is the name that can be read on it. */}
          <span className="me__badge" aria-hidden="true" data-initials={teacher.initials} />
          {teacher.full}
        </Link>
      )}
    </header>
  );
}
