import { DAYS, PERIODS, SAMPLE_MARKS, WEEK, type AttendanceStatus, type DayId, type Shift, type SlotKind, type SubjectId } from "./data";

/**
 * What the demo takes as now: the phone's own clock, or a fixed moment picked in Settings or on
 * Home, so a walkthrough can show the school day at any stage, on any day of the week.
 */
export const CLOCKS = ["real", "before", "during", "midday", "after", "weekend"] as const;
export type ClockId = (typeof CLOCKS)[number];

/** Calendar arithmetic through Date, so a daylight-saving change never shifts a lesson by an hour. */
const dayAt = (ms: number, days = 0, hhmm = "00:00") => {
  const d = new Date(ms);
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, h, m).getTime();
};
const plus = (ms: number, minutes: number) => ms + minutes * 60_000;

/** The weekday of a moment, or null on a weekend. */
export function dayOf(ms: number): DayId | null {
  const w = new Date(ms).getDay();
  return w >= 1 && w <= 5 ? DAYS[w - 1] : null;
}

/** Midnight on the Monday of the school week a moment falls in; a weekend belongs to the week ahead. */
export function weekStart(ms: number) {
  const w = new Date(ms).getDay();
  return dayAt(ms, w === 0 ? 1 : w === 6 ? 2 : 1 - w);
}

/** A morning-shift week; the shifts swap every week from there. */
const SHIFT_FROM = new Date(2026, 9, 12).getTime();

export function shiftOf(ms: number): Shift {
  const weeks = Math.round((weekStart(ms) - SHIFT_FROM) / (7 * 86_400_000));
  return weeks % 2 === 0 ? "morning" : "afternoon";
}

/** The preset moments, on the Monday of the current school week and in that week's shift. */
export function demoTime(clock: ClockId, real: number) {
  if (clock === "real") return real;
  const monday = weekStart(real);
  const periods = PERIODS[shiftOf(monday)];
  const at = (hhmm: string) => dayAt(monday, 0, hhmm);
  const last = periods[WEEK[0].slots.length - 1][1];
  switch (clock) {
    case "before":
      return plus(at(periods[0][0]), -15);
    case "during":
      return plus(at(periods[0][0]), 10);
    case "midday":
      return plus(at(periods[3][0]), 10);
    case "after":
      return plus(at(last), 50);
    case "weekend":
      return dayAt(monday, 5, "10:00");
  }
}

export type Lesson = {
  subject: SubjectId;
  kind: SlotKind;
  day: DayId;
  /** 1 for the first lesson of the day. */
  period: number;
  from: string;
  to: string;
  start: number;
  end: number;
};

/** The lessons on the date of a moment; none on a weekend. */
export function lessonsOn(ms: number): Lesson[] {
  const day = dayOf(ms);
  if (!day) return [];
  const periods = PERIODS[shiftOf(ms)];
  return WEEK.find((d) => d.day === day)!.slots.map((s, i) => {
    const [from, to] = periods[i];
    return { ...s, day, period: i + 1, from, to, start: dayAt(ms, 0, from), end: dayAt(ms, 0, to) };
  });
}

export const currentLesson = (now: number) => lessonsOn(now).find((l) => l.start <= now && now < l.end);

/** The next lesson to start after now, a week ahead at most; with `subject`, that subject's lesson
    under way or next. */
export function nextLesson(now: number, subject?: SubjectId) {
  for (let i = 0; i <= 7; i++) {
    const found = lessonsOn(dayAt(now, i)).find((l) => (subject ? l.subject === subject && l.end > now : l.start > now));
    if (found) return found;
  }
}

/** The lessons Home lists: today's while school is on, else the next school day's. */
export function dayToShow(now: number) {
  const today = lessonsOn(now);
  if (today.length && now < today[today.length - 1].end) return today;
  const next = nextLesson(now);
  return next ? lessonsOn(next.start) : [];
}

/** The first test or quiz not yet over in the current school week, other than `skip`. */
export function nextAssessment(now: number, skip?: Lesson) {
  const monday = weekStart(now);
  for (let i = 0; i < DAYS.length; i++) {
    const found = lessonsOn(dayAt(monday, i)).find((l) => l.kind !== "lesson" && l.end > now && l.start !== skip?.start);
    if (found) return found;
  }
}

/** Calendar days from now to a moment: 0 today, 1 tomorrow. */
export const daysFrom = (now: number, ms: number) => Math.round((dayAt(ms) - dayAt(now)) / 86_400_000);

/** The scan that counts for a lesson: from a quarter of an hour before it starts until it ends. */
export const checkinFor = <C extends { subject: SubjectId; at: number }>(lesson: Lesson, checkins: C[]) =>
  checkins.find((c) => c.subject === lesson.subject && c.at >= lesson.start - 15 * 60_000 && c.at < lesson.end);

/** The teacher's mark for a lesson that is over: present with a scan, else from the register. */
export const markFor = (lesson: Lesson, scanned: boolean): AttendanceStatus =>
  scanned ? "present" : (SAMPLE_MARKS[`${lesson.day}-${lesson.period}`] ?? "present");
