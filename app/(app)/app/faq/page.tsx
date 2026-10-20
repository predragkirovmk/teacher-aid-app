"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import { Top } from "@/components/app/Top";
import { useT } from "@/lib/app/i18n";

const FAQ_IDS = ["f1", "f2", "f3", "f4"] as const;

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
              <CaretRightIcon size={22} aria-hidden="true" />
            </summary>
            <p className="muted">{t(`faq.${id}.a`)}</p>
          </details>
        ))}
      </div>
    </main>
  );
}
