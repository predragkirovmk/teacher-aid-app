import { beforeEach, describe, expect, test } from "vitest";
import { ApiError } from "@/lib/teacher/api/errors";
import { createMockApi, memorySource } from "@/lib/teacher/api/mock";
import { FAIL_MS, GENERATE_MS, latestUnsaved, REFINE_MS, statusOf, toWire } from "@/lib/teacher/api/mock-drafts";
import { freshState, type DemoDraft } from "@/lib/teacher/api/mock-state";
import type { TeacherApi } from "@/lib/teacher/api/client";
import type { DraftQuestion, Lesson, LessonDraft, ReadyDraft } from "@/lib/teacher/api/types";
import { DRAFT_PENDING_MAX_SECONDS, isValidContent } from "@/lib/teacher/lessons";

/**
 * Writing a lesson is a job (BR-LES-08): the draft is answered at once, pending, and whether it is ready is a matter of the clock.
 * These tests move the clock by hand, as a wait that goes on, and read the draft the way the page does.
 */

const NOW = new Date(2026, 9, 31, 9, 0).getTime();
const ANCHOR = new Date(2026, 9, 31).getTime();
const typed = "Равенки од втор степен и дискриминантата. Учениците треба да знаат да ги решаваат.";

let now = NOW;
let source: ReturnType<typeof memorySource>;
let api: TeacherApi;

beforeEach(() => {
  now = NOW;
  source = memorySource(freshState(ANCHOR), { now: () => now });
  api = createMockApi(source, { delay: () => Promise.resolve() });
});

const rejection = async (promise: Promise<unknown>): Promise<ApiError> => {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error("It did not reject");
};

const ask = async (text = typed, emphasis?: string): Promise<LessonDraft> => {
  const { source_id } = await api.createSource({ kind: "typed", text });
  return api.generateLesson({ source_id, subject_id: "math", year: 2, emphasis });
};
const ready = async (draft: LessonDraft, ms = GENERATE_MS): Promise<ReadyDraft> => {
  now += ms + 1;
  const read = await api.getDraft(draft.id);
  expect(read.status).toBe("ready");
  return read as ReadyDraft;
};
/** A draft that is ready, as the API answers when a lesson is opened for editing. */
const readyOf = (draft: LessonDraft): ReadyDraft => {
  expect(draft.status).toBe("ready");
  return draft as ReadyDraft;
};
const secondsLater = (s: number) => void (now += s * 1000);
const stored = (): DemoDraft[] => source.state().school.drafts;

describe("asking for a lesson", () => {
  test("is answered at once with the draft pending, nothing written yet, and the facts the teacher gave", async () => {
    const draft = await ask(typed, "  Повеќе примери.  ");
    expect(draft).toMatchObject({
      status: "pending",
      failure: null,
      title: null,
      review_summary: null,
      questions: null,
      subject: { id: "math", name: "Математика" },
      year: 2,
      emphasis: "Повеќе примери.",
      refinements: [],
      previous_draft_id: null,
      consumed_at: null,
      lesson_id: null,
      source: { kind: "typed", file_name: null },
    });
    expect(draft.id).toMatch(/^d\d+$/);
    expect(draft.created_at).toBe(new Date(NOW).toISOString());
    expect(draft.updated_at).toBe(draft.created_at);
  });

  test("a document draft knows it came from a document, by name", async () => {
    const { source_id } = await api.createSource({ kind: "upload", file: { name: "Логаритми.docx", size: 900, type: "" } as File });
    const draft = await api.generateLesson({ source_id, subject_id: "math", year: 3 });
    expect(draft.source).toEqual({ kind: "upload", file_name: "Логаритми.docx" });
    expect(draft.source_id).toBe(source_id);
  });

  test("is pending for the whole of the believable 8 seconds, and ready when they are over", async () => {
    expect(GENERATE_MS).toBe(8000);
    const draft = await ask();
    for (const s of [0, 2, 4, 7.9]) {
      now = NOW + s * 1000;
      expect((await api.getDraft(draft.id)).status).toBe("pending");
    }
    now = NOW + GENERATE_MS;
    const read = await api.getDraft(draft.id);
    expect(read.status).toBe("ready");
    expect(isValidContent(read)).toBe(true);
    expect(read.failure).toBeNull();
  });

  test("a reload finds the job where the clock has put it, because nothing waits in a page", async () => {
    const draft = await ask();
    const other = createMockApi(source);
    now += 5000;
    expect((await other.getDraft(draft.id)).status).toBe("pending");
    now += 4000;
    expect((await other.getDraft(draft.id)).status).toBe("ready");
  });

  test("a draft of the teacher's other demo school, or another teacher, is not found", async () => {
    const draft = await ask();
    source.setSchoolType("university");
    expect((await rejection(api.getDraft(draft.id))).code).toBe("not_found");
    source.setSchoolType("school");
    source.setSession("novice");
    expect((await rejection(api.getDraft(draft.id))).code).toBe("not_found");
  });

  test("a second request for a source that is being written answers that draft and starts nothing (BR-LES-10)", async () => {
    const { source_id } = await api.createSource({ kind: "typed", text: typed });
    const request = { source_id, subject_id: "math", year: 2 };
    const first = await api.generateLesson(request);
    secondsLater(1);
    const second = await api.generateLesson(request);
    expect(second.id).toBe(first.id);
    expect(stored()).toHaveLength(1);
    // Once it is ready, a request is a new generation.
    await ready(first);
    expect((await api.generateLesson(request)).id).not.toBe(first.id);
  });
});

describe("a job that does not work", () => {
  test("[fail] is an AI that cannot: pending for a while, then failed, with no questions and generation_failed", async () => {
    const draft = await ask(`${typed} [fail]`);
    secondsLater(FAIL_MS / 1000 - 1);
    expect((await api.getDraft(draft.id)).status).toBe("pending");
    secondsLater(2);
    expect(await api.getDraft(draft.id)).toMatchObject({ status: "failed", failure: "generation_failed", title: null, review_summary: null, questions: null });
  });

  test("it fails in the emphasis too", async () => {
    const draft = await ask(typed, "[fail]");
    secondsLater(FAIL_MS / 1000 + 1);
    expect((await api.getDraft(draft.id)).status).toBe("failed");
  });

  test("[fail-once] fails the first time for a source and works after a retry, and works for the next draft of it", async () => {
    const { source_id } = await api.createSource({ kind: "typed", text: `${typed} [fail-once]` });
    const request = { source_id, subject_id: "math", year: 2 };
    const draft = await api.generateLesson(request);
    secondsLater(FAIL_MS / 1000 + 1);
    expect((await api.getDraft(draft.id)).status).toBe("failed");

    const retried = await api.retryDraft(draft.id);
    expect(retried).toMatchObject({ id: draft.id, status: "pending", failure: null });
    await ready(retried);
    // Another generation from the same source works at once too.
    const again = await api.generateLesson(request);
    secondsLater(GENERATE_MS / 1000 + 1);
    expect((await api.getDraft(again.id)).status).toBe("ready");
    // Another source starts over.
    const other = await ask(`${typed} [fail-once]`);
    secondsLater(FAIL_MS / 1000 + 1);
    expect((await api.getDraft(other.id)).status).toBe("failed");
  });

  test("[slow] never answers: pending until the limit of 180 seconds, and then failed (BR-LES-09)", async () => {
    expect(DRAFT_PENDING_MAX_SECONDS).toBe(180);
    const draft = await ask(`${typed} [slow]`);
    for (const s of [10, 60, 120, 179]) {
      now = NOW + s * 1000;
      expect((await api.getDraft(draft.id)).status).toBe("pending");
    }
    now = NOW + 180 * 1000;
    expect(await api.getDraft(draft.id)).toMatchObject({ status: "failed", failure: "generation_failed", questions: null });
  });

  test("[stuck] never answers and is never failed: a server that broke BR-LES-09, for the page's own limit", async () => {
    const draft = await ask(`${typed} [stuck]`);
    for (const s of [10, 180, 240, 3600]) {
      now = NOW + s * 1000;
      expect((await api.getDraft(draft.id)).status).toBe("pending");
    }
  });

  test("a retry counts the limit from the retry, not from the first request", async () => {
    const draft = await ask(`${typed} [slow]`);
    secondsLater(181);
    expect((await api.getDraft(draft.id)).status).toBe("failed");
    const retried = await api.retryDraft(draft.id);
    expect(retried.status).toBe("pending");
    secondsLater(100);
    expect((await api.getDraft(draft.id)).status).toBe("pending");
    secondsLater(81);
    expect((await api.getDraft(draft.id)).status).toBe("failed");
  });

  test("a result that comes after the limit is thrown away", () => {
    const late: DemoDraft = {
      ...({} as DemoDraft),
      job: { started_at: new Date(NOW).toISOString(), done_at: new Date(NOW + 200_000).toISOString(), outcome: "ready" },
    };
    expect(statusOf(late, NOW + 100_000)).toBe("pending");
    expect(statusOf(late, NOW + 250_000)).toBe("failed");
  });

  test("retrying a draft that is pending answers it and starts nothing; retrying one that is ready is not allowed", async () => {
    const draft = await ask(`${typed} [slow]`);
    expect((await api.retryDraft(draft.id)).status).toBe("pending");
    const good = await ask();
    await ready(good);
    expect((await rejection(api.retryDraft(good.id))).code).toBe("invalid_state");
    expect((await rejection(api.retryDraft("d-none"))).code).toBe("not_found");
  });
});

describe("cancelling and throwing away", () => {
  test("a draft that is cancelled is gone: not found, not listed, and its source is kept", async () => {
    const draft = await ask();
    await api.deleteDraft(draft.id);
    expect((await rejection(api.getDraft(draft.id))).code).toBe("not_found");
    expect(await api.listDrafts()).toEqual([]);
    expect(source.state().school.sources).toHaveLength(1);
    // Cancelled while pending, it does not turn up when the job would have finished.
    secondsLater(30);
    expect(await api.listDrafts()).toEqual([]);
    expect((await rejection(api.deleteDraft(draft.id))).code).toBe("not_found");
  });

  test("a saved draft cannot be thrown away", async () => {
    const draft = await ready(await ask());
    await api.saveLesson({ draft_id: draft.id, title: draft.title, review_summary: draft.review_summary, questions: draft.questions as Lesson["questions"] });
    expect((await rejection(api.deleteDraft(draft.id))).code).toBe("invalid_state");
  });
});

describe("the list of drafts (FR-LES-20)", () => {
  test("holds the unsaved drafts, pending and failed too, newest first, with what Today needs", async () => {
    const first = await ask();
    secondsLater(1);
    const failing = await ask(`${typed} [fail]`);
    secondsLater(1);
    const third = await ask("Логаритми и нивните својства, за третата година со задачи.");
    secondsLater(GENERATE_MS / 1000);
    const list = await api.listDrafts();
    expect(list.map((d) => d.id)).toEqual([third.id, failing.id, first.id]);
    expect(list.map((d) => d.status)).toEqual(["ready", "failed", "ready"]);
    expect(list[0]).toMatchObject({ title: "Логаритми", question_count: expect.any(Number), subject: { id: "math" }, year: 2, lesson_id: null, previous_draft_id: null });
    expect(list[1]).toMatchObject({ status: "failed", failure: "generation_failed", title: null, question_count: null });
  });

  test("shows a pending draft as pending, with no title and no count", async () => {
    await ask();
    expect(await api.listDrafts()).toMatchObject([{ status: "pending", failure: null, title: null, question_count: null }]);
  });

  test("lists only the latest draft of a chain, and throwing it away makes the one before it the latest (EC-LES-15)", async () => {
    const a = await ready(await ask());
    const b = await ready(await api.refineDraft(a.id, "easier"), REFINE_MS);
    const c = await ask("Логаритми и нивните својства, за третата година со задачи.");
    secondsLater(GENERATE_MS / 1000 + 1);
    expect((await api.listDrafts()).map((d) => d.id)).toEqual([c.id, b.id]);
    expect((await api.listDrafts()).find((d) => d.id === b.id)).toMatchObject({ previous_draft_id: a.id, refinements: ["easier"] });
    await api.deleteDraft(b.id);
    expect((await api.listDrafts()).map((d) => d.id)).toEqual([c.id, a.id]);
  });

  test("a draft that was saved is no longer listed, nor the ones before it in its chain", async () => {
    const a = await ready(await ask());
    const b = await ready(await api.refineDraft(a.id, "harder"), REFINE_MS);
    await api.saveLesson({ draft_id: b.id, title: b.title, review_summary: b.review_summary, questions: b.questions as Lesson["questions"] });
    expect(await api.listDrafts()).toEqual([]);
    // The saved one stays readable and leads to its lesson (BR-LES-08).
    expect(await api.getDraft(b.id)).toMatchObject({ consumed_at: expect.any(String), lesson_id: expect.stringMatching(/^l-n/) });
  });

  test("is the teacher's own and the demo school's own", async () => {
    await ask();
    source.setSchoolType("university");
    expect(await api.listDrafts()).toEqual([]);
    source.setSchoolType("school");
    source.setSession("novice");
    expect(await api.listDrafts()).toEqual([]);
  });

  test("the latest of a chain is worked out from the drafts that are held", () => {
    const base = { consumed_at: null, created_at: "2026-10-31T09:00:00.000Z" } as DemoDraft;
    const drafts = [
      { ...base, id: "d1", previous_draft_id: null },
      { ...base, id: "d2", previous_draft_id: "d1", created_at: "2026-10-31T09:05:00.000Z" },
      { ...base, id: "d3", previous_draft_id: "d2", created_at: "2026-10-31T09:10:00.000Z" },
      { ...base, id: "d4", previous_draft_id: null, created_at: "2026-10-31T09:20:00.000Z" },
      { ...base, id: "d5", previous_draft_id: null, consumed_at: "2026-10-31T09:30:00.000Z" },
    ];
    expect(latestUnsaved(drafts).map((d) => d.id)).toEqual(["d4", "d3"]);
  });
});

describe("editing a draft", () => {
  test("only a draft that is ready can be edited", async () => {
    const pending = await ask();
    expect((await rejection(api.updateDraft(pending.id, { title: "Х" }))).code).toBe("invalid_state");
    const failed = await ask(`${typed} [fail]`);
    secondsLater(FAIL_MS / 1000 + 1);
    expect((await rejection(api.updateDraft(failed.id, { title: "Х" }))).code).toBe("invalid_state");
    expect((await rejection(api.updateDraft("d-none", { title: "Х" }))).code).toBe("not_found");
  });

  test("changes only what is sent, keeps it for a reload, and notes when", async () => {
    const draft = await ready(await ask());
    secondsLater(30);
    const edited = await api.updateDraft(draft.id, { title: "Мој наслов" });
    expect(edited).toMatchObject({ status: "ready", title: "Мој наслов", review_summary: draft.review_summary, questions: draft.questions });
    expect(edited.updated_at).toBe(new Date(now).toISOString());
    expect(edited.created_at).toBe(draft.created_at);
    expect(await createMockApi(source).getDraft(draft.id)).toEqual(edited);
  });

  test("holds a lesson that is not finished: an empty prompt, a blank answer, no right answer, a timer out of range", async () => {
    const draft = await ready(await ask());
    const unfinished = draft.questions.map((q, i) => (i === 0 ? { ...q, prompt: "", timer_seconds: 3 } : q)) as DraftQuestion[];
    unfinished[1] = { ...unfinished[1], kind: "true_false", correct: "" } as DraftQuestion;
    const edited = await api.updateDraft(draft.id, { title: "", questions: unfinished });
    expect(edited).toMatchObject({ title: "", status: "ready" });
    expect(edited.questions![0]).toMatchObject({ prompt: "", timer_seconds: 3 });
    // It is refused as a lesson, not as a draft.
    expect((await rejection(api.saveLesson({ draft_id: draft.id, title: "Х", review_summary: "", questions: unfinished as Lesson["questions"] }))).code).toBe("validation_failed");
  });

  test("refuses what is not the shape of a draft: unknown fields, more than eight questions, a repeated id, a question of a kind that is not", async () => {
    const draft = await ready(await ask());
    const q = draft.questions[0];
    expect((await rejection(api.updateDraft(draft.id, { year: 3 } as never))).code).toBe("validation_failed");
    expect((await rejection(api.updateDraft(draft.id, { title: 3 } as never))).code).toBe("validation_failed");
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...q, id: `x${i}` }));
    expect((await rejection(api.updateDraft(draft.id, { questions: nine }))).code).toBe("validation_failed");
    expect((await rejection(api.updateDraft(draft.id, { questions: [q, q] }))).code).toBe("validation_failed");
    expect((await rejection(api.updateDraft(draft.id, { questions: [{ ...q, kind: "ordering" } as never] }))).code).toBe("validation_failed");
    expect((await rejection(api.updateDraft(draft.id, { questions: "none" as never }))).code).toBe("validation_failed");
  });

  test("a saved draft is the lesson's now and cannot be edited", async () => {
    const draft = await ready(await ask());
    await api.saveLesson({ draft_id: draft.id, title: draft.title, review_summary: draft.review_summary, questions: draft.questions as Lesson["questions"] });
    expect((await rejection(api.updateDraft(draft.id, { title: "Х" }))).code).toBe("invalid_state");
  });
});

describe("refining is a job too (FR-LES-15)", () => {
  test("answers a new draft at once, pending, made from this one, and the earlier one is left as it was", async () => {
    const draft = await ready(await ask());
    const refined = await api.refineDraft(draft.id, "easier");
    expect(refined).toMatchObject({ status: "pending", previous_draft_id: draft.id, refinements: ["easier"], questions: null, source_id: draft.source_id, year: draft.year });
    expect(refined.id).not.toBe(draft.id);
    expect(await api.getDraft(draft.id)).toEqual(draft);
    secondsLater(REFINE_MS / 1000 - 1);
    expect((await api.getDraft(refined.id)).status).toBe("pending");
    secondsLater(2);
    expect((await api.getDraft(refined.id)).status).toBe("ready");
  });

  test("refines what the teacher has made of the draft, not what was written first", async () => {
    const draft = await ready(await ask());
    const edited = draft.questions.map((q, i) => (i === 0 ? { ...q, prompt: "Моето прашање?" } : q));
    await api.updateDraft(draft.id, { title: "Мој наслов", review_summary: "Мое резиме.", questions: edited });
    const refined = await ready(await api.refineDraft(draft.id, "shorter_timers"), REFINE_MS);
    expect(refined.title).toBe("Мој наслов");
    expect(refined.review_summary).toBe("Мое резиме.");
    expect(refined.questions[0].prompt).toBe("Моето прашање?");
    expect(refined.questions[0].timer_seconds).toBeLessThan(edited[0].timer_seconds);
  });

  test("a second request while one is being written answers the one being written (BR-LES-10)", async () => {
    const draft = await ready(await ask());
    const first = await api.refineDraft(draft.id, "easier");
    const second = await api.refineDraft(draft.id, "harder");
    expect(second.id).toBe(first.id);
    expect(second.refinements).toEqual(["easier"]);
    expect(stored()).toHaveLength(2);
  });

  test("a failed draft is retried, not refined; one that is being written is answered", async () => {
    const failed = await ask(`${typed} [fail]`);
    secondsLater(FAIL_MS / 1000 + 1);
    expect((await rejection(api.refineDraft(failed.id, "easier"))).code).toBe("invalid_state");
    const pending = await ask("Логаритми и нивните својства, за третата година со задачи.");
    expect((await api.refineDraft(pending.id, "easier")).id).toBe(pending.id);
  });

  test("going back is throwing the new draft away: the earlier one is the latest again and as it was", async () => {
    const draft = await ready(await ask());
    const refined = await ready(await api.refineDraft(draft.id, "harder"), REFINE_MS);
    expect((await api.listDrafts()).map((d) => d.id)).toEqual([refined.id]);
    await api.deleteDraft(refined.id);
    expect((await api.listDrafts()).map((d) => d.id)).toEqual([draft.id]);
    expect(await api.getDraft(draft.id)).toEqual(draft);
  });

  test("the chain goes on: a refinement of a refinement lists all it applied", async () => {
    const a = await ready(await ask());
    const b = await ready(await api.refineDraft(a.id, "easier"), REFINE_MS);
    const c = await ready(await api.refineDraft(b.id, "shorter_timers"), REFINE_MS);
    expect(c.refinements).toEqual(["easier", "shorter_timers"]);
    expect(c.previous_draft_id).toBe(b.id);
  });
});

describe("editing a lesson that is saved", () => {
  const save = async () => {
    const draft = await ready(await ask());
    return api.saveLesson({ draft_id: draft.id, title: draft.title, review_summary: draft.review_summary, questions: draft.questions as Lesson["questions"] });
  };

  test("makes a draft of the lesson, ready at once, that carries the lesson and its content", async () => {
    const lesson = await save();
    const draft = readyOf(await api.startEditing(lesson.id));
    expect(draft).toMatchObject({
      status: "ready",
      lesson_id: lesson.id,
      consumed_at: null,
      previous_draft_id: null,
      title: lesson.title,
      review_summary: lesson.review_summary,
      subject: lesson.subject,
      year: lesson.year,
    });
    expect(draft.questions).toEqual(lesson.questions);
    expect((await api.listDrafts()).map((d) => [d.id, d.lesson_id])).toEqual([[draft.id, lesson.id]]);
  });

  test("asking again for a lesson that is open for editing gives the same draft, so edits are never split in two", async () => {
    const lesson = await save();
    const first = readyOf(await api.startEditing(lesson.id));
    await api.updateDraft(first.id, { title: "Променет" });
    const again = readyOf(await api.startEditing(lesson.id));
    expect(again.id).toBe(first.id);
    expect(again.title).toBe("Променет");
    expect(stored().filter((d) => d.lesson_id === lesson.id && d.consumed_at === null)).toHaveLength(1);
  });

  test("a lesson of the library, or of nobody, is not found", async () => {
    const [item] = await api.listLibrary();
    expect((await rejection(api.startEditing(item.lesson_id))).code).toBe("not_found");
    expect((await rejection(api.startEditing("l-none"))).code).toBe("not_found");
  });

  test("saving it is a new version of the same lesson, and it consumes the draft", async () => {
    const lesson = await save();
    const draft = readyOf(await api.startEditing(lesson.id));
    const edited = draft.questions.map((q, i) => (i === 0 ? { ...q, prompt: "Ново прашање?" } : q));
    const saved = await api.updateLesson(lesson.id, { title: "Нов наслов", review_summary: draft.review_summary, questions: edited as Lesson["questions"], draft_id: draft.id });
    expect(saved).toMatchObject({ id: lesson.id, version: 2, title: "Нов наслов" });
    expect(saved.questions[0].prompt).toBe("Ново прашање?");
    expect(await api.getDraft(draft.id)).toMatchObject({ consumed_at: expect.any(String), lesson_id: lesson.id });
    expect(await api.listDrafts()).toEqual([]);
    // The next time is a new draft, of the new version.
    const next = readyOf(await api.startEditing(lesson.id));
    expect(next.id).not.toBe(draft.id);
    expect(next.title).toBe("Нов наслов");
  });

  test("an edit draft is not saved as a new lesson, and a draft of another lesson is not this lesson's", async () => {
    const lesson = await save();
    const draft = readyOf(await api.startEditing(lesson.id));
    expect((await rejection(api.saveLesson({ draft_id: draft.id, title: draft.title, review_summary: draft.review_summary, questions: draft.questions as Lesson["questions"] }))).code).toBe("invalid_state");
    const other = (await api.listLessons()).find((l) => l.id !== lesson.id)!;
    const content = await api.getLesson(other.id);
    expect((await rejection(api.updateLesson(other.id, { ...content, draft_id: draft.id }))).code).toBe("invalid_state");
    expect((await rejection(api.updateLesson(lesson.id, { title: draft.title, review_summary: "", questions: draft.questions as Lesson["questions"], draft_id: "d-none" }))).code).toBe("not_found");
  });

  test("an edit draft can be refined, and the refinement is of the same lesson", async () => {
    const lesson = await save();
    const draft = readyOf(await api.startEditing(lesson.id));
    const refined = await ready(await api.refineDraft(draft.id, "easier"), REFINE_MS);
    expect(refined).toMatchObject({ lesson_id: lesson.id, previous_draft_id: draft.id });
    const saved = await api.updateLesson(lesson.id, { title: refined.title, review_summary: refined.review_summary, questions: refined.questions as Lesson["questions"], draft_id: refined.id });
    expect(saved.version).toBe(2);
  });
});

describe("saving a draft as a lesson", () => {
  test("only when it is ready and not saved before", async () => {
    const pending = await ask();
    expect((await rejection(api.saveLesson({ draft_id: pending.id, title: "Х", review_summary: "", questions: [] }))).code).toBe("invalid_state");
    expect((await rejection(api.saveLesson({ draft_id: "d-none", title: "Х", review_summary: "", questions: [] }))).code).toBe("not_found");
  });

  test("wire shape of a draft carries nothing that is not in the spec's list but the proposed fields", async () => {
    const draft = await ready(await ask());
    expect(Object.keys(draft).sort()).toEqual(
      ["consumed_at", "created_at", "emphasis", "failure", "id", "lesson_id", "previous_draft_id", "questions", "refinements", "review_summary", "source", "source_id", "status", "subject", "title", "updated_at", "year"].sort(),
    );
    const demo = stored()[0];
    expect(toWire(demo, now)).toEqual(draft);
  });
});
