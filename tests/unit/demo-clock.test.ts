import { describe, expect, it } from "vitest";
import {
  CLOCKS,
  PERIODS,
  demoTime,
  shiftOf,
  weekStart,
} from "@/lib/app/demo/schedule";

// Months are 0-based: 9 is October. Local time, in the school's zone (see vitest.config.mts).
const at = (day: number, h = 0, m = 0, month = 9) => new Date(2026, month, day, h, m).getTime();
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// 12 Oct 2026 is a Monday and the first morning-shift week; the shifts swap every week.
describe("calendar helpers", () => {
  it("puts the week at Monday midnight, and a weekend in the week ahead", () => {
    expect(weekStart(at(21, 15))).toBe(at(19));
    expect(weekStart(at(19, 0))).toBe(at(19));
    expect(weekStart(at(24, 10))).toBe(at(26));
    expect(weekStart(at(25, 23))).toBe(at(26));
  });
});

describe("shifts", () => {
  it("swap every week, from a morning week on 12 Oct", () => {
    expect(shiftOf(at(12, 9))).toBe("morning");
    expect(shiftOf(at(16, 9))).toBe("morning");
    expect(shiftOf(at(19, 9))).toBe("afternoon");
    expect(shiftOf(at(26, 9))).toBe("morning");
    expect(shiftOf(at(5, 9))).toBe("afternoon");
  });

  it("put a weekend in the week ahead's shift", () => {
    expect(shiftOf(at(17, 9))).toBe(shiftOf(at(19, 9)));
  });
});

describe("the timetable", () => {
  it("has lessons of 40 minutes with a 20-minute break after the third", () => {
    for (const shift of ["morning", "afternoon"] as const) {
      const p = PERIODS[shift];
      expect(p).toHaveLength(6);
      const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
      p.forEach(([from, to]) => expect(minutes(to) - minutes(from)).toBe(40));
      expect(minutes(p[3][0]) - minutes(p[2][1])).toBe(20);
    }
  });
});

describe("the demo clock", () => {
  const real = at(20, 12);

  it("is the phone's own time unless a moment is picked", () => {
    expect(demoTime("real", real)).toBe(real);
  });

  it("puts each preset on the Monday of the school week, in that week's shift", () => {
    expect(hhmm(demoTime("before", real))).toBe("12:45");
    expect(hhmm(demoTime("during", real))).toBe("13:10");
    expect(hhmm(demoTime("midday", real))).toBe("15:40");
    expect(hhmm(demoTime("after", real))).toBe("18:30");
    for (const id of ["before", "during", "midday", "after"] as const) {
      expect(new Date(demoTime(id, real)).getDay()).toBe(1);
      expect(new Date(demoTime(id, real)).getDate()).toBe(19);
    }
    const weekend = new Date(demoTime("weekend", real));
    expect([weekend.getDate(), weekend.getHours(), weekend.getDay()]).toEqual([24, 10, 6]);
  });

  it("follows the shift of the week in a morning week", () => {
    const morning = at(14, 12);
    expect(hhmm(demoTime("before", morning))).toBe("07:45");
    expect(hhmm(demoTime("during", morning))).toBe("08:10");
    expect(hhmm(demoTime("midday", morning))).toBe("10:40");
    expect(hhmm(demoTime("after", morning))).toBe("13:30");
  });

  it("puts 'during' inside the first lesson and 'before' ahead of it", () => {
    const [from, to] = PERIODS[shiftOf(real)][0];
    const monday = weekStart(real);
    const clock = (hm: string) => new Date(new Date(monday).setHours(Number(hm.slice(0, 2)), Number(hm.slice(3)))).getTime();
    expect(demoTime("during", real)).toBeGreaterThan(clock(from));
    expect(demoTime("during", real)).toBeLessThan(clock(to));
    expect(demoTime("before", real)).toBeLessThan(clock(from));
    const [from4, to4] = PERIODS[shiftOf(real)][3];
    expect(demoTime("midday", real)).toBeGreaterThan(clock(from4));
    expect(demoTime("midday", real)).toBeLessThan(clock(to4));
    expect(demoTime("after", real)).toBeGreaterThan(clock(PERIODS[shiftOf(real)][5][1]));
  });

  it("knows every preset", () => {
    expect([...CLOCKS]).toEqual(["real", "before", "during", "midday", "after", "weekend"]);
  });
});
