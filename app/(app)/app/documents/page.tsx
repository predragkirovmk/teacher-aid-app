"use client";

import { DownloadSimpleIcon, FileIcon } from "@phosphor-icons/react";
import { Top } from "@/components/app/Top";
import { useUI } from "@/components/app/ui";
import { DOCS } from "@/lib/app/data";
import { useT } from "@/lib/app/i18n";

export default function Documents() {
  const { t } = useT();
  const { toast } = useUI();
  return (
    <main className="screen">
      <Top title={t("docs.title")} />
      <p className="t-cap sub">{t("docs.sub")}</p>
      <ul className="list">
        {DOCS.map((d) => (
          <li key={d}>
            <button className="item" onClick={() => toast(t("doc.demo"))}>
              <span className="item__icon">
                <FileIcon size={22} />
              </span>
              <span className="grow">
                <span className="item__title" style={{ display: "block" }}>
                  {t(`doc.${d}`)}
                </span>
                <span className="t-cap">{t("doc.pdf")}</span>
              </span>
              <DownloadSimpleIcon size={22} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
