"use client";

import { DownloadSimpleIcon, FileIcon } from "@phosphor-icons/react";
import { DEMO_DOCS } from "@/lib/app/demo";
import { useT } from "@/lib/app/i18n";

/** One teacher handout: an icon, its title and its type. Shared by Home and the documents screen. */
export function DocRow({ id, onOpen }: { id: (typeof DEMO_DOCS)[number]; onOpen: () => void }) {
  const { t } = useT();
  return (
    <button className="item" onClick={onOpen}>
      <span className="item__icon">
        <FileIcon size={22} aria-hidden="true" />
      </span>
      <span className="grow">
        <span className="item__title" style={{ display: "block" }}>
          {t(`doc.${id}`)}
        </span>
        <span className="t-cap">{t("doc.pdf")}</span>
      </span>
      <DownloadSimpleIcon size={22} aria-hidden="true" />
    </button>
  );
}
