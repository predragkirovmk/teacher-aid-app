"use client";

import Link from "next/link";
import { Top } from "@/components/app/Top";
import { WEEK } from "@/lib/app/data";
import { useT } from "@/lib/app/i18n";

export default function Schedule() {
  const { t } = useT();
  return (
    <main className="screen">
      <Top title={t("sch.title")} />
      <p className="t-cap sub">{t("sch.sub")}</p>
      {WEEK.map((d) => (
        <section key={d.day}>
          <h2 className="section-h" style={{ marginTop: 18 }}>
            {t(`dayLong.${d.day}`)} {d.date}
          </h2>
          <ul className="list">
            {d.slots.map((s) => (
              <li key={s.time}>
                <Link href={`/app/subject/${s.subject}`} className="item">
                  <span className="t-label" style={{ width: 52, fontVariantNumeric: "tabular-nums" }}>
                    {s.time}
                  </span>
                  <span className="grow item__title">{t(`subj.${s.subject}`)}</span>
                  <span className="pill">{t(`kind.${s.kind}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
