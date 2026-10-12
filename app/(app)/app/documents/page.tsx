"use client";

import { Download, FileText } from "lucide-react";
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
      <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {DOCS.map((d) => (
          <li key={d}>
            <button className="item" onClick={() => toast(t("doc.demo"))}>
              <span className="item__icon">
                <FileText size={22} strokeWidth={2} />
              </span>
              <span className="grow">
                <span className="item__title" style={{ display: "block" }}>
                  {t(`doc.${d}`)}
                </span>
                <span className="t-cap">{t("doc.pdf")}</span>
              </span>
              <Download size={22} strokeWidth={2} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
