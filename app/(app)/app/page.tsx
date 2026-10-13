"use client";

import { CaretRightIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, ViewTransition } from "react";
import { Mark } from "@/components/app/Mark";
import { SubjectRow } from "@/components/app/SubjectCard";
import { SUBJECTS, WEEK, subjectById } from "@/lib/app/data";
import { useAttendance, useStandings } from "@/lib/app/derived";
import { useTween } from "@/lib/app/tween";
import { translate, useT, type Key } from "@/lib/app/i18n";

const noop = () => () => {};
const RISE_KEY = "teacheraid-home-rise";
const riseSeen = () => {
  try {
    return window.sessionStorage.getItem(RISE_KEY) === "1";
  } catch {
    return true;
  }
};

const PAGES: [string, Key][] = [
  ["/app/attendance", "att.title"],
  ["/app/summary", "sum.title"],
  ["/app/leaderboard", "lb.title"],
  ["/app/schedule", "sch.title"],
  ["/app/documents", "docs.title"],
  ["/app/achievements", "ach.title"],
  ["/app/settings", "settings.title"],
  ["/app/faq", "faq.title"],
  ["/app/scan", "home.scanTitle"],
];

export default function Home() {
  const { t } = useT();
  const router = useRouter();
  const { percent, attended, total } = useAttendance();
  const att = useTween(percent, "teacheraid-shown-attendance");
  const [q, setQ] = useState("");
  const seen = useSyncExternalStore(noop, riseSeen, () => true);
  // Mark the intro as played only after it has run, so the first render still sees it unplayed.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        window.sessionStorage.setItem(RISE_KEY, "1");
      } catch {
        // ignore
      }
    }, 1200);
    return () => clearTimeout(id);
  }, []);
  const rise = (i: number) => (seen ? {} : { className: "rise", style: { "--i": i } as React.CSSProperties });

  const next = WEEK[0].slots[0];
  const nextSubject = subjectById(next.subject)!;
  const { rank } = useStandings();

  // Match in both languages, so typing "math" finds Математика and the other way round.
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const all: { href: string; key: Key }[] = [
      ...SUBJECTS.map((s) => ({ href: `/app/subject/${s.id}`, key: `subj.${s.id}` as Key })),
      ...PAGES.map(([href, key]) => ({ href, key })),
    ];
    return all
      .filter(({ key }) => (["en", "mk"] as const).some((l) => translate(l, key).toLowerCase().includes(needle)))
      .slice(0, 5)
      .map(({ href, key }): [string, string] => [href, t(key)]);
  }, [q, t]);

  return (
    <main className="screen">
      <div className="home-bar">
        <Mark size={32} />
        <Link href="/app/profile" replace className="avatar avatar--sm" aria-label={t("nav.profile")}>
          МТ
        </Link>
      </div>

      <h1 className="large">{t("home.hello")}</h1>

      <div className="search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("home.search")}
          aria-label={t("home.search")}
          enterKeyHint="search"
        />
        <MagnifyingGlassIcon size={22} aria-hidden="true" />
        {q.trim() && (
          <div className="results glass" role="listbox">
            {results.length === 0 && <div className="result muted">{t("home.noResults")}</div>}
            {results.map(([href, label]) => (
              <button key={href} className="result" role="option" aria-selected="false" onClick={() => router.push(href)}>
                <span className="grow">{label}</span>
                <CaretRightIcon size={20} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="stack">
        {/* What matters first: the next lesson, which is also where you check in. */}
        <div {...rise(0)}>
        <ViewTransition name={`subject-${nextSubject.id}`} share="morph" default="none">
        <Link href={`/app/subject/${nextSubject.id}`} className="next">
          <span className="subject__glyphs" aria-hidden="true">
            {nextSubject.glyphs}
          </span>
          <div className="next__eyebrow">
            {t("home.nextLesson")} · {t(`dayLong.${WEEK[0].day}`)}, {next.time}
          </div>
          <div className="next__name">{t(`subj.${nextSubject.id}`)}</div>
          <div className="next__foot">
            <span className="monogram" aria-hidden="true">
              {nextSubject.initials}
            </span>
            <span className="grow">{t(`teacher.${nextSubject.id}`)}</span>
            <CaretRightIcon size={22} aria-hidden="true" />
          </div>
        </Link>
        </ViewTransition>
        </div>

        <div {...rise(1)}>
        <div className="grid2">
          <Link href="/app/schedule" className="card tile">
            <div className="week">
              {WEEK.slice(0, 3).map((d) => (
                <div key={d.day}>
                  <b>{t(`day.${d.day}`)}</b>
                  <i>{d.date}</i>
                  <span>{t(`kind.${d.slots[0].kind}`)}</span>
                </div>
              ))}
            </div>
          </Link>
          <Link href="/app/leaderboard" className="card tile">
            <span className="t-label">{t("home.leaderboard")}</span>
            <span className="tile-big">#{rank}</span>
            <span className="t-cap">{t("home.rankCaption")}</span>
          </Link>
        </div>
        </div>

        <div {...rise(2)}>
        <div className="grid2">
          <Link href="/app/attendance" className="card tile">
            <span className="t-label">{t("home.attendance")}</span>
            <span className={`tile-big${att.counting ? " counting" : ""}`}>{att.value}%</span>
            <span className="t-cap">{t("home.attCaption", { a: attended, t: total })}</span>
          </Link>
          <Link href="/app/summary" className="card tile">
            <span className="t-label">{t("home.summary")}</span>
            <span className="tile-big">4/5</span>
            <span className="t-cap">{t("home.correct")}</span>
          </Link>
        </div>
        </div>

        <div {...rise(3)}>
          {/* The stack's gap already separates it, so less margin above than elsewhere. */}
          <h2 className="section-h" style={{ marginTop: 16 }}>
            {t("home.subjects")}
          </h2>
          <ul className="list">
            {SUBJECTS.map((s) => (
              <li key={s.id}>
                <SubjectRow subject={s} shared={s.id !== nextSubject.id} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
