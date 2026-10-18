"use client";

import { useMemo, useSyncExternalStore } from "react";
import { demoTime } from "./clock";
import {
  ACHIEVEMENTS,
  BASE_ATTENDED,
  BASE_LOG,
  BASE_TOTAL,
  LAST_WEEK_ATTENDED,
  LAST_WEEK_TOTAL,
  LEADERBOARD,
  NOTIFS,
  type AchievementId,
  type AttendanceStatus,
  type SubjectId,
} from "./data";
import { useApp } from "./store";

export type NotifItem = {
  id: string;
  subject: SubjectId;
  /** Static notifications carry a text key; check-ins are built from a template. */
  kind: "static" | "checkin";
  when: number;
  link: string;
  unread: boolean;
};

export function useNotifs(): NotifItem[] {
  const { checkins, read } = useApp();
  return useMemo(() => {
    const fromCheckins: NotifItem[] = checkins.map((c) => ({
      id: c.id,
      subject: c.subject,
      kind: "checkin",
      when: c.at,
      link: `/app/subject/${c.subject}`,
      // A record of the student's own scan: listed, but never news, so it does not raise the badge.
      unread: false,
    }));
    const fromStatic: NotifItem[] = NOTIFS.map((n) => ({
      id: n.id,
      subject: n.subject,
      kind: "static",
      when: new Date(n.when).getTime(),
      link: n.link,
      unread: !read.includes(n.id) && n.id !== "n-late",
    }));
    return [...fromCheckins, ...fromStatic];
  }, [checkins, read]);
}

export type LogEntry = {
  id: string;
  subject: SubjectId;
  when: number;
  status: AttendanceStatus;
  scanned: boolean;
};

export function useAttendance() {
  const { checkins } = useApp();
  return useMemo(() => {
    const attended = BASE_ATTENDED + checkins.length;
    const total = BASE_TOTAL + checkins.length;
    const log: LogEntry[] = [
      ...checkins.map((c) => ({ id: c.id, subject: c.subject, when: c.at, status: "present" as const, scanned: true })),
      ...BASE_LOG.map((l) => ({
        id: l.id,
        subject: l.subject,
        when: new Date(`${l.date}T12:00`).getTime(),
        status: l.status,
        scanned: false,
      })),
    ];
    const percent = Math.round((attended / total) * 100);
    // From the rounded figures, so the change always matches the two numbers a student would see.
    const change = percent - Math.round((LAST_WEEK_ATTENDED / LAST_WEEK_TOTAL) * 100);
    return { attended, total, percent, change, log };
  }, [checkins]);
}

export function useAchievements() {
  const { quizAnswered, perfectQuiz } = useApp();
  return useMemo(
    () => ({ answer: quizAnswered, ontime: true, streak: false, perfect: perfectQuiz }),
    [quizAnswered, perfectQuiz],
  );
}

/** Points per achievement. Proposed, like the scoring values of spec 13.1. */
export const BADGE_POINTS = 20;
/** Achievements the demo starts with; their points are already in the starting totals. */
const STARTING_BADGES: readonly AchievementId[] = ["ontime"];

/**
 * The class leaderboard. Points come only from quizzes and achievements (decided 13 Oct 2026);
 * checking in to a lesson records attendance and earns nothing.
 */
export function useStandings() {
  const { quizPoints } = useApp();
  const got = useAchievements();
  return useMemo(() => {
    const badges = ACHIEVEMENTS.filter((a) => got[a] && !STARTING_BADGES.includes(a)).length;
    // A tie goes to the student, so reaching a classmate's points is enough to pass them.
    const rows = LEADERBOARD.map((l) => (l.me ? { ...l, points: l.points + quizPoints + badges * BADGE_POINTS } : l)).sort(
      (a, b) => b.points - a.points || Number(!!b.me) - Number(!!a.me),
    );
    const index = rows.findIndex((r) => r.me);
    return { rows, rank: index + 1, me: rows[index], above: index > 0 ? rows[index - 1] : null };
  }, [quizPoints, got]);
}

const minute = () => Math.floor(Date.now() / 60_000) * 60_000;
function tick(cb: () => void) {
  const id = setInterval(cb, 15_000);
  document.addEventListener("visibilitychange", cb);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", cb);
  };
}

/** The phone's time, to the minute. Null while hydrating: the server cannot know the phone's clock. */
export const useRealNow = () => useSyncExternalStore(tick, minute, () => null);

/** Now as the demo sees it: the phone's time, or the moment picked as demo time. */
export function useNow(): number | null {
  const { clock } = useApp();
  const real = useRealNow();
  return real === null ? null : demoTime(clock, real);
}

const MONTHS_LONG = {
  mk: ["јануари", "февруари", "март", "април", "мај", "јуни", "јули", "август", "септември", "октомври", "ноември", "декември"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** "12 октомври", "12 October": the day and the whole month, by hand like formatDate. */
export function formatLongDate(ms: number, locale: "mk" | "en") {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS_LONG[locale][d.getMonth()]}`;
}

const MONTHS = {
  mk: ["јан", "фев", "мар", "апр", "мај", "јун", "јул", "авг", "сеп", "окт", "ное", "дек"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

// Hand-rolled instead of toLocaleDateString: Node and the browser disagree on Macedonian
// month names, which is a hydration mismatch.
export function formatDate(ms: number, locale: "mk" | "en") {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[locale][d.getMonth()]}`;
}

/** Thousands grouped the local way (1.480 in Macedonian, 1,480 in English), by hand for the same reason. */
export function formatPoints(n: number, locale: "mk" | "en") {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, locale === "mk" ? "." : ",");
}

export function formatTime(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
