import { describe, expect, test } from "vitest";
import type { DraftSummary, LessonSummary, Subject } from "@/lib/teacher/api/types";
import { heldLine, heldText, lessonSections, newestChangeFirst, unfinishedDrafts } from "@/lib/teacher/lessons-list";
import { translate, type Key } from "@/lib/teacher/i18n";
import { ALL, choiceOf, effectiveChoice, needsSubjectRow, subjectOfChoice, subjectsOf } from "@/lib/teacher/subjects";
import { TODAY_DRAFTS_MAX, shownOnToday } from "@/lib/teacher/today";

const MATH: Subject = { id: "math", name: "Математика" };
const PHYSICS: Subject = { id: "physics", name: "Физика" };
const ART: Subject = { id: "art", name: "Ликовно" };

const lesson = (id: string, updated: string, extra: Partial<LessonSummary> = {}): LessonSummary => ({
  id,
  title: `Лекција ${id}`,
  subject: MATH,
  year: 2,
  question_count: 6,
  version: 1,
  times_run: 0,
  last_run_at: null,
  copied_from: null,
  created_at: updated,
  updated_at: updated,
  ...extra,
});

const draft = (id: string, updated: string, extra: Partial<DraftSummary> = {}): DraftSummary => ({
  id,
  status: "ready",
  failure: null,
  title: `Нацрт ${id}`,
  subject: MATH,
  year: 2,
  question_count: 5,
  refinements: [],
  emphasis: null,
  source: null,
  previous_draft_id: null,
  lesson_id: null,
  created_at: updated,
  updated_at: updated,
  ...extra,
});

describe("the two sections of lessons", () => {
  const all = [
    lesson("a", "2026-10-01T08:00:00.000Z"),
    lesson("b", "2026-10-20T08:00:00.000Z", { times_run: 2, last_run_at: "2026-10-25T08:00:00.000Z" }),
    lesson("c", "2026-10-28T08:00:00.000Z"),
    lesson("d", "2026-10-10T08:00:00.000Z", { times_run: 1, last_run_at: "2026-10-12T08:00:00.000Z" }),
    lesson("e", "2026-10-15T08:00:00.000Z"),
  ];

  test("a lesson never run is prepared, one run once or more is held, each section the lesson changed last first", () => {
    const { prepared, held } = lessonSections(all, ALL);
    expect(prepared.map((l) => l.id)).toEqual(["c", "e", "a"]);
    expect(held.map((l) => l.id)).toEqual(["b", "d"]);
  });

  test("the order is by when it was changed, not by when it was held", () => {
    // d was held after it was changed, b was changed last: b is first however the held dates fall.
    const swapped = [lesson("b", "2026-10-20T08:00:00.000Z", { times_run: 1, last_run_at: "2026-10-01T08:00:00.000Z" }), lesson("d", "2026-10-10T08:00:00.000Z", { times_run: 1, last_run_at: "2026-10-27T08:00:00.000Z" })];
    expect(lessonSections(swapped, ALL).held.map((l) => l.id)).toEqual(["b", "d"]);
  });

  test("two changed at the same moment keep a fixed order, so the page does not shuffle", () => {
    const same = [lesson("l-10", "2026-10-05T08:00:00.000Z"), lesson("l-2", "2026-10-05T08:00:00.000Z"), lesson("l-1", "2026-10-05T08:00:00.000Z")];
    expect(newestChangeFirst(same).map((l) => l.id)).toEqual(["l-1", "l-2", "l-10"]);
    expect(newestChangeFirst([...same].reverse()).map((l) => l.id)).toEqual(["l-1", "l-2", "l-10"]);
  });

  test("a time the clock cannot read counts as the oldest, and nothing breaks", () => {
    expect(newestChangeFirst([lesson("x", "broken"), lesson("y", "2026-10-05T08:00:00.000Z")]).map((l) => l.id)).toEqual(["y", "x"]);
  });

  test("the lesson in a class that has not ended is still prepared: the count is of ended lessons (FR-LES-17)", () => {
    expect(lessonSections([lesson("a", "2026-10-01T08:00:00.000Z", { times_run: 0 })], ALL).prepared).toHaveLength(1);
  });

  test("a subject shows only its own lessons, in both sections", () => {
    const mixed = [...all, lesson("p", "2026-10-29T08:00:00.000Z", { subject: PHYSICS }), lesson("q", "2026-10-26T08:00:00.000Z", { subject: PHYSICS, times_run: 3, last_run_at: "2026-10-26T09:00:00.000Z" })];
    const physics = lessonSections(mixed, choiceOf("physics"));
    expect(physics.prepared.map((l) => l.id)).toEqual(["p"]);
    expect(physics.held.map((l) => l.id)).toEqual(["q"]);
    expect(lessonSections(mixed, choiceOf("math")).prepared.map((l) => l.id)).toEqual(["c", "e", "a"]);
    expect(lessonSections(mixed, ALL).prepared).toHaveLength(4);
  });

  test("a list is not changed by sorting it", () => {
    const before = all.map((l) => l.id);
    lessonSections(all, ALL);
    expect(all.map((l) => l.id)).toEqual(before);
  });
});

describe("the lessons that are not finished", () => {
  test("the one changed last first, whatever order the API gave", () => {
    const drafts = [draft("a", "2026-10-01T08:00:00.000Z"), draft("b", "2026-10-28T08:00:00.000Z"), draft("c", "2026-10-15T08:00:00.000Z")];
    expect(unfinishedDrafts(drafts, ALL).map((d) => d.id)).toEqual(["b", "c", "a"]);
  });

  test("a subject shows only its own", () => {
    const drafts = [draft("a", "2026-10-01T08:00:00.000Z", { subject: PHYSICS }), draft("b", "2026-10-28T08:00:00.000Z")];
    expect(unfinishedDrafts(drafts, choiceOf("physics")).map((d) => d.id)).toEqual(["a"]);
  });

  test("Today shows the first three, and says how many there are when there are more", () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => draft(`d${n}`, `2026-10-0${n}T08:00:00.000Z`));
    const { shown, more } = shownOnToday(newestChangeFirst(six), TODAY_DRAFTS_MAX);
    expect(TODAY_DRAFTS_MAX).toBe(3);
    expect(shown.map((d) => d.id)).toEqual(["d6", "d5", "d4"]);
    expect(more).toBe(true);
    expect(shownOnToday(newestChangeFirst(six.slice(0, 3)), TODAY_DRAFTS_MAX).more).toBe(false);
  });
});

describe("the row of subjects", () => {
  test("holds each subject of the lessons and the drafts once, by name, and appears only for more than one", () => {
    const subjects = subjectsOf([lesson("a", "2026-10-01T08:00:00.000Z"), lesson("b", "2026-10-01T08:00:00.000Z", { subject: PHYSICS })], [draft("c", "2026-10-01T08:00:00.000Z", { subject: ART }), draft("d", "2026-10-01T08:00:00.000Z")]);
    expect(subjects.map((s) => s.name)).toEqual(["Ликовно", "Математика", "Физика"]);
    expect(needsSubjectRow(subjects)).toBe(true);
    expect(needsSubjectRow(subjectsOf([lesson("a", "2026-10-01T08:00:00.000Z")], [draft("c", "2026-10-01T08:00:00.000Z")]))).toBe(false);
    expect(needsSubjectRow(subjectsOf([]))).toBe(false);
  });

  test("a subject that has gone from the lists is not a choice any more: everything is shown", () => {
    const subjects = [MATH, PHYSICS];
    expect(effectiveChoice(null, subjects)).toBeNull();
    expect(effectiveChoice(choiceOf("physics"), subjects)).toBe(choiceOf("physics"));
    expect(effectiveChoice(choiceOf("art"), subjects)).toBe(ALL);
    expect(effectiveChoice(ALL, subjects)).toBe(ALL);
  });

  test("a choice names its subject, and 'all' names none", () => {
    expect(subjectOfChoice(choiceOf("math"))).toBe("math");
    expect(subjectOfChoice(ALL)).toBeNull();
  });
});

describe("when a lesson was held, and how many times, in words", () => {
  // Today is Thursday 29 October 2026; the clock of a computer is local, so the days are counted as they are written on a calendar.
  const today = new Date(2026, 9, 29).getTime();
  const held = (times_run: number, days: number) => ({ times_run, last_run_at: new Date(2026, 9, 29 - days, 10, 0).toISOString() });
  const say = (locale: "mk" | "en", l: { times_run: number; last_run_at: string | null }) => {
    const line = heldLine(l, today, locale);
    return line && heldText((key: Key, vars) => translate(locale, "school", key, vars), line);
  };

  test("a lesson never held has no line", () => {
    expect(heldLine({ times_run: 0, last_run_at: null }, today, "mk")).toBeNull();
  });

  test("Macedonian counts days and times in its own forms", () => {
    expect(say("mk", held(2, 3))).toBe("Одржана пред 3 дена · 2 пати");
    expect(say("mk", held(1, 1))).toBe("Одржана вчера · 1 пат");
    expect(say("mk", held(5, 0))).toBe("Одржана денес · 5 пати");
    expect(say("mk", held(11, 9))).toBe("Одржана пред една недела · 11 пати");
    expect(say("mk", held(21, 20))).toBe("Одржана пред 2 недели · 21 пат");
    expect(say("mk", held(12, 45))).toBe("Одржана пред еден месец · 12 пати");
    expect(say("mk", held(31, 400))).toBe("Одржана пред една година · 31 пат");
    expect(say("mk", held(101, 800))).toBe("Одржана пред 2 години · 101 пат");
  });

  test("English counts only one as singular", () => {
    expect(say("en", held(1, 3))).toBe("Held 3 days ago · 1 time");
    expect(say("en", held(2, 1))).toBe("Held yesterday · 2 times");
    expect(say("en", held(21, 0))).toBe("Held today · 21 times");
  });

  test("a count with no date is said alone, and nothing breaks", () => {
    expect(say("mk", { times_run: 3, last_run_at: null })).toBe("3 пати");
    expect(say("mk", { times_run: 3, last_run_at: "broken" })).toBe("3 пати");
  });
});
