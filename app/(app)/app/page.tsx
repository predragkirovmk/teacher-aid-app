"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, ViewTransition } from "react";
import { Mark } from "@/components/app/Mark";
import { SubjectTile } from "@/components/app/SubjectCard";
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
  const { percent } = useAttendance();
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
        <Search size={22} strokeWidth={2} aria-hidden="true" />
        {q.trim() && (
          <div className="results glass" role="listbox">
            {results.length === 0 && <div className="result muted">{t("home.noResults")}</div>}
            {results.map(([href, label]) => (
              <button key={href} className="result" role="option" aria-selected="false" onClick={() => router.push(href)}>
                <span className="grow">{label}</span>
                <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
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
            <ChevronRight size={22} strokeWidth={2} aria-hidden="true" />
          </div>
        </Link>
        </ViewTransition>
        </div>

        <div {...rise(1)}>
        <div className="grid2">
          <Link href="/app/schedule" className="card" style={{ padding: 16 }}>
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
          <Link href="/app/leaderboard" className="card" style={{ padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8 }}>
            <span className="t-label">{t("home.leaderboard")}</span>
            <span className="tile-big">#{rank}</span>
            <span className="t-cap">{t("home.rankCaption")}</span>
          </Link>
        </div>
        </div>

        <div {...rise(2)}>
        <div className="grid2">
          <Link href="/app/attendance" className="card" style={{ padding: 16 }}>
            <div className="t-label">{t("home.attendance")}</div>
            <div className={`tile-big${att.counting ? " counting" : ""}`} style={{ marginTop: 10 }}>
              {att.value}%
            </div>
          </Link>
          <Link href="/app/summary" className="card" style={{ padding: 16 }}>
            <div className="t-label">{t("home.summary")}</div>
            <div className="tile-big" style={{ marginTop: 10 }}>
              4/5
            </div>
            <div className="t-cap" style={{ marginTop: 4 }}>
              {t("home.correct")}
            </div>
          </Link>
        </div>
        </div>

        <h2 className="section-h" style={{ margin: "10px 4px 0" }}>
          {t("home.subjects")}
        </h2>
        <div {...rise(3)}>
          <div className="subjects">
            {SUBJECTS.map((s) => (
              <SubjectTile key={s.id} subject={s} shared={s.id !== nextSubject.id} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
