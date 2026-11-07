"use client";

import type { Icon } from "@phosphor-icons/react";
import { useT } from "@/lib/teacher/i18n";

/** The honest empty state of a part that is not built yet: what will live here, and that it is coming. */
export function SoonCard({ icon: Glyph, what }: { icon: Icon; what: string }) {
  const { t } = useT();
  return (
    <div className="card card--stack">
      <span className="card__icon">
        <Glyph size={32} aria-hidden="true" />
      </span>
      <h2>{t("soon.title")}</h2>
      <p>{what}</p>
      <p>{t("soon.body")}</p>
    </div>
  );
}
