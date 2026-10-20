"use client";

import { BooksIcon, CaretRightIcon, CheckIcon, ClockIcon, ScanIcon, XIcon, type Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, ViewTransition, type CSSProperties } from "react";
import { Avatar } from "@/components/app/Avatar";
import { Mark } from "@/components/app/Mark";
import { QueryState } from "@/components/app/QueryState";
import { Row } from "@/components/app/Row";
import { SubjectMark, SubjectRow } from "@/components/app/SubjectCard";
import { useUI } from "@/components/app/ui";
import { demoOnly } from "@/lib/app/api";
import {
  useAttendanceView,
  useCourses,
  useLatestResult,
  useMe,
  useNotifications,
  useStandings,
} from "@/lib/app/api/hooks";
import type { Course } from "@/lib/app/api/types";
import {
  checkinFor,
  currentLesson,
  dayToShow,
  daysFrom,
  markFor,
  nextAssessment,
  nextLesson,
  roomLabel,
  shiftOf,
  useDemoClock,
  useNow,
  useScans,
  type Lesson,
  type Mark as LessonMark,
} from "@/lib/app/demo";
import { formatLongDate, formatTime } from "@/lib/app/format";
import { useT } from "@/lib/app/i18n";
import { useSelf } from "@/lib/app/profile";
import { initials, personName } from "@/lib/app/quiz";
import { subjectLabel } from "@/lib/app/subjects";
import { useTween } from "@/lib/app/tween";

/** Set once the intro has played this session; the root layout reads it before the first paint. */
const RISE_KEY = "teacheraid-home-rise";

/**
 * Now, while hydrating: the server cannot know the phone's clock, so both sides render this moment
 * (a Monday, 07:45) and [data-pending] shows the time-bound text as placeholder bars until the
 * real time is in.
 */
const STAND_IN = new Date(2026, 9, 12, 7, 45).getTime();

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const MARK_ICONS: Record<LessonMark, Icon> = { present: CheckIcon, late: ClockIcon, absent: XIcon };

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

  const date = new Date(now);
  const hello = t(greeting(date.getHours()), { name: me.first });

  return (
    <main className="screen" data-pending={live === null || !me.loaded ? "" : undefined}>
      <div className="home-bar">
        <Mark size={32} />
        <Link href="/app/profile" replace aria-label={t("nav.profile")} style={{ display: "block", borderRadius: "50%" }}>
          <Avatar photo={me.photo} initials={me.initials} size={48} className="avatar--quiet" />
        </Link>
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
        {demoOnly ? (
          <DemoCards now={now} live={live !== null} />
        ) : student.status === "error" ? (
          <QueryState query={student} />
        ) : (
          <LiveCards />
        )}
      </div>
    </main>
  );
}

/** What the API backs: where the student stands, attendance, the last result and the subjects. */
function LiveCards() {
  return (
    <>
      <div {...rise(0)}>
        <div className="grid2">
          <RankTile />
          <AttendanceTile />
        </div>
      </div>
      <div {...rise(1)}>
        <div className="grid2">
          <ResultTile wide />
        </div>
      </div>
      <div {...rise(2)}>
        <AllSubjects />
      </div>
    </>
  );
}

function AllSubjects({ gap = false }: { gap?: boolean }) {
  const { t } = useT();
  const courses = useCourses();
  return (
    <div className="list" style={gap ? { marginTop: 16 } : undefined}>
      <Row
        icon={BooksIcon}
        label={t("home.allSubjects")}
        value={courses.data ? t("home.subjectCount", { n: courses.data.length }) : undefined}
        href="/app/subjects"
      />
    </div>
  );
}

function RankTile() {
  const { t } = useT();
  const standings = useStandings();
  return (
    <Link href="/app/leaderboard" className="card tile">
      <span className="tile__head">
        <span className="t-label">{t("home.leaderboard")}</span>
        <CaretRightIcon size={16} aria-hidden="true" />
      </span>
      <span className="tile-big">{standings.data ? `#${standings.data.rank}` : "–"}</span>
      <span className="t-cap">{t("home.rankCaption")}</span>
    </Link>
  );
}

function AttendanceTile() {
  const { t } = useT();
  const attendance = useAttendanceView();
  return (
    <Link href="/app/attendance" className="card tile">
      <span className="tile__head">
        <span className="t-label">{t("home.attendance")}</span>
        <CaretRightIcon size={16} aria-hidden="true" />
      </span>
      {attendance.data ? (
        <AttendanceFigures percent={attendance.data.percent} change={attendance.data.change} />
      ) : (
        <span className="tile-big">–</span>
      )}
    </Link>
  );
}

function AttendanceFigures({ percent, change }: { percent: number; change: number | null }) {
  const { t } = useT();
  const att = useTween(percent, "teacheraid-shown-attendance");
  return (
    <>
      <span className={`tile-big${att.counting ? " counting" : ""}`}>{att.value}%</span>
      {change !== null && (
        <span className="t-cap">
          {change === 0 ? t("home.attSame") : t("home.attChange", { d: `${change > 0 ? "+" : "−"}${Math.abs(change)}%` })}
        </span>
      )}
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
    <Link href="/app/summary" className="card tile" style={wide ? { gridColumn: "1 / -1" } : undefined}>
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

/** The demo's school day: the lesson under way or next, the next test, today's timetable. */
function DemoCards({ now, live }: { now: number; live: boolean }) {
  const { t, locale } = useT();
  const scans = useScans();
  const courses = useCourses().data ?? [];

  // The card holds the lesson under way, or the next one to start, today or on a later day.
  const current = currentLesson(now);
  const lesson = current ?? nextLesson(now)!;
  const course = courses.find((c) => c.subjectId === lesson.subject);
  const scan = current && checkinFor(current, scans);
  const needsScan = !!current && !scan;
  const minutes = Math.round((lesson.start - now) / 60_000);
  const eyebrow = [
    current ? t("home.now", { t: current.to }) : t("home.nextLesson"),
    !current && minutes <= 60 && t("home.inMin", { n: minutes }),
    lesson.kind !== "lesson" && t(`kind.${lesson.kind}`),
  ]
    .filter(Boolean)
    .join(" · ");
  /** Today, Tomorrow, or the weekday, long or short. */
  const dayName = (l: Lesson, short = false) => {
    const d = daysFrom(now, l.start);
    return d === 0 ? t("home.today") : d === 1 ? t("home.tomorrow") : t(short ? `day.${l.day}` : `dayLong.${l.day}`);
  };

  // When the card already shows a test, the tile looks past it to the next one.
  const ahead = nextAssessment(now, lesson.kind !== "lesson" ? lesson : undefined);
  const aheadWord = ahead ? dayName(ahead, true) : t("home.noTests");

  // Today's lessons while school is on; after the last one, and at the weekend, the next school day's.
  const shown = dayToShow(now);
  const listTitle = shown.length ? dayName(shown[0]) : t("home.today");

  /** What a lesson's row says under its name: the teacher's mark once it is over, else time and room. */
  const caption = (l: Lesson) => {
    const done = checkinFor(l, scans);
    if (l.end <= now) {
      const mark = markFor(l, !!done);
      const MarkIcon = MARK_ICONS[mark];
      return (
        <span className="mark-line">
          <MarkIcon size={14} weight="bold" aria-hidden="true" />
          {t(`att.status.${mark}`)}
          {done && ` · ${formatTime(done.at)}`}
        </span>
      );
    }
    if (done) {
      return (
        <span className="mark-line">
          <CheckIcon size={14} weight="bold" aria-hidden="true" />
          {t("home.checkedIn", { t: formatTime(done.at) })}
        </span>
      );
    }
    return `${l.from} · ${roomLabel(t, l.subject)}`;
  };

  const lessonName = course ? subjectLabel(t, course.subjectId, course.subjectName) : "";
  const teacher = course ? personName(course.teacherName, locale) : "";

  return (
    <>
      {/* What matters first: the lesson under way or next, which is also where you check in. */}
      <div {...rise(0)}>
        <ViewTransition name={`subject-${course?.id}`} share="morph" default="none">
          <Link
            href={needsScan ? "/app/scan" : `/app/subject/${course?.id}`}
            className="next"
            data-morph={`subject-${course?.id}`}
          >
            <span className="next__sign" aria-hidden="true">
              {live && course && <SubjectMark subject={course} />}
            </span>
            <div className="next__eyebrow">
              <span className="grow timed">{eyebrow}</span>
              <CaretRightIcon size={22} aria-hidden="true" />
            </div>
            <div className="next__name">
              <span className="timed">{lessonName}</span>
            </div>
            <div className="next__when">
              <span className="timed">
                {scan ? (
                  <>
                    <CheckIcon size={20} weight="bold" aria-hidden="true" />
                    {t("home.checkedIn", { t: formatTime(scan.at) })}
                  </>
                ) : current ? (
                  roomLabel(t, lesson.subject)
                ) : (
                  `${dayName(lesson)}, ${lesson.from} · ${roomLabel(t, lesson.subject)}`
                )}
              </span>
            </div>
            {needsScan ? (
              <div className="next__action">
                <ScanIcon size={22} aria-hidden="true" />
                {t("home.scanNow")}
              </div>
            ) : (
              <div className="next__foot">
                <span className="monogram" aria-hidden="true">
                  {live && initials(teacher)}
                </span>
                <span className="grow">
                  <span className="timed">{teacher}</span>
                </span>
              </div>
            )}
          </Link>
        </ViewTransition>
      </div>

      <div {...rise(1)}>
        <div className="grid2">
          <Link href="/app/schedule" className="card tile">
            <span className="tile__head">
              <span className="t-label">{t(ahead?.kind === "pop" ? "home.nextPop" : "home.nextTest")}</span>
              <CaretRightIcon size={16} aria-hidden="true" />
            </span>
            <span className="tile-word fit" style={fit(aheadWord)}>
              <span className="timed">{aheadWord}</span>
            </span>
            <span className="t-cap">
              <span className="timed">{ahead ? `${subjectLabel(t, ahead.subject, ahead.subject)} · ${ahead.from}` : t("home.noTestsCap")}</span>
            </span>
          </Link>
          <RankTile />
        </div>
      </div>

      <div {...rise(2)}>
        <div className="grid2">
          <AttendanceTile />
          <ResultTile />
        </div>
      </div>

      <div {...rise(3)}>
        <div className="section-row">
          <h2 className="section-h">
            <span className="timed">
              {listTitle}
              {shown.length > 0 && ` · ${t(`home.${shiftOf(shown[0].start)}-shift`)}`}
            </span>
          </h2>
          <Link href="/app/schedule" className="section-link">
            {t("sch.title")}
          </Link>
        </div>
        <ul className="list timed-list">
          {shown.map((l) => {
            const row = courses.find((c: Course) => c.subjectId === l.subject);
            const isNow = current?.start === l.start;
            return (
              row && (
                <li key={l.start}>
                  <SubjectRow
                    course={row}
                    shared={row.id !== course?.id}
                    caption={caption(l)}
                    status={
                      isNow ? (
                        <span className="pill pill--now">{t("home.nowShort")}</span>
                      ) : l.kind !== "lesson" && l.end > now ? (
                        <span className="pill">{t(`kind.${l.kind}`)}</span>
                      ) : null
                    }
                  />
                </li>
              )
            );
          })}
        </ul>
        <AllSubjects gap />
      </div>
    </>
  );
}
