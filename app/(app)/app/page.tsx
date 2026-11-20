"use client";

import { CaretRightIcon, ClockIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, type CSSProperties } from "react";
import { Bell } from "@/components/app/Bell";
import { Mark } from "@/components/app/Mark";
import { DocRow } from "@/components/app/DocRow";
import { PracticeCard } from "@/components/app/practice/PracticeRows";
import { ResultRow } from "@/components/app/Results";
import { QueryState } from "@/components/app/QueryState";
import { useUI } from "@/components/app/ui";
import { demoOnly } from "@/lib/app/api";
import { useDocuments, useMe, useNotifications, useResults } from "@/lib/app/api/hooks";
import { useDemoClock, useNow } from "@/lib/app/demo";
import { formatLongDate, formatTime } from "@/lib/app/format";
import { useT } from "@/lib/app/i18n";
import { useSelf } from "@/lib/app/profile";

/** Set once the intro has played this session; the root layout reads it before the first paint. */
const RISE_KEY = "teacheraid-home-rise";

/**
 * Now, while hydrating: the server cannot know the phone's clock, so both sides render this moment
 * (a Monday, 07:45) and [data-pending] shows the time-bound text as placeholder bars until the
 * real time is in.
 */
const STAND_IN = new Date(2026, 9, 12, 7, 45).getTime();

/** How many quizzes and documents Home shows before the link to all of them. */
const RECENT = 3;

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** The greeting for an hour, round the clock: night runs from 22:00 to 05:00. */
const greeting = (hour: number) =>
  hour >= 5 && hour < 12
    ? "home.morning"
    : hour >= 12 && hour < 18
      ? "home.afternoon"
      : hour >= 18 && hour < 22
        ? "home.evening"
        : "home.night";

/** Text that should fit one line: its length lets CSS size it to the width it has (.fit). */
const fit = (text: string) => ({ "--chars": text.length }) as CSSProperties;

const rise = (i: number) => ({ className: "rise", style: { "--i": i } as CSSProperties });

export default function Home() {
  const { t, locale } = useT();
  const { openClock } = useUI();
  const me = useSelf();
  const student = useMe();
  const { clock } = useDemoClock();
  const live = useNow();
  const now = live ?? STAND_IN;
  // The cards always carry the intro, server and client alike, so nothing renders twice: CSS plays it
  // from the first paint, and skips it once [data-rise-seen] is on <html>, which the layout's inline
  // script sets before paint on later loads and this effect sets after the intro has run.
  useEffect(() => {
    const seen = () => {
      document.documentElement.setAttribute("data-rise-seen", "");
      try {
        window.sessionStorage.setItem(RISE_KEY, "1");
      } catch {
        // ignore
      }
    };
    const id = setTimeout(seen, 1200);
    const shown = performance.now();
    return () => {
      clearTimeout(id);
      // Leaving within the intro still counts as having seen it, or a quick tab and back would play it again. The 150 ms
      // floor skips the instant mount-unmount-mount of React's dev double effect.
      if (performance.now() - shown > 150) seen();
    };
  }, []);

  const date = new Date(now);
  const hello = t(greeting(date.getHours()), { name: me.first });

  return (
    <main className="screen" data-pending={live === null || !me.loaded ? "" : undefined}>
      <div className="home-bar">
        <Mark size={32} />
        <Bell />
      </div>

      <div className="home-head">
        <p className="home-date">
          <span className="timed">
            {t(`dayLong.${WEEKDAYS[date.getDay()]}`)}, {formatLongDate(now, locale)}
          </span>
          {demoOnly && clock !== "real" && (
            <button className="pill" onClick={openClock}>
              <ClockIcon size={14} weight="bold" aria-hidden="true" />
              {t("home.demoTime")} {formatTime(now)}
            </button>
          )}
        </p>
        <h1 className="large fit" style={fit(hello)}>
          <span className="timed">{hello}</span>
        </h1>
      </div>

      <div className="stack">
        {student.status === "error" ? <QueryState query={student} /> : <Cards />}
      </div>
    </main>
  );
}

/** The three sections of Home: practice, the last quizzes, and the teachers' documents. */
function Cards() {
  const { t } = useT();
  const results = useResults();
  const documents = useDocuments();
  const notifications = useNotifications();
  // The alert that announced a result stays unread until its summary has been opened.
  const fresh = new Set(
    (notifications.data ?? []).filter((n) => n.kind === "result_ready" && n.readAt === null).map((n) => n.payload.sessionId),
  );
  const recent = (results.data ?? []).slice(0, RECENT);
  // The two "all" links do not prefetch: they are the less taken way, and a prefetch would add their screens to Home's first load.
  // `null`: the API has no documents yet (404 or 501), so the section is left out. Still loading shows nothing, as the quizzes do.
  const docs = documents.data ?? [];
  const showDocs = documents.data !== null && (documents.data !== undefined || documents.status === "error");
  let i = 0;
  return (
    <>
      <div {...rise(i++)}>
        <PracticeCard />
      </div>

      <section className="home-sec" aria-labelledby="home-recent">
        <h2 id="home-recent" className="section-h rise" style={{ "--i": i++ } as CSSProperties}>
          {t("home.recent")}
        </h2>
        {results.data && recent.length === 0 && (
          <p className="t-cap home-empty rise" style={{ "--i": i++ } as CSSProperties}>
            {t("home.noQuizzes")}
          </p>
        )}
        {recent.length > 0 && (
          <ul className="list">
            {recent.map((r) => (
              <li key={r.sessionId} {...rise(i++)}>
                <ResultRow result={r} isNew={fresh.has(r.sessionId)} />
              </li>
            ))}
          </ul>
        )}
        {recent.length > 0 && (
          <Link href="/app/summary" prefetch={false} className="more press rise" style={{ "--i": i++ } as CSSProperties} transitionTypes={["nav-forward"]}>
            {t("home.allResults")}
            <CaretRightIcon size={16} weight="bold" aria-hidden="true" />
          </Link>
        )}
      </section>

      {showDocs && (
        <section className="home-sec" aria-labelledby="home-docs">
          <h2 id="home-docs" className="section-h rise" style={{ "--i": i++ } as CSSProperties}>
            {t("docs.title")}
          </h2>
          <p className="t-cap home-sub rise" style={{ "--i": i++ } as CSSProperties}>
            {t("docs.sub")}
          </p>
          {documents.status === "error" && <QueryState query={documents} />}
          {documents.data && docs.length === 0 && (
            <p className="t-cap home-empty rise" style={{ "--i": i++ } as CSSProperties}>
              {t("docs.none")}
            </p>
          )}
          {docs.length > 0 && (
            <ul className="list">
              {docs.slice(0, RECENT).map((d) => (
                <li key={d.id} {...rise(i++)}>
                  <DocRow doc={d} />
                </li>
              ))}
            </ul>
          )}
          {docs.length > RECENT && (
            <Link href="/app/documents" prefetch={false} className="more press rise" style={{ "--i": i++ } as CSSProperties} transitionTypes={["nav-forward"]}>
              {t("docs.all")}
              <CaretRightIcon size={16} weight="bold" aria-hidden="true" />
            </Link>
          )}
        </section>
      )}
    </>
  );
}
