import { describe, expect, it } from "vitest";
import {
  CLOCKS,
  PERIODS,
  WEEK,
  checkinFor,
  currentLesson,
  dayOf,
  dayToShow,
  daysFrom,
  demoTime,
  lessonsOn,
  markFor,
  nextAssessment,
  nextLesson,
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
  it("finds the weekday, and nothing on a weekend", () => {
    expect(dayOf(at(19, 10))).toBe("mon");
    expect(dayOf(at(23, 10))).toBe("fri");
    expect(dayOf(at(24, 10))).toBeNull();
    expect(dayOf(at(25, 10))).toBeNull();
  });

  it("puts the week at Monday midnight, and a weekend in the week ahead", () => {
    expect(weekStart(at(21, 15))).toBe(at(19));
    expect(weekStart(at(19, 0))).toBe(at(19));
    expect(weekStart(at(24, 10))).toBe(at(26));
    expect(weekStart(at(25, 23))).toBe(at(26));
  });

  it("counts calendar days, across the daylight-saving change of 25 Oct", () => {
    expect(daysFrom(at(20, 15), at(20, 8))).toBe(0);
    expect(daysFrom(at(20, 15), at(21, 8))).toBe(1);
    expect(daysFrom(at(24, 12), at(26, 8))).toBe(2);
    expect(daysFrom(at(21, 9), at(20, 9))).toBe(-1);
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

  it("has a lesson in every slot a day lists, at most six", () => {
    for (const d of WEEK) expect(d.slots.length).toBeLessThanOrEqual(6);
  });

  it("lists the lessons of a day in the week's shift, none at the weekend", () => {
    const tue = lessonsOn(at(20, 12));
    expect(tue).toHaveLength(6);
    expect(tue[0]).toMatchObject({ subject: "physics", kind: "test", day: "tue", period: 1, from: "13:00", to: "13:40" });
    expect(hhmm(tue[0].start)).toBe("13:00");
    expect(hhmm(tue[5].end)).toBe("17:40");
    expect(lessonsOn(at(24, 12))).toEqual([]);
  });

  it("starts a lesson on the clock after the daylight-saving change, not an hour off", () => {
    const mon = lessonsOn(at(26, 7));
    expect(mon[0]).toMatchObject({ subject: "math", from: "08:00" });
    expect(hhmm(mon[0].start)).toBe("08:00");
    expect(mon[0].end - mon[0].start).toBe(40 * 60_000);
  });

  it("finds the lesson under way, and none in a break or after school", () => {
    expect(currentLesson(at(20, 13, 10))?.subject).toBe("physics");
    expect(currentLesson(at(20, 13, 40))).toBeUndefined();
    expect(currentLesson(at(20, 13, 45))?.subject).toBe("english");
    expect(currentLesson(at(20, 18))).toBeUndefined();
    expect(currentLesson(at(24, 13, 10))).toBeUndefined();
  });

  it("finds the next lesson, over a night and a weekend", () => {
    expect(nextLesson(at(20, 13, 10))?.subject).toBe("english");
    const fri = nextLesson(at(23, 18));
    expect(fri).toMatchObject({ day: "mon", subject: "math", from: "08:00" });
    expect(hhmm(fri!.start)).toBe("08:00");
  });

  it("finds a subject's lesson under way or next", () => {
    expect(nextLesson(at(20, 14), "english")?.from).toBe("13:45");
    expect(nextLesson(at(20, 15), "english")?.day).toBe("thu");
    expect(nextLesson(at(20, 15), "art")).toMatchObject({ day: "mon", from: "12:00" });
    expect(nextLesson(at(20, 15), "chemistry")).toBeUndefined();
  });

  it("shows today's lessons while school is on, then the next school day's", () => {
    expect(dayToShow(at(20, 14))[0].day).toBe("tue");
    expect(dayToShow(at(20, 18))[0].day).toBe("wed");
    expect(dayToShow(at(24, 10))[0].day).toBe("mon");
  });

  it("finds the next test or quiz this week, other than the one skipped", () => {
    const first = nextAssessment(at(19, 12));
    expect(first).toMatchObject({ day: "tue", subject: "physics", kind: "test" });
    expect(nextAssessment(at(20, 14), first)).toMatchObject({ day: "wed", subject: "math", kind: "pop" });
    expect(nextAssessment(at(23, 18))).toBeUndefined();
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
      expect(dayOf(demoTime(id, real))).toBe("mon");
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
    expect(currentLesson(demoTime("during", real))?.period).toBe(1);
    expect(currentLesson(demoTime("before", real))).toBeUndefined();
    expect(nextLesson(demoTime("before", real))?.period).toBe(1);
    expect(currentLesson(demoTime("midday", real))?.period).toBe(4);
    expect(currentLesson(demoTime("after", real))).toBeUndefined();
  });

  it("knows every preset", () => {
    expect([...CLOCKS]).toEqual(["real", "before", "during", "midday", "after", "weekend"]);
  });
});

describe("check-ins and marks", () => {
  const physics = lessonsOn(at(20, 12))[0]; // Tuesday 13:00 to 13:40

  it("counts a scan from 15 minutes before the lesson until it ends", () => {
    expect(checkinFor(physics, [{ subjectId: "physics", at: physics.start - 15 * 60_000 }])).toBeDefined();
    expect(checkinFor(physics, [{ subjectId: "physics", at: physics.start + 5 * 60_000 }])).toBeDefined();
    expect(checkinFor(physics, [{ subjectId: "physics", at: physics.end - 1 }])).toBeDefined();
  });

  it("does not count a scan too early, at the end, or for another subject", () => {
    expect(checkinFor(physics, [{ subjectId: "physics", at: physics.start - 15 * 60_000 - 1 }])).toBeUndefined();
    expect(checkinFor(physics, [{ subjectId: "physics", at: physics.end }])).toBeUndefined();
    expect(checkinFor(physics, [{ subjectId: "math", at: physics.start + 1 }])).toBeUndefined();
    expect(checkinFor(physics, [])).toBeUndefined();
  });

  it("marks a scanned lesson present, and reads the register otherwise", () => {
    const monday = lessonsOn(at(19, 12));
    const thursday = lessonsOn(at(22, 12));
    expect(markFor(monday[2], true)).toBe("present");
    expect(markFor(monday[2], false)).toBe("late"); // mon-3 in the register
    expect(markFor(thursday[1], false)).toBe("absent"); // thu-2
    expect(markFor(thursday[1], true)).toBe("present");
    expect(markFor(monday[0], false)).toBe("present");
  });
});
