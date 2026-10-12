"use client";

import { ChevronRight } from "lucide-react";
import { Top } from "@/components/app/Top";
import { FAQ_IDS } from "@/lib/app/data";
import { useT } from "@/lib/app/i18n";

export default function Faq() {
  const { t } = useT();
  return (
    <main className="screen">
      <Top title={t("faq.title")} />
      <div className="list">
        {FAQ_IDS.map((id) => (
          <details key={id} className="faq">
            <summary>
              {t(`faq.${id}.q`)}
              <ChevronRight size={22} strokeWidth={2} aria-hidden="true" />
            </summary>
            <p className="muted">{t(`faq.${id}.a`)}</p>
          </details>
        ))}
      </div>
    </main>
  );
}
