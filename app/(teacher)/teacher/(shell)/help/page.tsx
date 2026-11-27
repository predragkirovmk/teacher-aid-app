"use client";

import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { GuideVideo } from "@/components/GuideVideo";
import { PageHeader } from "@/components/teacher/PageHeader";
import { SettingRow } from "@/components/teacher/SettingRow";
import { useT, type Key } from "@/lib/teacher/i18n";
import { PROJECTOR_HELP_ID } from "@/lib/teacher/routes";

const FAQ: [Key, Key][] = [
  ["help.q1", "help.a1"],
  ["help.q2", "help.a2"],
  ["help.q3", "help.a3"],
  ["help.q4", "help.a4"],
  ["help.q5", "help.a5"],
];

/** The steps for each kind of computer, in the order they are done. */
const PROJECTOR_STEPS: { title: Key; steps: Key[] }[] = [
  { title: "help.projector.win", steps: ["help.projector.win.1", "help.projector.win.2"] },
  { title: "help.projector.mac", steps: ["help.projector.mac.1", "help.projector.mac.2"] },
];

export default function HelpPage() {
  const { t, locale } = useT();
  const projector = useRef<HTMLDetailsElement>(null);

  // The lesson's console links to the steps that make the projector show only the class view (`#projector`): they open, and the focus is on them.
  useEffect(() => {
    const show = () => {
      if (window.location.hash !== `#${PROJECTOR_HELP_ID}`) return;
      const item = projector.current;
      if (!item) return;
      item.open = true;
      item.scrollIntoView({ block: "start" });
      item.querySelector<HTMLElement>("summary")?.focus();
    };
    show();
    window.addEventListener("hashchange", show);
    return () => window.removeEventListener("hashchange", show);
  }, []);

  return (
    <>
      <PageHeader title={t("help.title")} subtitle={t("help.what")} />
      <div className="content">
        {/* The guide film first: most questions here are answered by watching one lesson go by. */}
        <section className="card card--stack help__video" aria-labelledby="help-video-title">
          <h2 id="help-video-title">{t("video.title")}</h2>
          <p>{t("video.about")}</p>
          <GuideVideo lang={locale} title={t("video.title")} chaptersLabel={t("video.chapters")} />
        </section>
        {/* The questions are rows of one list, each opening in place; the way to write to us is a row of its own under them. */}
        <div className="setgroup">
          {FAQ.map(([q, a]) => (
            <details key={q} className="faq">
              <summary>
                {t(q)}
                <span className="faq__mark" aria-hidden="true" />
              </summary>
              <p>{t(a)}</p>
            </details>
          ))}
          <details ref={projector} id={PROJECTOR_HELP_ID} className="faq">
            <summary>
              {t("help.projector.q")}
              <span className="faq__mark" aria-hidden="true" />
            </summary>
            <div className="faq__steps">
              <p>{t("help.projector.why")}</p>
              {PROJECTOR_STEPS.map(({ title, steps }) => (
                <section key={title}>
                  <h3>{t(title)}</h3>
                  <ol className="steps">
                    {steps.map((step) => (
                      <li key={step}>{t(step)}</li>
                    ))}
                  </ol>
                </section>
              ))}
              <p>{t("help.projector.last")}</p>
            </div>
          </details>
        </div>
        <div className="setgroup">
          <SettingRow
            title={t("help.contact.title")}
            hint={
              <>
                {t("help.contact.body")} <span className="address">{t("help.contact.email")}</span>
              </>
            }
            control={() => (
              <a href={`mailto:${t("help.contact.email")}`} className="btn btn--primary">
                <EnvelopeSimpleIcon size={24} weight="bold" aria-hidden="true" />
                {t("help.contact.cta")}
              </a>
            )}
          />
        </div>
      </div>
    </>
  );
}
