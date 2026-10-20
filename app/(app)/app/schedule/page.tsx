"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { Top } from "@/components/app/Top";
import { demoOnly } from "@/lib/app/api";
import { DAYS, lessonsOn, shiftOf, useNow, weekStart } from "@/lib/app/demo";
import { formatLongDate } from "@/lib/app/format";
import { useT } from "@/lib/app/i18n";
import { subjectLabel } from "@/lib/app/subjects";

/** The timetable is the demo's: the spec has no API for it. */
export default function Schedule() {
  const { t, locale } = useT();
  // The week, its dates and its shift wait for the phone's clock: the server cannot know them.
  const now = useNow();
  if (!demoOnly) notFound();
  const monday = now === null ? null : weekStart(now);
  return (
    <main className="screen">
      <Top title={t("sch.title")} />
      <p className="t-cap sub">
        {monday === null ? " " : t("sch.sub", { d: formatLongDate(monday, locale), shift: t(`home.${shiftOf(monday)}-shift`) })}
      </p>
      {monday !== null &&
        DAYS.map((day, i) => {
          const date = new Date(monday);
          date.setDate(date.getDate() + i);
          const isToday = new Date(now!).toDateString() === date.toDateString();
          return (
            <section key={day}>
              <h2 className="section-h" style={{ marginTop: 16 }}>
                {t(`dayLong.${day}`)} {date.getDate()}
                {isToday && ` · ${t("home.today")}`}
              </h2>
              <ul className="list">
                {lessonsOn(date.getTime()).map((l) => (
                  <li key={l.period}>
                    <Link href={`/app/subject/${l.subject}`} className="item">
                      <span className="t-label" style={{ minWidth: 52, flex: "none", fontVariantNumeric: "tabular-nums" }}>
                        {l.from}
                      </span>
                      <span className="grow item__main">
                        <span className="item__title">{subjectLabel(t, l.subject, l.subject)}</span>
                        {l.kind !== "lesson" && <span className="pill">{t(`kind.${l.kind}`)}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
    </main>
  );
}
