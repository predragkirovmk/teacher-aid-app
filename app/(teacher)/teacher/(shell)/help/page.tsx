"use client";

import { EnvelopeSimpleIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/teacher/PageHeader";
import { useT, type Key } from "@/lib/teacher/i18n";

const FAQ: [Key, Key][] = [
  ["help.q1", "help.a1"],
  ["help.q2", "help.a2"],
  ["help.q3", "help.a3"],
  ["help.q4", "help.a4"],
  ["help.q5", "help.a5"],
];

export default function HelpPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("help.title")} subtitle={t("help.what")} />
      <div className="content">
        {FAQ.map(([q, a]) => (
          <details key={q} className="card faq">
            <summary>
              {t(q)}
              <PlusIcon className="faq__plus" size={28} aria-hidden="true" />
              <MinusIcon className="faq__minus" size={28} aria-hidden="true" />
            </summary>
            <p>{t(a)}</p>
          </details>
        ))}
        <div className="card card--stack">
          <h2>{t("help.contact.title")}</h2>
          <p>{t("help.contact.body")}</p>
          <a href={`mailto:${t("help.contact.email")}`} className="btn btn--primary">
            <EnvelopeSimpleIcon size={24} weight="bold" aria-hidden="true" />
            {t("help.contact.cta")}
          </a>
          <p className="address">{t("help.contact.email")}</p>
        </div>
      </div>
    </>
  );
}
