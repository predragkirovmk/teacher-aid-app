import { describe, expect, test } from "vitest";
import { dictionaries, translate } from "@/lib/teacher/i18n";
import { clockTime, dateParts, MINUTES_LIMIT, relativeDay, runningFor, type When } from "@/lib/teacher/when";

/** A local time, as a person on this computer reads it. */
const at = (month: number, day: number, hour = 12, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const NOW = at(10, 29, 9, 30);

const said = (when: When, locale: "mk" | "en" = "mk") => translate(locale, "school", when.key, when.n === undefined ? undefined : { n: when.n });

describe("how long ago, in a person's words", () => {
  test("the same calendar day is today and the day before is yesterday, whatever the hour", () => {
    expect(relativeDay(at(10, 29, 0, 1), NOW)).toEqual({ key: "when.today" });
    expect(relativeDay(at(10, 28, 23, 59), NOW)).toEqual({ key: "when.yesterday" });
    // Eleven minutes ago, across midnight, is already yesterday.
    expect(relativeDay(at(10, 28, 23, 55), at(10, 29, 0, 6))).toEqual({ key: "when.yesterday" });
    // Nearly two days is still the day before yesterday, not yesterday.
    expect(relativeDay(at(10, 27, 23, 59), NOW)).toEqual({ key: "when.days", n: 2 });
  });

  test("a few days are counted, then a week, weeks, a month, months, a year, years", () => {
    const back = (days: number) => relativeDay(at(10, 29 - days), NOW);
    expect(back(2)).toEqual({ key: "when.days", n: 2 });
    expect(back(6)).toEqual({ key: "when.days", n: 6 });
    expect(back(7)).toEqual({ key: "when.week" });
    expect(back(13)).toEqual({ key: "when.week" });
    expect(back(14)).toEqual({ key: "when.weeks", n: 2 });
    expect(back(28)).toEqual({ key: "when.weeks", n: 4 });
    expect(back(30)).toEqual({ key: "when.month" });
    expect(back(59)).toEqual({ key: "when.month" });
    expect(back(60)).toEqual({ key: "when.months", n: 2 });
    expect(back(364)).toEqual({ key: "when.months", n: 11 });
    expect(back(365)).toEqual({ key: "when.year" });
    expect(back(729)).toEqual({ key: "when.year" });
    expect(back(730)).toEqual({ key: "when.years", n: 2 });
  });

  test("a clock that is a little ahead does not say a lesson was changed tomorrow", () => {
    expect(relativeDay(at(10, 30), NOW)).toEqual({ key: "when.today" });
  });

  test("the change of the clocks at the end of October does not move a day", () => {
    // Europe switches on the last Sunday of October (25 October 2026), so that day has 25 hours.
    expect(relativeDay(at(10, 24, 12), at(10, 25, 12))).toEqual({ key: "when.yesterday" });
    expect(relativeDay(at(10, 25, 12), at(10, 26, 12))).toEqual({ key: "when.yesterday" });
    expect(relativeDay(at(10, 24, 12), at(10, 27, 12))).toEqual({ key: "when.days", n: 3 });
  });

  test("Macedonian says yesterday and three days ago as people do, English likewise", () => {
    expect(said(relativeDay(at(10, 28), NOW))).toBe("вчера");
    expect(said(relativeDay(at(10, 26), NOW))).toBe("пред 3 дена");
    expect(said(relativeDay(at(10, 15), NOW))).toBe("пред 2 недели");
    expect(said(relativeDay(at(7, 1), NOW))).toBe("пред 4 месеци");
    expect(said(relativeDay(at(10, 28), NOW), "en")).toBe("yesterday");
    expect(said(relativeDay(at(10, 26), NOW), "en")).toBe("3 days ago");
    expect(said(relativeDay(at(10, 15), NOW), "en")).toBe("2 weeks ago");
  });

  test("every word it can answer with is in both dictionaries", () => {
    const keys = [0, 1, 2, 7, 14, 30, 60, 365, 730].map((days) => relativeDay(at(10, 29) - days * 86_400_000, NOW).key);
    for (const key of keys) {
      expect(dictionaries.mk[key], `mk ${key}`).toBeDefined();
      expect(dictionaries.en[key], `en ${key}`).toBeDefined();
    }
  });
});

describe("today's date in words", () => {
  test("is the weekday, the day and the month: четврток, 29 октомври", () => {
    const parts = dateParts(NOW);
    expect(parts.day).toBe(29);
    const say = (locale: "mk" | "en") =>
      translate(locale, "school", "today.date", { weekday: translate(locale, "school", parts.weekday), day: parts.day, month: translate(locale, "school", parts.month) });
    expect(say("mk")).toBe("четврток, 29 октомври");
    expect(say("en")).toBe("Thursday, 29 October");
  });

  test("starts the week on Sunday as the calendar does, and has a name for each day and month", () => {
    expect(dateParts(at(11, 1)).weekday).toBe("weekday.0");
    expect(dateParts(at(11, 2)).weekday).toBe("weekday.1");
    expect(dateParts(at(1, 1)).month).toBe("month.0");
    expect(dateParts(at(12, 31)).month).toBe("month.11");
    for (let i = 0; i < 7; i++) expect(dictionaries.mk[`weekday.${i}` as "weekday.0"]).toBeDefined();
    for (let i = 0; i < 12; i++) expect(dictionaries.en[`month.${i}` as "month.0"]).toBeDefined();
  });
});

describe("how long a lesson has been running", () => {
  const start = at(10, 29, 8, 0);

  test("a lesson that has just begun says so, then counts minutes", () => {
    expect(runningFor(start, start + 59_000)).toEqual({ kind: "now" });
    expect(runningFor(start, start + 60_000)).toEqual({ kind: "minutes", n: 1 });
    expect(runningFor(start, start + 12 * 60_000 + 59_000)).toEqual({ kind: "minutes", n: 12 });
    expect(runningFor(start, start + (MINUTES_LIMIT - 1) * 60_000)).toEqual({ kind: "minutes", n: MINUTES_LIMIT - 1 });
  });

  test("a start time that is a little ahead of the clock is just begun, not a negative number", () => {
    expect(runningFor(start, start - 5 * 60_000)).toEqual({ kind: "now" });
  });

  test("after two hours it tells when it began instead of a long count of minutes", () => {
    expect(runningFor(start, start + MINUTES_LIMIT * 60_000)).toEqual({ kind: "time", time: "08:00" });
    expect(clockTime(at(10, 29, 9, 5))).toBe("09:05");
  });

  test("a lesson nobody ended says which day it began (EC-SES-01)", () => {
    expect(runningFor(at(10, 28, 14, 0), NOW)).toEqual({ kind: "when", when: { key: "when.yesterday" } });
    expect(runningFor(at(10, 20, 14, 0), NOW)).toEqual({ kind: "when", when: { key: "when.week" } });
  });
});
