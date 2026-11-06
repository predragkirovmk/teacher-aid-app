import { describe, expect, test } from "vitest";
import type { LibraryItem, Subject } from "@/lib/teacher/api/types";
import { defaultChoice, libraryChoice, libraryChoices, LIBRARY_LONG, newestSavedFirst, offersMine, shownLibrary, showsRow } from "@/lib/teacher/library";
import { ALL, choiceOf, MINE } from "@/lib/teacher/subjects";

const MATH: Subject = { id: "math", name: "Математика" };
const PHYSICS: Subject = { id: "physics", name: "Физика" };
const ART: Subject = { id: "art", name: "Ликовно" };

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
/** More than the library calls long, mostly in subjects the teacher does not teach. */
const many = [...Array.from({ length: LIBRARY_LONG }, (_, i) => item(`x${i}`, `2026-09-${String(10 + i).padStart(2, "0")}T08:00:00.000Z`, ART)), item("m", "2026-10-02T08:00:00.000Z", MATH)];
const mine = new Set(["math"]);

describe("the lessons colleagues saved", () => {
  test("the one saved last comes first, and a list is not changed by sorting it", () => {
    const before = few.map((i) => i.lesson_id);
    expect(newestSavedFirst(few).map((i) => i.lesson_id)).toEqual(["b", "c", "a"]);
    expect(few.map((i) => i.lesson_id)).toEqual(before);
  });

  test("a short library is shown whole, and a subject shows only its own", () => {
    expect(defaultChoice(few, mine)).toBe(ALL);
    expect(shownLibrary(few, ALL, mine)).toHaveLength(3);
    expect(shownLibrary(few, choiceOf("physics"), mine).map((i) => i.lesson_id)).toEqual(["b"]);
    expect(shownLibrary(few, choiceOf("math"), mine).map((i) => i.lesson_id)).toEqual(["c", "a"]);
  });

  test("the row has all subjects first and then each subject by name, and no row for a single subject", () => {
    expect(libraryChoices(few, mine).map((c) => c.value)).toEqual([ALL, choiceOf("math"), choiceOf("physics")]);
    expect(showsRow(few, mine)).toBe(true);
    expect(showsRow([item("a", "2026-10-01T08:00:00.000Z"), item("b", "2026-10-02T08:00:00.000Z")], mine)).toBe(false);
  });
});

describe("a long library", () => {
  test("opens on the teacher's own subjects, with 'My subjects' in the row ahead of all subjects", () => {
    expect(many.length).toBeGreaterThan(LIBRARY_LONG);
    expect(offersMine(many, mine)).toBe(true);
    expect(defaultChoice(many, mine)).toBe(MINE);
    expect(libraryChoices(many, mine).map((c) => c.value)).toEqual([MINE, ALL, choiceOf("art"), choiceOf("math")]);
    expect(shownLibrary(many, MINE, mine).map((i) => i.lesson_id)).toEqual(["m"]);
  });

  test("all subjects is one press away and shows everything", () => {
    expect(shownLibrary(many, ALL, mine)).toHaveLength(many.length);
    expect(libraryChoice(ALL, many, mine)).toBe(ALL);
  });

  test("a teacher with nothing in it that is theirs is not sent to an empty list", () => {
    expect(offersMine(many, new Set(["chemistry"]))).toBe(false);
    expect(defaultChoice(many, new Set(["chemistry"]))).toBe(ALL);
    // Nor before the courses are known.
    expect(defaultChoice(many, new Set())).toBe(ALL);
  });

  test("a library at the limit is still short", () => {
    const limit = many.slice(0, LIBRARY_LONG);
    expect(offersMine(limit, mine)).toBe(false);
    expect(defaultChoice(limit, mine)).toBe(ALL);
  });

  test("the choice that counts is the teacher's, unless it is not offered any more", () => {
    expect(libraryChoice(null, many, mine)).toBe(MINE);
    expect(libraryChoice(choiceOf("art"), many, mine)).toBe(choiceOf("art"));
    expect(libraryChoice(choiceOf("gone"), many, mine)).toBe(ALL);
    // 'My subjects' chosen, then the library got shorter: it is not offered, so everything is shown.
    expect(libraryChoice(MINE, few, mine)).toBe(ALL);
  });
});
