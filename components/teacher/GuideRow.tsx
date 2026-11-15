"use client";

import Link from "next/link";
import { useT } from "@/lib/teacher/i18n";
import { SETTINGS } from "@/lib/teacher/routes";
import { guideUrl } from "@/lib/teacher/signin";
import { SettingRow } from "./SettingRow";

/** "Show the guide again": the welcome guide of a first run, for a teacher who wants to see it once more. It comes back to Settings when it is done. */
export function GuideRow() {
  const { t } = useT();
  return (
    <SettingRow
      title={t("settings.guide.title")}
      hint={t("settings.guide.hint")}
      control={() => (
        <Link href={guideUrl(SETTINGS)} className="btn btn--secondary">
          {t("settings.guide.cta")}
        </Link>
      )}
    />
  );
}
