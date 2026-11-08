import { describe, expect, test } from "vitest";
import { checkDraft, checkLesson } from "@/lib/teacher/api/shape";
import { createMockApi, memorySource } from "@/lib/teacher/api/mock";
import { GENERATE_MS } from "@/lib/teacher/api/mock-drafts";
import { freshState } from "@/lib/teacher/api/mock-state";

/** The live adapter's check of a draft and a lesson against 11.5 (shape.ts): what the screens rely on, nothing more. */

const base = {
  id: "d-1",
  source_id: "src-1",
  source: { kind: "upload", file_name: "plan.pdf" },
  subject: { id: "sub-1", name: "Математика" },
  year: 1,
  emphasis: null,
  refinements: [],
  previous_draft_id: null,
  created_at: "2026-11-08T08:00:00Z",
  updated_at: "2026-11-08T08:00:00Z",
  consumed_at: null,
  lesson_id: null,
};
const common = { media: null, explanation: null, timer_seconds: 20, topic: "Дропки" };
const mc = { id: "q-1", order: 0, kind: "multiple_choice", prompt: "1/2 + 1/2?", options: ["1", "2"], correct: "0", ...common };
const tf = { id: "q-2", order: 1, kind: "true_false", prompt: "1/2 > 1/3", correct: "true", ...common };
const num = { id: "q-3", order: 2, kind: "numeric", prompt: "3/4 = ?", correct: "0.75", tolerance: 0, unit: null, allow_negative: false, ...common };
const ready = { ...base, status: "ready", failure: null, title: "Дропки", review_summary: "Збир на дропки.", questions: [mc, tf, num] };
const pending = { ...base, status: "pending", failure: null, title: null, review_summary: null, questions: null };
const failed = { ...pending, status: "failed", failure: "generation_failed" };

const problem = (f: () => unknown) => {
  try {
    f();
    return null;
  } catch (e) {
    return { code: (e as { code: string }).code, message: (e as Error).message };
  }
};

describe("a draft", () => {
  test("in the shape of 11.5 passes as it is, in each state", () => {
    for (const d of [ready, pending, failed]) expect(checkDraft(d)).toBe(d);
  });

  test("with a true or false answer not chosen yet passes: a draft may hold an unfinished question", () => {
    expect(problem(() => checkDraft({ ...ready, questions: [{ ...tf, correct: "" }] }))).toBeNull();
  });

  test("with extra fields passes", () => {
    expect(problem(() => checkDraft({ ...ready, tokens_used: 1234, questions: [{ ...mc, difficulty: "easy" }] }))).toBeNull();
  });

  test.each([
    ["a multiple-choice answer as a number", { ...ready, questions: [{ ...mc, correct: 0 }] }, "draft: questions[0].correct is not text"],
    ["a numeric answer as a number", { ...ready, questions: [mc, tf, { ...num, correct: 0.75 }] }, "draft: questions[2].correct is not text"],
    ["a true or false answer as a boolean", { ...ready, questions: [mc, { ...tf, correct: true }] }, "draft: questions[1].correct is not"],
    ["a question with no id", { ...ready, questions: [{ ...mc, id: undefined }] }, "draft: questions[0].id is not text"],
    ["a question with no order", { ...ready, questions: [{ ...mc, order: undefined }] }, "draft: questions[0].order is not a number"],
    ["an unknown kind", { ...ready, questions: [{ ...mc, kind: "open_text" }] }, 'draft: questions[0].kind "open_text"'],
    ["options that are not text", { ...ready, questions: [{ ...mc, options: [1, 2] }] }, "draft: questions[0].options"],
    ["the subject as an id alone", { ...ready, subject: "sub-1" }, "draft: subject is not { id, name }"],
    ["the source as a kind alone", { ...ready, source: "upload" }, "draft: source is not { kind, file_name } or null"],
    ["no questions on a ready draft", { ...ready, questions: undefined }, "draft: questions is not a list"],
    ["an unknown status", { ...ready, status: "done" }, 'draft: status "done"'],
    ["no refinements", { ...pending, refinements: undefined }, "draft: refinements is not a list"],
    ["nothing at all", null, "draft: is not an object"],
  ])("with %s is invalid_response", (_, value, message) => {
    const p = problem(() => checkDraft(value));
    expect(p?.code).toBe("invalid_response");
    expect(p?.message).toContain(message);
  });

  test("the drafts the demo makes pass, pending and ready, so the check and the app agree on the shape", async () => {
    const start = new Date(2026, 9, 29, 9, 0).getTime();
    let now = start;
    const api = createMockApi(memorySource(freshState(new Date(2026, 9, 29).getTime()), { now: () => now }), { delay: () => Promise.resolve() });
    const { source_id } = await api.createSource({ kind: "typed", text: "Равенки од втор степен и дискриминантата. Учениците треба да знаат да ги решаваат." });
    const asked = await api.generateLesson({ source_id, subject_id: "math", year: 2 });
    expect(problem(() => checkDraft(asked))).toBeNull();
    now = start + GENERATE_MS + 1;
    const written = await api.getDraft(asked.id);
    expect(written.status).toBe("ready");
    expect(problem(() => checkDraft(written))).toBeNull();
    const kinds = new Set((written.questions ?? []).map((q) => q.kind));
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe("a lesson", () => {
  const lesson = { id: "l-1", title: "Дропки", review_summary: "", subject: base.subject, questions: [mc, tf, num] };

  test("in the shape of 11.5 passes", () => {
    expect(checkLesson(lesson)).toBe(lesson);
  });

  test("with a true or false answer not chosen is invalid_response: only a draft may hold one", () => {
    expect(problem(() => checkLesson({ ...lesson, questions: [{ ...tf, correct: "" }] }))?.message).toContain("lesson: questions[0].correct");
  });

  test("every lesson of the demo school passes", async () => {
    const api = createMockApi(memorySource(freshState(new Date(2026, 9, 29).getTime())), { delay: () => Promise.resolve() });
    const lessons = await api.listLessons();
    expect(lessons.length).toBeGreaterThan(0);
    for (const { id } of lessons) {
      const read = await api.getLesson(id);
      expect(problem(() => checkLesson(read)), id).toBeNull();
    }
  });

  test("with a number for an answer is invalid_response", () => {
    expect(problem(() => checkLesson({ ...lesson, questions: [{ ...num, correct: 3 }] }))?.code).toBe("invalid_response");
  });
});
