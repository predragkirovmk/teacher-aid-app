import { describe, expect, test } from "vitest";
import { sanitizeTeacherState } from "@/lib/teacher/store";
import { emptyOverlay, freshState, isDemoDraft, isLesson, MOCK_KEY, MOCK_VERSION, overlayOf, readState, sanitizeState, startOfDay, withOverlay, writeState } from "@/lib/teacher/api/mock-state";
import { bankLesson, bankQuestions } from "@/lib/teacher/api/mock-bank";
import type { Lesson } from "@/lib/teacher/api/types";
import type { DemoDraft } from "@/lib/teacher/api/mock-state";

const NOW = new Date(2026, 9, 29, 14, 30).getTime();
const TODAY = startOfDay(NOW);

const lesson = (patch: Partial<Lesson> = {}): Lesson => {
  const bank = bankLesson("nizi");
  const questions = bankQuestions(bank, "l-n1");
  return {
    id: "l-n1",
    last_session_id: null,
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

const draft = (patch: Partial<DemoDraft> = {}): DemoDraft => {
  const bank = bankLesson("nizi");
  return {
    id: "d2",
    source_id: "src-n1",
    source: { kind: "typed", file_name: null },
    subject: { id: "math", name: "Математика" },
    year: 3,
    emphasis: null,
    refinements: [],
    previous_draft_id: null,
    created_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    consumed_at: null,
    lesson_id: null,
    job: { started_at: new Date(NOW).toISOString(), done_at: new Date(NOW + 8000).toISOString(), outcome: "ready" },
    content: { title: bank.title, review_summary: bank.summary, questions: bankQuestions(bank, "d2") },
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
        sources: [{ id: "src-n1", kind: "typed", file_name: null, text: "текст", runs: 2 }, { id: "src-n0", kind: "typed", file_name: null, text: "стар" }, { id: 7 }],
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
    // A source saved before jobs counted their runs has had none.
    expect(state.school.sources).toEqual([{ id: "src-n1", kind: "typed", file_name: null, text: "текст", runs: 2 }, { id: "src-n0", kind: "typed", file_name: null, text: "стар", runs: 0 }]);
    expect(state.school.counter).toBe(0);
    expect(state.university).toEqual(emptyOverlay());
  });

  test("a lesson or a draft with a broken question is not kept", () => {
    const broken = bankQuestions(bankLesson("nizi"), "l-n1").map((q, i) => (i === 0 ? { ...q, kind: "ordering" } : q));
    expect(isLesson(lesson({ questions: broken as Lesson["questions"] }))).toBe(false);
    expect(isDemoDraft(draft({ content: { ...draft().content, questions: broken as DemoDraft["content"]["questions"] } }))).toBe(false);
    expect(isLesson(lesson())).toBe(true);
    expect(isDemoDraft(draft())).toBe(true);
  });

  test("a draft is kept with its job and what the teacher has made of it, even unfinished; one from an older build is not", () => {
    const unfinished = bankQuestions(bankLesson("nizi"), "d2").map((q, i) => (i === 0 ? { ...q, prompt: "", correct: q.kind === "true_false" ? "" : q.correct } : q));
    expect(isDemoDraft(draft({ content: { ...draft().content, questions: unfinished as DemoDraft["content"]["questions"] } }))).toBe(true);
    expect(isDemoDraft(draft({ job: null }))).toBe(true);
    expect(isDemoDraft(draft({ job: { started_at: "yesterday", done_at: null, outcome: "ready" } }))).toBe(false);
    expect(isDemoDraft(draft({ job: { started_at: new Date(NOW).toISOString(), done_at: null, outcome: "weird" as never } }))).toBe(false);
    expect(isDemoDraft(draft({ source_id: undefined as never }))).toBe(false);
    // The shape the first version of the mock saved had no status, no job and its questions at the top.
    expect(isDemoDraft({ id: "d1", source_id: "src-n1", subject: { id: "math", name: "Математика" }, year: 2, emphasis: null, refinements: [], created_at: "2026-10-29T08:00:00.000Z", title: "Т", review_summary: "", questions: [] })).toBe(false);
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
    expect(sanitizeTeacherState(null)).toEqual({ locale: "mk", schoolType: "school", schoolSeen: false });
    expect(sanitizeTeacherState({ locale: "en", schoolType: "university" })).toEqual({ locale: "en", schoolType: "university", schoolSeen: false });
    expect(sanitizeTeacherState({ locale: "de", schoolType: "university" })).toEqual({ locale: "mk", schoolType: "university", schoolSeen: false });
    expect(sanitizeTeacherState({ locale: "en", schoolType: 7 })).toEqual({ locale: "en", schoolType: "school", schoolSeen: false });
  });

  test("the type of institution counts as known only once it was learned, and only if it is a real one", () => {
    expect(sanitizeTeacherState({ locale: "mk", schoolType: "university", schoolSeen: true }).schoolSeen).toBe(true);
    expect(sanitizeTeacherState({ locale: "mk", schoolType: "university", schoolSeen: "yes" }).schoolSeen).toBe(false);
    expect(sanitizeTeacherState({ locale: "mk", schoolType: "ministry", schoolSeen: true }).schoolSeen).toBe(false);
    expect(sanitizeTeacherState("junk")).toEqual({ locale: "mk", schoolType: "school", schoolSeen: false });
  });
});

describe("the new teacher's own save", () => {
  test("starts with the first run not done, and the teacher with history with it done", () => {
    expect(emptyOverlay().first_run_done).toBe(true);
    expect(emptyOverlay("veteran").first_run_done).toBe(true);
    expect(emptyOverlay("novice").first_run_done).toBe(false);
    const fresh = freshState(TODAY);
    expect(fresh.novice.school.first_run_done).toBe(false);
    expect(fresh.novice.university.first_run_done).toBe(false);
  });

  test("keeps each teacher's overlay apart, in each school", () => {
    const base = freshState(TODAY);
    const changed = withOverlay(base, "school", { ...emptyOverlay("novice"), counter: 4, first_run_done: true }, "novice");
    expect(overlayOf(changed, "school", "novice").counter).toBe(4);
    expect(overlayOf(changed, "school", "veteran").counter).toBe(0);
    expect(overlayOf(changed, "university", "novice").counter).toBe(0);
    expect(overlayOf(changed, "school").first_run_done).toBe(true);
    const other = withOverlay(base, "university", { ...emptyOverlay(), counter: 9 });
    expect(overlayOf(other, "university").counter).toBe(9);
    expect(overlayOf(other, "university", "novice").counter).toBe(0);
  });

  test("a save from before there was a new teacher is still a good save: the new teacher starts fresh", () => {
    const old = { v: MOCK_VERSION, anchor: TODAY, school: { ...emptyOverlay(), counter: 3 }, university: emptyOverlay() };
    const state = sanitizeState(old, NOW);
    expect(state.school.counter).toBe(3);
    expect(state.novice.school).toEqual(emptyOverlay("novice"));
    expect(state.novice.school.first_run_done).toBe(false);
  });

  test("a damaged save of the new teacher keeps what is good and falls back to a first run for the rest", () => {
    const saved = { ...freshState(TODAY), novice: { school: { first_run_done: "yes", counter: 2, speed_bonus: { a: true } }, university: "junk" } };
    const state = sanitizeState(saved, NOW);
    expect(state.novice.school.first_run_done).toBe(false);
    expect(state.novice.school.counter).toBe(2);
    expect(state.novice.school.speed_bonus).toEqual({ a: true });
    expect(state.novice.university).toEqual(emptyOverlay("novice"));
    expect(sanitizeState({ ...freshState(TODAY), novice: 7 }, NOW).novice).toEqual(freshState(TODAY).novice);
  });

  test("a finished first run survives a save and a read", () => {
    const state = withOverlay(freshState(TODAY), "school", { ...emptyOverlay("novice"), first_run_done: true }, "novice");
    const map = new Map<string, string>();
    writeState({ setItem: (k, v) => void map.set(k, v) }, state);
    const read = readState({ getItem: (k) => map.get(k) ?? null }, NOW);
    expect(read.novice.school.first_run_done).toBe(true);
    expect(read.novice.university.first_run_done).toBe(false);
    expect(read.school.first_run_done).toBe(true);
  });
});
