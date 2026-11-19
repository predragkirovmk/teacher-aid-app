"use client";

import { CaretRightIcon, ClockIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, type CSSProperties } from "react";
import { Bell } from "@/components/app/Bell";
import { Mark } from "@/components/app/Mark";
import { PracticeHomeRow } from "@/components/app/practice/PracticeRows";
import { QueryState } from "@/components/app/QueryState";
import { useUI } from "@/components/app/ui";
import { demoOnly } from "@/lib/app/api";
import { useLatestResult, useMe, useNotifications } from "@/lib/app/api/hooks";
import { useDemoClock, useNow } from "@/lib/app/demo";
import { formatLongDate, formatTime } from "@/lib/app/format";
import { useT } from "@/lib/app/i18n";
import { useSelf } from "@/lib/app/profile";
import { subjectLabel } from "@/lib/app/subjects";

/** Set once the intro has played this session; the root layout reads it before the first paint. */
const RISE_KEY = "teacheraid-home-rise";

/**
 * Now, while hydrating: the server cannot know the phone's clock, so both sides render this moment
 * (a Monday, 07:45) and [data-pending] shows the time-bound text as placeholder bars until the
 * real time is in.
 */
const STAND_IN = new Date(2026, 9, 12, 7, 45).getTime();

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

/** Practice, then the last quiz: the two cards Home keeps for now. */
function Cards() {
  return (
    <>
      <div {...rise(0)}>
        <PracticeHomeRow />
      </div>
      <div {...rise(1)}>
        <div className="grid2">
          <ResultTile wide />
        </div>
      </div>
    </>
  );
}

function ResultTile({ wide = false }: { wide?: boolean }) {
  const { t } = useT();
  const latest = useLatestResult();
  const notifications = useNotifications();
  const result = latest.data;
  // The alert that announced the result stays unread until the summary has been opened.
  const isNew =
    !!result &&
    !!notifications.data?.some((n) => n.kind === "result_ready" && n.payload.sessionId === result.sessionId && n.readAt === null);
  const subject = result ? subjectLabel(t, result.subjectId, result.subjectName) : "";
  return (
    <Link href={result ? `/app/summary/${encodeURIComponent(result.sessionId)}` : "/app/summary"} className="card tile" transitionTypes={["nav-forward"]} style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <span className="tile__head">
        <span className="t-label">{t("home.summary")}</span>
        <CaretRightIcon size={16} aria-hidden="true" />
      </span>
      <span className="tile-big">{result ? `${result.right}/${result.total}` : "–"}</span>
      {!result ? (
        <span className="t-cap">{latest.status === "ready" ? t("home.noResult") : null}</span>
      ) : isNew ? (
        <span className="t-cap">
          <b className="tile__new">{t("home.new")}</b> · {subject}
        </span>
      ) : (
        <span className="t-cap">{t("home.correct", { s: subject })}</span>
      )}
    </Link>
  );
}
