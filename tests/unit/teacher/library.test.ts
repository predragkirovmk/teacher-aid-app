import { describe, expect, test } from "vitest";
import type { LibraryItem, Subject } from "@/lib/teacher/api/types";
import { newestSavedFirst } from "@/lib/teacher/library";

const MATH: Subject = { id: "math", name: "Математика" };
const PHYSICS: Subject = { id: "physics", name: "Физика" };

const item = (id: string, saved: string, subject: Subject = MATH, extra: Partial<LibraryItem> = {}): LibraryItem => ({
  lesson_id: id,
  title: `Лекција ${id}`,
  subject,
  year: 2,
  question_count: 6,
  owner: { id: "t-1", name: "Зоран Илиев" },
  saved_at: saved,
  already_copied: false,
  ...extra,
});

const few = [
  item("a", "2026-10-01T08:00:00.000Z"),
  item("b", "2026-10-20T08:00:00.000Z", PHYSICS),
  item("c", "2026-10-10T08:00:00.000Z", MATH),
];

describe("the templates", () => {
  test("the one saved last comes first, and a list is not changed by sorting it", () => {
    const before = few.map((i) => i.lesson_id);
    expect(newestSavedFirst(few).map((i) => i.lesson_id)).toEqual(["b", "c", "a"]);
    expect(few.map((i) => i.lesson_id)).toEqual(before);
  });
});
