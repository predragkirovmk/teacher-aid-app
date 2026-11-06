import { describe, expect, test } from "vitest";
import type { LessonSummary } from "@/lib/teacher/api/types";
import { preparedLessons, shownOnToday, TODAY_LESSONS_MAX } from "@/lib/teacher/today";

const lesson = (id: string, updated: string, times_run = 0): LessonSummary => ({
  last_session_id: null,
  id,
  title: `Лекција ${id}`,
  subject: { id: "math", name: "Математика" },
  year: 2,
  question_count: 6,
  version: 1,
  times_run,
  last_run_at: times_run ? "2026-10-01T08:00:00.000Z" : null,
  copied_from: null,
  created_at: updated,
  updated_at: updated,
});

describe("what Today lists", () => {
  test("only lessons that have never been run, the one changed last first", () => {
    const all = [
      lesson("old", "2026-10-01T08:00:00.000Z"),
      lesson("run", "2026-10-28T08:00:00.000Z", 2),
      lesson("new", "2026-10-27T08:00:00.000Z"),
      lesson("mid", "2026-10-15T08:00:00.000Z"),
    ];
    expect(preparedLessons(all).map((l) => l.id)).toEqual(["new", "mid", "old"]);
  });

  test("a lesson that was run once is not prepared any more, however recently it was changed", () => {
    expect(preparedLessons([lesson("a", "2026-10-28T08:00:00.000Z", 1)])).toEqual([]);
  });

  test("the lesson running now is left out, since the band at the top is about it", () => {
    const all = [lesson("a", "2026-10-02T08:00:00.000Z"), lesson("b", "2026-10-03T08:00:00.000Z")];
    expect(preparedLessons(all, "b").map((l) => l.id)).toEqual(["a"]);
    expect(preparedLessons(all, "nope").map((l) => l.id)).toEqual(["b", "a"]);
    expect(preparedLessons(all, null)).toHaveLength(2);
  });

  test("the order is made here, so it does not depend on the order the API happens to answer in", () => {
    const all = [lesson("a", "2026-10-02T08:00:00.000Z"), lesson("b", "2026-10-03T08:00:00.000Z")];
    expect(preparedLessons(all)).toEqual(preparedLessons([...all].reverse()));
  });

  test("a time that cannot be read puts a lesson last instead of breaking the list", () => {
    const all = [lesson("bad", "not a time"), lesson("ok", "2026-10-03T08:00:00.000Z")];
    expect(preparedLessons(all).map((l) => l.id)).toEqual(["ok", "bad"]);
  });

  test("the list handed in is not changed", () => {
    const all = [lesson("a", "2026-10-02T08:00:00.000Z"), lesson("b", "2026-10-03T08:00:00.000Z")];
    preparedLessons(all);
    expect(all.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("how many Today shows", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => i);

  test("at most five, and says when there are more", () => {
    expect(TODAY_LESSONS_MAX).toBe(5);
    expect(shownOnToday(ids(5))).toEqual({ shown: ids(5), more: false });
    expect(shownOnToday(ids(6))).toEqual({ shown: ids(5), more: true });
    expect(shownOnToday(ids(12)).shown).toHaveLength(5);
  });

  test("a few, or none, are all shown and there is nothing more", () => {
    expect(shownOnToday(ids(2))).toEqual({ shown: [0, 1], more: false });
    expect(shownOnToday([])).toEqual({ shown: [], more: false });
  });
});
