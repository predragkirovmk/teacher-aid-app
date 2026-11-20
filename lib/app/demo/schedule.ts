/**
 * The demo's timetable, which the demo clock's presets are built on. The spec has no API for any of it (owner decision 2026-10-18), so
 * it is shown only when `demoOnly` is set; nothing here is read in live mode.
 */

/**
 * Lessons are 40 minutes, with a 20-minute break after the third. Many Macedonian schools teach in
 * two shifts; class 7B swaps between them every week (SHIFT_FROM below).
 */
export type Shift = "morning" | "afternoon";
export const PERIODS: Record<Shift, [string, string][]> = {
  morning: [
    ["08:00", "08:40"],
    ["08:45", "09:25"],
    ["09:30", "10:10"],
    ["10:30", "11:10"],
    ["11:15", "11:55"],
    ["12:00", "12:40"],
  ],
  afternoon: [
    ["13:00", "13:40"],
    ["13:45", "14:25"],
    ["14:30", "15:10"],
    ["15:30", "16:10"],
    ["16:15", "16:55"],
    ["17:00", "17:40"],
  ],
};

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
  const last = periods[periods.length - 1][1];
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
