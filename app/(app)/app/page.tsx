"use client";

import { CaretRightIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, ViewTransition, type KeyboardEvent } from "react";
import { Avatar } from "@/components/app/Avatar";
import { Mark } from "@/components/app/Mark";
import { SubjectRow } from "@/components/app/SubjectCard";
import { SUBJECTS, WEEK, subjectById } from "@/lib/app/data";
import { useAttendance, useStandings } from "@/lib/app/derived";
import { useTween } from "@/lib/app/tween";
import { translate, useT, type Key } from "@/lib/app/i18n";
import { useMe } from "@/lib/app/profile";

/** Set once the intro has played this session; the root layout reads it before the first paint. */
const RISE_KEY = "teacheraid-home-rise";

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
  const me = useMe();
  const { percent, attended, total } = useAttendance();
  const att = useTween(percent, "teacheraid-shown-attendance");
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // The cards always carry the intro, server and client alike, so nothing renders twice: CSS plays it
  // from the first paint, and skips it once [data-rise-seen] is on <html>, which the layout's inline
  // script sets before paint on later loads and this effect sets after the intro has run.
  useEffect(() => {
    const id = setTimeout(() => {
      document.documentElement.setAttribute("data-rise-seen", "");
      try {
        window.sessionStorage.setItem(RISE_KEY, "1");
      } catch {
        // ignore
      }
    }, 1200);
    return () => clearTimeout(id);
  }, []);
  const rise = (i: number) => ({ className: "rise", style: { "--i": i } as React.CSSProperties });

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

  // Arrow keys move between the results and back up to the field; Escape clears the search.
  const onResultsKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const links = Array.from(e.currentTarget.querySelectorAll("a"));
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const to = at + (e.key === "ArrowDown" ? 1 : -1);
      if (to < 0) inputRef.current?.focus();
      else links[Math.min(to, links.length - 1)]?.focus();
    } else if (e.key === "Escape") {
      setQ("");
      inputRef.current?.focus();
    }
  };
  const found = !q.trim()
    ? ""
    : results.length === 0
      ? t("home.noResults")
      : results.length === 1
        ? t("home.results.one")
        : t("home.results.other", { n: results.length });

  return (
    <main className="screen">
      <div className="home-bar">
        <Mark size={32} />
        <Link href="/app/profile" replace aria-label={t("nav.profile")} style={{ display: "block", borderRadius: "50%" }}>
          <Avatar avatar={me.avatar} initials={me.initials} size={48} />
        </Link>
      </div>

      <h1 className="large">{t("home.hello")}</h1>

      <div className="search">
        <input
          ref={inputRef}
          type="search"
          value={q}
          aria-controls={q.trim() ? "home-results" : undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && results.length) {
              e.preventDefault();
              document.querySelector<HTMLAnchorElement>("#home-results a")?.focus();
            }
          }}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("home.search")}
          aria-label={t("home.search")}
          enterKeyHint="search"
        />
        <MagnifyingGlassIcon size={22} aria-hidden="true" />
        {/* A plain list of links, announced by count: the listbox roles it had promised arrow-key
            selection that never worked. */}
        <p className="sr" role="status">
          {found}
        </p>
        {q.trim() && (
          <ul id="home-results" className="results glass" aria-label={t("home.search")} onKeyDown={onResultsKey}>
            {results.length === 0 && <li className="result muted">{t("home.noResults")}</li>}
            {results.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="result">
                  <span className="grow">{label}</span>
                  <CaretRightIcon size={20} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="stack">
        {/* What matters first: the next lesson, which is also where you check in. */}
        <div {...rise(0)}>
        <ViewTransition name={`subject-${nextSubject.id}`} share="morph" default="none">
        <Link href={`/app/subject/${nextSubject.id}`} className="next" data-morph={`subject-${nextSubject.id}`}>
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
