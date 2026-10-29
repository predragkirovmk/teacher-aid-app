import type { Key } from "./i18n";

/**
 * Dates and durations as a teacher says them: "четврток, 29 октомври", "вчера", "пред 3 дена", "Трае 12 минути". Only the
 * rules are here and they return keys of the dictionary, so each language words them itself (Macedonian counts days, weeks
 * and months in its own forms). Days are calendar days on this computer, not spans of 24 hours: a lesson changed at 23:50
 * is "вчера" at 00:10.
 */

const DAY_MS = 86_400_000;

/** The calendar day of a moment, as a number of days that two moments can be subtracted in. Daylight saving does not shift it. */
const dayNumber = (ms: number): number => {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
};

export type When = { key: Key; n?: number };

/** A `When` in words, through the `t` of the interface. */
export const sayWhen = (t: (key: Key, vars?: Record<string, number>) => string, when: When): string =>
  t(when.key, when.n === undefined ? undefined : { n: when.n });

/** How long ago `then` was, in the words a person uses for it. A moment in the future (a clock that is a little off) is today. */
export function relativeDay(then: number, now: number): When {
  const days = dayNumber(now) - dayNumber(then);
  if (days <= 0) return { key: "when.today" };
  if (days === 1) return { key: "when.yesterday" };
  if (days < 7) return { key: "when.days", n: days };
  if (days < 14) return { key: "when.week" };
  if (days < 30) return { key: "when.weeks", n: Math.floor(days / 7) };
  if (days < 60) return { key: "when.month" };
  if (days < 365) return { key: "when.months", n: Math.min(11, Math.floor(days / 30)) };
  if (days < 730) return { key: "when.year" };
  return { key: "when.years", n: Math.floor(days / 365) };
}

export const WEEKDAY_KEYS = ["weekday.0", "weekday.1", "weekday.2", "weekday.3", "weekday.4", "weekday.5", "weekday.6"] as const satisfies readonly Key[];
export const MONTH_KEYS = [
  "month.0",
  "month.1",
  "month.2",
  "month.3",
  "month.4",
  "month.5",
  "month.6",
  "month.7",
  "month.8",
  "month.9",
  "month.10",
  "month.11",
] as const satisfies readonly Key[];

/** The parts of "четврток, 29 октомври": the keys of the weekday and month, and the day of the month. */
export function dateParts(ms: number): { weekday: (typeof WEEKDAY_KEYS)[number]; day: number; month: (typeof MONTH_KEYS)[number] } {
  const d = new Date(ms);
  return { weekday: WEEKDAY_KEYS[d.getDay()], day: d.getDate(), month: MONTH_KEYS[d.getMonth()] };
}

/** "09:05": the time on this computer's clock, always two digits for each part. */
export const clockTime = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** A lesson that has run for under this many minutes is told in minutes; after that the start time says more. */
export const MINUTES_LIMIT = 120;

export type Running =
  | { kind: "now" }
  | { kind: "minutes"; n: number }
  /** Started earlier today: the time it began. */
  | { kind: "time"; time: string }
  /** Started on an earlier day, for a lesson somebody forgot to end (EC-SES-01). */
  | { kind: "when"; when: When };

/** How long a lesson has been running, from when it started to `now` (the server's clock, see `OpenSession.server_now`). */
export function runningFor(startedAt: number, now: number): Running {
  const minutes = Math.floor((now - startedAt) / 60_000);
  if (minutes < 1) return { kind: "now" };
  if (minutes < MINUTES_LIMIT) return { kind: "minutes", n: minutes };
  const when = relativeDay(startedAt, now);
  return when.key === "when.today" ? { kind: "time", time: clockTime(startedAt) } : { kind: "when", when };
}
