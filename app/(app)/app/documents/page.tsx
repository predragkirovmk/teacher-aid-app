"use client";

import { DownloadSimpleIcon, FileIcon } from "@phosphor-icons/react";
import { notFound } from "next/navigation";
import { Top } from "@/components/app/Top";
import { useUI } from "@/components/app/ui";
import { demoOnly } from "@/lib/app/api";
import { DEMO_DOCS } from "@/lib/app/demo";
import { useT } from "@/lib/app/i18n";

/** Teacher handouts: not in the spec (OPEN-18), so only the demo has them. */
export default function Documents() {
  const { t } = useT();
  const { toast } = useUI();
  if (!demoOnly) notFound();
  return (
    <main className="screen">
      <Top title={t("docs.title")} />
      <p className="t-cap sub">{t("docs.sub")}</p>
      <ul className="list">
        {DEMO_DOCS.map((d) => (
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
