import { describe, expect, test } from "vitest";
import { sanitizeTeacherState } from "@/lib/teacher/store";
import { emptyOverlay, freshState, isDraft, isLesson, MOCK_KEY, MOCK_VERSION, readState, sanitizeState, startOfDay, writeState } from "@/lib/teacher/api/mock-state";
import { bankLesson, bankQuestions } from "@/lib/teacher/api/mock-bank";
import type { Lesson, LessonDraft } from "@/lib/teacher/api/types";

const NOW = new Date(2026, 9, 29, 14, 30).getTime();
const TODAY = startOfDay(NOW);

const lesson = (patch: Partial<Lesson> = {}): Lesson => {
  const bank = bankLesson("nizi");
  const questions = bankQuestions(bank, "l-n1");
  return {
    id: "l-n1",
    title: bank.title,
    subject: { id: "math", name: "Математика" },
    year: 3,
    question_count: questions.length,
    version: 1,
    times_run: 0,
    last_run_at: null,
    copied_from: null,
    created_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    review_summary: bank.summary,
    questions,
    source: null,
    emphasis: null,
    ...patch,
  };
};

const draft = (patch: Partial<LessonDraft> = {}): LessonDraft => {
  const bank = bankLesson("nizi");
  return {
    id: "d2",
    source_id: "src-n1",
    subject: { id: "math", name: "Математика" },
    year: 3,
    emphasis: null,
    refinements: [],
    created_at: new Date(NOW).toISOString(),
    title: bank.title,
    review_summary: bank.summary,
    questions: bankQuestions(bank, "d2"),
    ...patch,
  };
};

describe("the mock's saved state", () => {
  test("a fresh state starts the demo as of the start of today, with nothing changed", () => {
    const s = freshState(TODAY);
    expect(s.v).toBe(MOCK_VERSION);
    expect(s.anchor).toBe(TODAY);
    expect(s.school).toEqual(emptyOverlay());
    expect(s.university).toEqual(emptyOverlay());
    expect(startOfDay(NOW)).toBe(new Date(2026, 9, 29).getTime());
  });

  test("a good save comes back as it was", () => {
    const saved = { ...freshState(TODAY), school: { ...emptyOverlay(), counter: 3, speed_bonus: { "course-ii-4": false }, lessons: [lesson()], drafts: [draft()], deleted: ["l-nizi"] } };
    expect(sanitizeState(JSON.parse(JSON.stringify(saved)), NOW)).toEqual(saved);
  });

  test("anything that is not a save of this version starts over", () => {
    for (const junk of [null, undefined, 42, "text", [], {}, { v: 0, anchor: TODAY }, { v: 2, anchor: TODAY }, { v: MOCK_VERSION }, { v: MOCK_VERSION, anchor: "yesterday" }, { v: MOCK_VERSION, anchor: NaN }]) {
      expect(sanitizeState(junk, NOW)).toEqual(freshState(TODAY));
    }
  });

  test("a day in the far future is a clock gone wrong, and starts over", () => {
    expect(sanitizeState({ ...freshState(TODAY + 30 * 86_400_000) }, NOW)).toEqual(freshState(TODAY));
    expect(sanitizeState({ ...freshState(TODAY - 30 * 86_400_000) }, NOW).anchor).toBe(TODAY - 30 * 86_400_000);
  });

  test("keeps the good parts of a damaged save and drops the rest", () => {
    const damaged = {
      v: MOCK_VERSION,
      anchor: TODAY,
      school: {
        first_run_done: "yes",
        speed_bonus: { a: false, b: "no" },
        lessons: [lesson(), { id: "x" }, lesson({ questions: [] }), lesson({ id: "l-n2", version: 0 }), null],
        deleted: ["l-nizi", 4, null],
        drafts: [draft(), draft({ refinements: ["sharper" as never] })],
        sources: [{ id: "src-n1", kind: "typed", file_name: null, text: "текст" }, { id: 7 }],
        counter: -5,
      },
      university: "not an object",
    };
    const state = sanitizeState(damaged, NOW);
    expect(state.school.first_run_done).toBe(true);
    expect(state.school.speed_bonus).toEqual({ a: false });
    expect(state.school.lessons.map((l) => l.id)).toEqual(["l-n1"]);
    expect(state.school.deleted).toEqual(["l-nizi"]);
    expect(state.school.drafts.map((d) => d.id)).toEqual(["d2"]);
    expect(state.school.sources).toHaveLength(1);
    expect(state.school.counter).toBe(0);
    expect(state.university).toEqual(emptyOverlay());
  });

  test("a lesson or a draft with a broken question is not kept", () => {
    const broken = bankQuestions(bankLesson("nizi"), "l-n1").map((q, i) => (i === 0 ? { ...q, kind: "ordering" } : q));
    expect(isLesson(lesson({ questions: broken as Lesson["questions"] }))).toBe(false);
    expect(isDraft(draft({ questions: broken as LessonDraft["questions"] }))).toBe(false);
    expect(isLesson(lesson())).toBe(true);
    expect(isDraft(draft())).toBe(true);
  });

  test("a lesson that counts more or fewer questions than it holds is not kept, nor one with a nameless file", () => {
    expect(isLesson(lesson({ question_count: 9 }))).toBe(false);
    expect(isLesson(lesson({ source: { id: "src-1", kind: "upload", file_name: "план.docx" } }))).toBe(true);
    expect(isLesson(lesson({ source: { id: "src-1", kind: "upload" } as never }))).toBe(false);
  });

  test("is read from storage, and a storage that fails or holds junk gives a fresh state", () => {
    const saved = { ...freshState(TODAY), school: { ...emptyOverlay(), counter: 9 } };
    const memory = new Map<string, string>();
    const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
    writeState(storage, saved);
    expect(memory.has(MOCK_KEY)).toBe(true);
    expect(readState(storage, NOW)).toEqual(saved);

    memory.set(MOCK_KEY, "{not json");
    expect(readState(storage, NOW)).toEqual(freshState(TODAY));
    expect(readState({ getItem: () => { throw new Error("blocked"); } }, NOW)).toEqual(freshState(TODAY));
    expect(readState(null, NOW)).toEqual(freshState(TODAY));
    expect(() => writeState({ setItem: () => { throw new Error("full"); } }, saved)).not.toThrow();
    expect(() => writeState(null, saved)).not.toThrow();
  });

  test("is saved under a versioned key", () => {
    expect(MOCK_KEY).toBe(`teacheraid-teacher-mock-v${MOCK_VERSION}`);
  });
});

describe("the teacher's own settings", () => {
  test("a save from an older build never crashes a screen: bad fields fall back, good ones stay", () => {
    expect(sanitizeTeacherState(null)).toEqual({ locale: "mk", schoolType: "school" });
    expect(sanitizeTeacherState({ locale: "en", schoolType: "university" })).toEqual({ locale: "en", schoolType: "university" });
    expect(sanitizeTeacherState({ locale: "de", schoolType: "university" })).toEqual({ locale: "mk", schoolType: "university" });
    expect(sanitizeTeacherState({ locale: "en", schoolType: 7 })).toEqual({ locale: "en", schoolType: "school" });
    expect(sanitizeTeacherState("junk")).toEqual({ locale: "mk", schoolType: "school" });
  });
});
