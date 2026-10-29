"use client";

import { CompassIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useT } from "@/lib/teacher/i18n";
import { SETTINGS } from "@/lib/teacher/routes";
import { guideUrl } from "@/lib/teacher/signin";

/** "Show the guide again": the welcome guide of a first run, for a teacher who wants to see it once more. It comes back to Settings when it is done. */
export function GuideCard() {
  const { t } = useT();
  return (
    <div className="card card--stack">
      <span className="card__icon">
        <CompassIcon size={32} aria-hidden="true" />
      </span>
      <h2>{t("settings.guide.title")}</h2>
      <p>{t("settings.guide.hint")}</p>
      <Link href={guideUrl(SETTINGS)} className="btn btn--secondary">
        {t("settings.guide.cta")}
      </Link>
    </div>
  );
}
