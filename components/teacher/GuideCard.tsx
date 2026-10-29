"use client";

import { CompassIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useT } from "@/lib/teacher/i18n";
import { GUIDE } from "@/lib/teacher/signin";

/** "Show the guide again": the welcome guide of a first run, for a teacher who wants to see it once more. */
export function GuideCard() {
  const { t } = useT();
  return (
    <div className="card card--stack">
      <span className="card__icon">
        <CompassIcon size={32} aria-hidden="true" />
      </span>
      <h2>{t("settings.guide.title")}</h2>
      <p>{t("settings.guide.hint")}</p>
      <Link href={GUIDE} className="btn btn--secondary">
        {t("settings.guide.cta")}
      </Link>
    </div>
  );
}
