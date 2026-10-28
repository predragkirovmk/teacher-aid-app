"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useT } from "@/lib/teacher/i18n";
import { PageTitle } from "./PageTitle";

/** The teacher's initials from their name: "Марија Петровска" gives "МП". */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/**
 * Every screen starts here: a plain title that says where you are, an optional one-line subtitle,
 * a labelled Back on deep screens, and at the top right the teacher, who leads to Settings.
 */
export function PageHeader({ title, subtitle, back }: { title: string; subtitle?: string; back?: string }) {
  const { t } = useT();
  const name = t("user.name");
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
      <Link href="/teacher/settings" className="me" aria-label={t("user.link", { name })}>
        <span className="me__badge" aria-hidden="true">
          {initials(name)}
        </span>
        {name}
      </Link>
    </header>
  );
}
