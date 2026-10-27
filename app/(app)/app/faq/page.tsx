"use client";

import { CaretRightIcon, EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { Top } from "@/components/app/Top";
import { useT } from "@/lib/app/i18n";
import { CONTACT_EMAIL } from "@/lib/app/privacy";

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
      {/* Support is this FAQ and an email to TeacherAid: there is no support channel in the app (BR-SUP-01). */}
      <section className="faq-contact" aria-label={t("faq.write")}>
        <p className="t-body muted">{t("faq.contact")}</p>
        <a className="btn btn--ghost btn--block" href={`mailto:${CONTACT_EMAIL}`}>
          <EnvelopeSimpleIcon size={22} aria-hidden="true" />
          {t("faq.write")}
        </a>
        <span className="t-cap faq-contact__address">{CONTACT_EMAIL}</span>
      </section>
    </main>
  );
}
