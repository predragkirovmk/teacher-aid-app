"use client";

import { notFound } from "next/navigation";
import { DocRow } from "@/components/app/DocRow";
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
            <DocRow id={d} onOpen={() => toast(t("doc.demo"))} />
          </li>
        ))}
      </ul>
    </main>
  );
}
