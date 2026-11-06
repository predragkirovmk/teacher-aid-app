import { describe, expect, test } from "vitest";
import { createMockApi, memorySource } from "@/lib/teacher/api/mock";
import { freshState } from "@/lib/teacher/api/mock-state";
import type { CourseDashboard, CourseSummary, DashboardTopic } from "@/lib/teacher/api/types";
import {
  attendanceByStudent,
  averageAttendance,
  averageRight,
  focusByStudent,
  lessonRows,
  lessonsWithoutPractice,
  orderCourses,
  practiceRows,
  summaryOf,
  topicShare,
  weakestFirst,
} from "@/lib/teacher/classes";

const ANCHOR = new Date(2026, 9, 29).getTime();
const api = () => createMockApi(memorySource(freshState(ANCHOR), { now: () => ANCHOR + 9 * 3_600_000 }), { delay: () => Promise.resolve() });
const first = async (): Promise<CourseDashboard> => {
  const a = api();
  const [course] = await a.listCourses();
  return a.getDashboard(course.id);
};

const course = (name: string, last: string | null): CourseSummary => ({
  id: name,
  subject: { id: "m", name: "Математика" },
  class: { id: name, name, year: 1 },
  student_count: 20,
  speed_bonus_on: true,
  lessons_run: last ? 1 : 0,
  last_session_at: last,
});

describe("the list of classes", () => {
  test("the most recently taught first, then the ones not taught by class name", () => {
    const list = orderCourses([course("IV-1", null), course("II-4", "2026-10-20T09:00:00Z"), course("I-2", null), course("III-5", "2026-10-27T09:00:00Z")]);
    expect(list.map((c) => c.class.name)).toEqual(["III-5", "II-4", "I-2", "IV-1"]);
  });
});

describe("attendance per student", () => {
  test("counts each status, in the register's order, from the lessons listed", async () => {
    const d = await first();
    const rows = attendanceByStudent(d);
    expect(rows).toHaveLength(d.students.length);
    const surnames = rows.map((r) => r.full_name.split(" ").pop() as string);
    expect(surnames).toEqual([...surnames].sort((a, b) => a.localeCompare(b, "mk")));
    for (const r of rows) {
      expect(r.present + r.late + r.absent + r.no_device).toBe(r.held);
      expect(Object.values(r.reasons).reduce((n, v) => n + (v ?? 0), 0)).toBe(r.no_device);
    }
    expect(rows.reduce((n, r) => n + r.held, 0)).toBe(d.attendance.length);
  });

  test("a student who joined mid-year is counted only from then, and flagged", async () => {
    const d = await first();
    const rows = attendanceByStudent(d);
    const late = rows.find((r) => r.joined_mid_year)!;
    const regular = rows.find((r) => !r.joined_mid_year)!;
    expect(late.joined_class_at).not.toBeNull();
    expect(late.held).toBeLessThan(regular.held);
    expect(late.held).toBeGreaterThan(0);
  });

  test("a student with no attendance at all has nothing held", () => {
    const rows = attendanceByStudent({
      students: [{ id: "a", full_name: "Ана Петровска", joined_mid_year: false, joined_class_at: null, points: 0 }],
      sessions: [],
      attendance: [],
    });
    expect(rows[0]).toMatchObject({ held: 0, present: 0, absent: 0 });
  });

  test("an average of those in the room over all rows; none before a lesson", async () => {
    const d = await first();
    const avg = averageAttendance(d)!;
    expect(avg).toBeGreaterThan(0.7);
    expect(avg).toBeLessThanOrEqual(1);
    expect(averageAttendance({ sessions: [], attendance: [] })).toBeNull();
  });
});

describe("topics", () => {
  const t = (topic: string, right: number, total: number): DashboardTopic => ({ topic, right, total, by_student: [] });
  test("weakest first by share, then the one asked more, then name; unasked topics are left out", () => {
    const list = weakestFirst([t("Б", 7, 10), t("А", 7, 10), t("В", 14, 20), t("Г", 3, 10), t("Д", 0, 0)]);
    expect(list.map((x) => x.topic)).toEqual(["Г", "В", "А", "Б"]);
    expect(topicShare(t("Д", 0, 0))).toBeNull();
  });

  test("a student who joined later was asked fewer questions of a topic (BR-TOP-02)", async () => {
    const d = await first();
    const mid = d.students.find((s) => s.joined_mid_year)!;
    const other = d.students.find((s) => !s.joined_mid_year)!;
    const sum = (id: string) => d.topics.reduce((n, x) => n + (x.by_student.find((b) => b.student_id === id)?.total ?? 0), 0);
    expect(sum(mid.id)).toBeLessThan(sum(other.id));
    for (const x of d.topics) expect(x.by_student.reduce((n, b) => n + b.total, 0)).toBe(x.total);
  });
});

describe("the summary, the lessons and the rest", () => {
  test("lessons held, average attendance, the weakest topic", async () => {
    const d = await first();
    const s = summaryOf(d);
    expect(s.lessons).toBe(10);
    expect(s.attendance).not.toBeNull();
    expect(s.weakest).toEqual(weakestFirst(d.topics)[0]);
    expect(s.right).toBe(averageRight(d));
  });

  test("the share right is all the right answers over all the answers asked; none before a question", async () => {
    const d = await first();
    const right = d.topics.reduce((n, t) => n + t.right, 0);
    const total = d.topics.reduce((n, t) => n + t.total, 0);
    expect(averageRight(d)).toBeCloseTo(right / total, 10);
    expect(averageRight({ topics: [] })).toBeNull();
    expect(averageRight({ topics: [{ topic: "А", right: 0, total: 0, by_student: [] }] })).toBeNull();
  });

  test("a lesson row says who took part and the share right", async () => {
    const d = await first();
    const rows = lessonRows(d.sessions);
    expect(rows).toHaveLength(10);
    for (const r of rows) {
      expect(r.took_part).toBe(r.session.tally.present + r.session.tally.late);
      expect(r.right).toBe(Math.round(r.session.right_rate * 100));
    }
  });

  test("focus: only students who left, most first", async () => {
    const d = await first();
    const rows = focusByStudent(d);
    expect(rows.reduce((n, r) => n + r.times, 0)).toBe(d.focus_flags.length);
    expect(rows.map((r) => r.times)).toEqual([...rows.map((r) => r.times)].sort((a, b) => b - a));
    expect(focusByStudent({ ...d, focus_flags: [] })).toEqual([]);
  });

  test("practice sets follow the lessons, newest first, and the lessons without one are counted", async () => {
    const d = await first();
    const rows = practiceRows(d);
    expect(rows).toHaveLength(d.practice.length);
    const idx = rows.map((r) => d.sessions.findIndex((s) => s.id === r.practice.practice_set.session_id));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(lessonsWithoutPractice(d)).toBe(d.sessions.length - d.practice.length);
  });
});
