"use client";

import { CaretLeftIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useT } from "@/lib/teacher/i18n";
import { PageTitle } from "./PageTitle";

/**
 * Every screen starts here: a plain title that says where you are, an optional date and one-line subtitle, and on deep
 * screens a quiet Back above the title (it names where it goes when `backLabel` says so). Nothing else sits in it: who is
 * signed in is at the foot of the sidebar.
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
  return (
    <header className={compact ? "head head--compact" : "head"}>
      <PageTitle title={title} />
      <div className="head__text">
        {back && (
          <Link href={back} className="back">
            <CaretLeftIcon size={18} weight="bold" aria-hidden="true" />
            {backLabel ?? t("back")}
          </Link>
        )}
        <h1 className="head__title">{title}</h1>
        {date && <p className="head__sub head__date">{date}</p>}
        {subtitle && <p className="head__sub">{subtitle}</p>}
      </div>
    </header>
  );
}
