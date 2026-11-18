import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/teacher/api/errors";
import { createMock, createMockApi, MEDIA_MS, memorySource, SOURCE_MS } from "@/lib/teacher/api/mock";
import { GENERATE_MS, REFINE_MS } from "@/lib/teacher/api/mock-drafts";
import { freshState } from "@/lib/teacher/api/mock-state";
import type { TeacherApi } from "@/lib/teacher/api/client";
import type { Lesson, LessonDraft, QuestionKind, ReadyDraft } from "@/lib/teacher/api/types";
import { isValidContent } from "@/lib/teacher/lessons";
import type { ImageEnv } from "@/lib/teacher/images";

const NOW = new Date(2026, 9, 29, 9, 0).getTime();
const ANCHOR = new Date(2026, 9, 29).getTime();

let source: ReturnType<typeof memorySource>;
let api: TeacherApi;
/** The mock's clock, which a test moves to let a draft be written. */
let now = NOW;
const build = () => createMockApi(source, { delay: () => Promise.resolve() });

beforeEach(() => {
  now = NOW;
  source = memorySource(freshState(ANCHOR), { now: () => now });
  api = build();
});

/** What a call rejected with. */
const rejection = async (promise: Promise<unknown>): Promise<ApiError> => {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error("It did not reject");
};

const typed = "Равенки од втор степен и дискриминантата. Учениците треба да знаат да ги решаваат.";
const file = (name: string, size = 1000) => ({ name, size, type: "" }) as File;

/** Asks for a lesson: the draft, pending, as the API answers at once. */
async function askDraft(text = typed, emphasis?: string): Promise<LessonDraft> {
  const { source_id } = await api.createSource({ kind: "typed", text });
  return api.generateLesson({ source_id, emphasis });
}

/** A draft that has been written: the clock is moved past the job, as a wait that is over. */
const finished = async (draft: LessonDraft, ms = GENERATE_MS): Promise<ReadyDraft> => {
  now += ms + 1;
  const read = await api.getDraft(draft.id);
  if (read.status !== "ready") throw new Error(`The draft is ${read.status}`);
  return read;
};

async function makeDraft(text = typed, emphasis?: string): Promise<ReadyDraft> {
  return finished(await askDraft(text, emphasis));
}

const saveRequest = (draft: ReadyDraft) => ({
  draft_id: draft.id,
  title: draft.title,
  questions: draft.questions as Lesson["questions"],
});

describe("who and what", () => {
  test("the teacher is Марија Петровска at a gymnasium, with no courses, classes or subjects in the API", async () => {
    const me = await api.getMe();
    expect(me).toMatchObject({ name: "Марија Петровска", role: "teacher", first_run_done: true, school: { type: "gymnasium" } });
    for (const gone of ["listCourses", "getDashboard", "updateCourse", "markNoDevice", "clearNoDevice"]) expect(api).not.toHaveProperty(gone);
  });

  test("the demo switch serves the faculty: the same teacher as a professor", async () => {
    source.setSchoolType("university");
    const me = await api.getMe();
    expect(me.name).toBe("Марија Петровска");
    expect(me.school.type).toBe("faculty");
  });

  test("tells whoever is listening that the school changed", () => {
    let heard = 0;
    const stop = api.subscribe(() => heard++);
    source.setSchoolType("university");
    stop();
    source.setSchoolType("school");
    expect(heard).toBe(1);
  });

  test("answers a read at once, as a settled promise", () => {
    const answer = api.getMe() as unknown as { settled?: { ok: boolean } };
    expect(answer.settled?.ok).toBe(true);
  });

  test("the teacher with history has nothing to finish: the first run is done, and marking it again changes nothing", async () => {
    expect((await api.getMe()).first_run_done).toBe(true);
    expect((await api.setFirstRunDone()).first_run_done).toBe(true);
  });
});

describe("the held lessons", () => {
  test("a lesson that was run says how often and when, and leads to the latest of its sessions, which is a finished one", async () => {
    const held = (await api.listLessons()).filter((l) => l.times_run > 0);
    expect(held.length).toBeGreaterThan(5);
    for (const l of held) {
      expect(l.last_run_at).toBeTruthy();
      expect(l.last_session_id).toBeTruthy();
      const review = await api.getReview(l.last_session_id!);
      expect(review.session).toMatchObject({ state: "ended", lesson: { id: l.id } });
      expect(Date.parse(review.session.ended_at!)).toBe(Date.parse(l.last_run_at!));
    }
  });

  test("a finished lesson lists only the students who were there, each with a score, and no session or summary carries a course, a class or a subject", async () => {
    const held = (await api.listLessons()).find((l) => l.times_run > 2)!;
    const review = await api.getReview(held.last_session_id!);
    expect(review.students.length).toBeGreaterThan(10);
    expect(review.students.every((s) => s.full_name && s.asked >= 0 && s.correct >= 0 && s.correct <= s.asked)).toBe(true);
    expect(JSON.stringify(review)).not.toMatch(/course|class_name|subject|"year"|attendance|most_missed|practice/);
  });

});

describe("lessons", () => {
  test("two are prepared and not run, and the rest have been run", async () => {
    const lessons = await api.listLessons();
    const prepared = lessons.filter((l) => l.times_run === 0);
    expect(prepared).toHaveLength(2);
    expect(prepared.every((l) => l.last_run_at === null && l.question_count >= 5)).toBe(true);
    const run = lessons.filter((l) => l.times_run > 0);
    expect(run.reduce((n, l) => n + l.times_run, 0)).toBe(22);
    expect(run.every((l) => l.last_run_at)).toBe(true);
  });

  test("a lesson comes whole, with 5 to 8 questions of all three kinds", async () => {
    const [prepared] = (await api.listLessons()).filter((l) => l.times_run === 0);
    const lesson = await api.getLesson(prepared.id);
    expect(isValidContent(lesson)).toBe(true);
    const kinds = new Set<QuestionKind>(lesson.questions.map((q) => q.kind));
    expect(kinds.size).toBe(3);
    expect((await rejection(api.getLesson("nope"))).code).toBe("not_found");
  });
});

describe("making a lesson", () => {
  test("typed sentences are taken, and a text that is too short or too long is refused with a reason", async () => {
    expect((await api.createSource({ kind: "typed", text: typed })).source_id).toMatch(/^src-/);
    const error = await rejection(api.createSource({ kind: "typed", text: "Кратко." }));
    expect(error.code).toBe("validation_failed");
    expect(error.reason).toBe("text_too_short");
    // Counted after the spaces at both ends are cut (BR-LES-06, BR-LES-14): 39 is short, 40 is enough, 20 000 is taken, 20 001 is not.
    expect((await rejection(api.createSource({ kind: "typed", text: `  ${"а".repeat(39)}  ` }))).reason).toBe("text_too_short");
    expect((await api.createSource({ kind: "typed", text: ` ${"а".repeat(40)} ` })).source_id).toBeTruthy();
    expect((await api.createSource({ kind: "typed", text: "а".repeat(20_000) })).source_id).toBeTruthy();
    expect((await rejection(api.createSource({ kind: "typed", text: "а".repeat(20_001) }))).reason).toBe("text_too_long");
    expect((await api.createSource({ kind: "typed", text: ` ${"а".repeat(20_000)} ` })).source_id).toBeTruthy();
  });

  test("only a PDF or a Word document under 20 MB, with text in it, is taken (BR-LES-05)", async () => {
    expect((await api.createSource({ kind: "upload", file: file("план.pdf") })).source_id).toBeTruthy();
    expect((await api.createSource({ kind: "upload", file: file("План.DOCX") })).source_id).toBeTruthy();
    expect((await rejection(api.createSource({ kind: "upload", file: file("план.doc") }))).reason).toBe("file_type");
    expect((await rejection(api.createSource({ kind: "upload", file: file("слика.png") }))).reason).toBe("file_type");
    expect((await rejection(api.createSource({ kind: "upload", file: file("празен.pdf", 0) }))).reason).toBe("empty");
    expect((await rejection(api.createSource({ kind: "upload", file: file("голем.pdf", 21 * 1024 * 1024) }))).reason).toBe("file_too_large");
    expect((await rejection(api.createSource({ kind: "upload", file: file("скен-1.pdf") }))).reason).toBe("no_text");
    expect((await rejection(api.createSource({ kind: "upload", file: file("scan.pdf") }))).reason).toBe("no_text");
  });

  test("a draft that is ready has 5 to 8 valid questions of all three kinds and a timer for each, and no subject, year or review summary", async () => {
    const draft = await makeDraft();
    expect(isValidContent(draft)).toBe(true);
    expect(draft.refinements).toEqual([]);
    expect(new Set(draft.questions.map((q) => q.kind)).size).toBe(3);
    expect(draft.questions.every((q) => q.timer_seconds >= 10 && q.explanation)).toBe(true);
    for (const gone of ["review_summary", "subject", "year"]) expect(draft).not.toHaveProperty(gone);
  });

  test("it picks the lesson that fits what the teacher wrote", async () => {
    expect((await makeDraft("Логаритми и нивните својства, за третата година со задачи.")).title).toBe("Логаритми");
    expect((await makeDraft("Извод на функција и правилата за наоѓање извод на полином.")).title).toBe("Извод на функција");
    const { source_id } = await api.createSource({ kind: "upload", file: file("Веројатност - работен лист.pdf") });
    expect((await finished(await api.generateLesson({ source_id }))).title).toBe("Основи на веројатноста");
  });

  test("the sentence of emphasis is kept, trimmed", async () => {
    expect((await makeDraft(typed, "  Нагласете ги примерите.  ")).emphasis).toBe("Нагласете ги примерите.");
    expect((await makeDraft(typed, "   ")).emphasis).toBeNull();
  });

  test("a source that does not exist is refused", async () => {
    expect((await rejection(api.generateLesson({ source_id: "src-none" }))).code).toBe("not_found");
  });

  test("a document is read for a moment, typed sentences are taken at once, and the wait can be set", async () => {
    const waits: number[] = [];
    const slow = createMockApi(source, { delay: async (ms) => void waits.push(ms) });
    await slow.createSource({ kind: "typed", text: typed });
    expect(waits).toEqual([]);
    // Long enough to see both parts of the wait on a preview.
    expect(SOURCE_MS).toBeGreaterThanOrEqual(1000);
    expect(GENERATE_MS).toBeGreaterThanOrEqual(5000);
    await slow.createSource({ kind: "upload", file: file("план.pdf") });
    expect(waits).toEqual([SOURCE_MS]);
  });

  test("a screen that stops waiting for a document ends the call as a dropped connection, and nothing is kept", async () => {
    const real = createMockApi(source);
    const stop = new AbortController();
    const reading = rejection(real.createSource({ kind: "upload", file: file("план.pdf") }, { signal: stop.signal }));
    stop.abort("cancel");
    expect((await reading).code).toBe("network");
    expect(source.state().school.sources).toEqual([]);
  });
});

/** A refinement of a draft, written: it is a job too. */
const refine = async (draft: ReadyDraft, refinement: Parameters<TeacherApi["refineDraft"]>[1]) => finished(await api.refineDraft(draft.id, refinement), REFINE_MS);

describe("refining a draft (FR-LES-08)", () => {
  test("Shorter timers shortens every timer, to no less than 10 seconds", async () => {
    const draft = await makeDraft();
    const refined = await refine(draft, "shorter_timers");
    expect(refined.id).not.toBe(draft.id);
    expect(refined.refinements).toEqual(["shorter_timers"]);
    refined.questions.forEach((q, i) => {
      expect(q.timer_seconds).toBeLessThan(draft.questions[i].timer_seconds);
      expect(q.timer_seconds).toBeGreaterThanOrEqual(10);
    });
    expect(refined.questions.map((q) => q.prompt)).toEqual(draft.questions.map((q) => q.prompt));
  });

  test("More questions adds some, never past eight", async () => {
    let draft = await makeDraft();
    const before = draft.questions.length;
    draft = await refine(draft, "more_questions");
    expect(draft.questions.length).toBeGreaterThan(before);
    for (let i = 0; i < 3; i++) draft = await refine(draft, "more_questions");
    expect(draft.questions.length).toBeLessThanOrEqual(8);
    expect(isValidContent(draft)).toBe(true);
    expect(draft.refinements).toHaveLength(4);
    expect(new Set(draft.questions.map((q) => q.prompt)).size).toBe(draft.questions.length);
    expect(draft.questions.map((q) => q.order)).toEqual(draft.questions.map((_, i) => i));
  });

  test("Easier and Harder change the questions or the timers, and keep the draft valid", async () => {
    const draft = await makeDraft();
    const easier = await refine(draft, "easier");
    const harder = await refine(draft, "harder");
    for (const refined of [easier, harder]) {
      expect(isValidContent(refined)).toBe(true);
      expect(refined.questions).toHaveLength(draft.questions.length);
      expect(JSON.stringify(refined.questions)).not.toBe(JSON.stringify(draft.questions));
    }
    expect(easier.questions[easier.questions.length - 1].prompt).not.toBe(draft.questions[draft.questions.length - 1].prompt);
    expect(harder.questions[0].prompt).not.toBe(draft.questions[0].prompt);
  });

  test("the draft that was refined is still there", async () => {
    const draft = await makeDraft();
    await api.refineDraft(draft.id, "harder");
    expect(await api.getDraft(draft.id)).toEqual(draft);
    expect((await rejection(api.refineDraft("d-none", "easier"))).code).toBe("not_found");
  });
});

describe("saving, editing and deleting", () => {
  test("a saved lesson is version 1, is listed, and survives a reload", async () => {
    const draft = await makeDraft();
    const before = (await api.listLessons()).length;
    const lesson = await api.saveLesson(saveRequest(draft));
    expect(lesson).toMatchObject({ version: 1, times_run: 0, copied_from: null, title: draft.title });
    for (const gone of ["subject", "year", "review_summary"]) expect(lesson).not.toHaveProperty(gone);
    expect(lesson.questions).toHaveLength(draft.questions.length);
    expect(lesson.questions.every((q, i) => q.id.startsWith(lesson.id) && q.order === i)).toBe(true);

    const reloaded = build(); // a new page over the same saved state
    const listed = await reloaded.listLessons();
    expect(listed).toHaveLength(before + 1);
    expect(listed[0].id).toBe(lesson.id); // newest first
    expect(await reloaded.getLesson(lesson.id)).toEqual(lesson);
    expect((await reloaded.listLessons()).filter((l) => l.times_run === 0)).toHaveLength(3);
  });

  test("what the teacher edited is what is saved", async () => {
    const draft = await makeDraft();
    const edited = saveRequest(draft).questions.map((q, i) => (i === 0 ? { ...q, prompt: "Едно друго прашање?", timer_seconds: 40 } : q));
    const lesson = await api.saveLesson({ ...saveRequest(draft), title: "  Мој наслов ", questions: edited });
    expect(lesson.title).toBe("Мој наслов");
    expect(lesson.questions[0]).toMatchObject({ prompt: "Едно друго прашање?", timer_seconds: 40 });
  });

  test("a draft is saved once, and a lesson that is not valid is refused", async () => {
    const draft = await makeDraft();
    expect((await rejection(api.saveLesson({ ...saveRequest(draft), questions: saveRequest(draft).questions.slice(0, 4) }))).code).toBe("validation_failed");
    expect((await rejection(api.saveLesson({ ...saveRequest(draft), title: "  " }))).code).toBe("validation_failed");
    await api.saveLesson(saveRequest(draft));
    // Saved once: the draft stays readable and leads to its lesson, and cannot be saved again (BR-LES-08).
    expect((await rejection(api.saveLesson(saveRequest(draft)))).code).toBe("invalid_state");
    expect(await api.getDraft(draft.id)).toMatchObject({ consumed_at: expect.any(String), lesson_id: expect.stringMatching(/^l-n/) });
  });

  test("editing a lesson makes the next version and leaves what was run alone (BR-LES-03)", async () => {
    const run = (await api.listLessons()).find((l) => l.times_run > 0)!;
    const lesson = await api.getLesson(run.id);
    const changed = await api.updateLesson(run.id, { title: "Нов наслов", questions: lesson.questions });
    expect(changed).toMatchObject({ version: 2, title: "Нов наслов", times_run: run.times_run });
    expect((await api.listLessons()).find((l) => l.id === run.id)).toMatchObject({ version: 2, title: "Нов наслов", times_run: run.times_run });
    // What was run keeps its version: the end page of the latest run still names version 1.
    expect((await api.getReview(run.last_session_id!)).session.lesson.version).toBe(1);
    expect((await rejection(api.updateLesson(run.id, { title: "", questions: [] }))).code).toBe("validation_failed");
    expect((await rejection(api.updateLesson("l-none", lesson))).code).toBe("not_found");
  });

  test("a deleted lesson is gone, a second delete is not found, and the history stays", async () => {
    const prepared = (await api.listLessons()).find((l) => l.times_run === 0)!;
    await api.deleteLesson(prepared.id);
    expect((await api.listLessons()).some((l) => l.id === prepared.id)).toBe(false);
    expect((await rejection(api.getLesson(prepared.id))).code).toBe("not_found");
    expect((await rejection(api.deleteLesson(prepared.id))).code).toBe("not_found");

    const run = (await api.listLessons()).find((l) => l.times_run > 0)!;
    await api.deleteLesson(run.id);
    expect((await api.getReview(run.last_session_id!)).session.state).toBe("ended");

    const draft = await makeDraft();
    const mine = await api.saveLesson(saveRequest(draft));
    await api.deleteLesson(mine.id);
    expect((await build().listLessons()).some((l) => l.id === mine.id)).toBe(false);
  });

  test("the other demo school keeps its own lessons", async () => {
    await api.saveLesson(saveRequest(await makeDraft()));
    source.setSchoolType("university");
    const lessons = await api.listLessons();
    expect(lessons.filter((l) => l.times_run === 0)).toHaveLength(2);
    expect(lessons.some((l) => l.title === "Граници на низи и функции" && l.times_run === 3)).toBe(true);
    source.setSchoolType("school");
    expect((await api.listLessons()).filter((l) => l.times_run === 0)).toHaveLength(3);
  });
});

describe("the school library", () => {
  test("holds what colleagues saved, none of it the teacher's own, none copied yet", async () => {
    const library = await api.listLibrary();
    expect(library).toHaveLength(5);
    expect(library.every((i) => i.owner.name !== "Марија Петровска" && !i.already_copied && i.question_count >= 5)).toBe(true);
    const own = new Set((await api.listLessons()).map((l) => l.id));
    expect(library.every((i) => !own.has(i.lesson_id))).toBe(true);
  });

  test("a library lesson can be read to preview it", async () => {
    const [item] = await api.listLibrary();
    expect(isValidContent(await api.getLesson(item.lesson_id))).toBe(true);
  });

  test("a copy is a new lesson of the teacher's, and the original is not touched (F-05)", async () => {
    const before = await api.listLibrary();
    const original = await api.getLesson(before[0].lesson_id);
    const copy = await api.copyFromLibrary(before[0].lesson_id);
    expect(copy.id).not.toBe(before[0].lesson_id);
    expect(copy).toMatchObject({ version: 1, times_run: 0, copied_from: { lesson_id: before[0].lesson_id, owner_name: before[0].owner.name } });
    expect((await api.listLessons())[0].id).toBe(copy.id);

    const after = await api.listLibrary();
    expect(after.map((i) => ({ ...i, already_copied: false }))).toEqual(before);
    expect(after[0].already_copied).toBe(true);
    expect(await api.getLesson(before[0].lesson_id)).toEqual(original);

    // The teacher edits the copy; the colleague's lesson stays as it was.
    const lesson: Lesson = await api.getLesson(copy.id);
    await api.updateLesson(copy.id, { ...lesson, title: "Мое" });
    expect(await api.getLesson(before[0].lesson_id)).toEqual(original);
    expect((await rejection(api.copyFromLibrary("lib-none"))).code).toBe("not_found");
  });

  test("a copy survives the colleague's lesson, as a deleted original would not take it away (EC-LES-04)", async () => {
    const [item] = await api.listLibrary();
    const copy = await api.copyFromLibrary(item.lesson_id);
    expect((await build().getLesson(copy.id)).copied_from?.lesson_id).toBe(item.lesson_id);
  });
});

describe("the library of the demo school and of the demo faculty", () => {
  test("holds the lessons of several colleagues, each lesson a valid one, with no subject or year", async () => {
    const library = await api.listLibrary();
    expect(new Set(library.map((i) => i.owner.id)).size).toBeGreaterThanOrEqual(3);
    for (const item of library) {
      for (const gone of ["subject", "year"]) expect(item).not.toHaveProperty(gone);
      const lesson = await api.getLesson(item.lesson_id);
      expect(isValidContent(lesson)).toBe(true);
      expect(lesson.question_count).toBe(item.question_count);
      for (const gone of ["subject", "year", "review_summary"]) expect(lesson).not.toHaveProperty(gone);
    }
  });

  test("the faculty has its own colleagues, and none of the school's", async () => {
    const school = await api.listLibrary();
    source.setSchoolType("university");
    const faculty = await api.listLibrary();
    expect(faculty.length).toBeGreaterThanOrEqual(3);
    expect(faculty.every((i) => !school.some((s) => s.owner.id === "t-avramovska" && i.owner.id === s.owner.id))).toBe(true);
    expect(new Set(faculty.map((i) => i.owner.name))).toContain("Драган Ристевски");
  });

  test("one of the library's lessons has a drawing on a question, with what it shows, and a copy keeps it", async () => {
    const library = await api.listLibrary();
    const withPicture = [];
    for (const item of library) {
      const lesson = await api.getLesson(item.lesson_id);
      if (lesson.questions.some((q) => q.media)) withPicture.push(lesson);
    }
    expect(withPicture).toHaveLength(1);
    const media = withPicture[0].questions.find((q) => q.media)!.media!;
    expect(media.url).toMatch(/^data:image\/svg\+xml/);
    expect(media.alt).toBe("Правоаголен триаголник со катети 6 и 8");
    const copy = await api.copyFromLibrary(withPicture[0].id);
    expect(copy.questions.find((q) => q.media)?.media?.alt).toBe(media.alt);
  });

  test("a school where nobody has saved a lesson yet has an empty library, and a lesson of it is not found", async () => {
    const [item] = await api.listLibrary();
    const state = source.state();
    source.commit({ ...state, school: { ...state.school, library_empty: true } });
    expect(await api.listLibrary()).toEqual([]);
    expect((await rejection(api.getLesson(item.lesson_id))).code).toBe("not_found");
    expect((await rejection(api.copyFromLibrary(item.lesson_id))).code).toBe("not_found");
  });

  test("a computer that is offline cannot copy, and nothing is copied", async () => {
    const [item] = await api.listLibrary();
    vi.stubGlobal("navigator", { onLine: false });
    try {
      expect((await rejection(api.copyFromLibrary(item.lesson_id))).code).toBe("network");
    } finally {
      vi.unstubAllGlobals();
    }
    expect((await api.listLibrary()).some((i) => i.already_copied)).toBe(false);
  });

  test("a copy that the teacher deleted is not a copy any more: the lesson can be copied again, and says so", async () => {
    const [item] = await api.listLibrary();
    const first = await api.copyFromLibrary(item.lesson_id);
    expect((await api.listLibrary()).find((i) => i.lesson_id === item.lesson_id)?.already_copied).toBe(true);
    // Copying it again is possible, and a second copy is a second lesson.
    const second = await api.copyFromLibrary(item.lesson_id);
    expect(second.id).not.toBe(first.id);
    await api.deleteLesson(first.id);
    expect((await api.listLibrary()).find((i) => i.lesson_id === item.lesson_id)?.already_copied).toBe(true);
    await api.deleteLesson(second.id);
    expect((await api.listLibrary()).find((i) => i.lesson_id === item.lesson_id)?.already_copied).toBe(false);
  });
});

describe("deleting a lesson", () => {
  test("a lesson that is being run cannot be deleted, and stays", async () => {
    const lesson = (await api.listLessons()).find((l) => l.times_run === 0)!;
    await api.createSession({ lesson_id: lesson.id });
    expect((await rejection(api.deleteLesson(lesson.id))).code).toBe("invalid_state");
    expect((await api.listLessons()).some((l) => l.id === lesson.id)).toBe(true);
    // Another lesson can go while one is running.
    const other = (await api.listLessons()).find((l) => l.id !== lesson.id && l.times_run === 0)!;
    await api.deleteLesson(other.id);
    expect((await api.listLessons()).some((l) => l.id === other.id)).toBe(false);
  });

  test("a lesson that was held goes from the list, and the held lessons and their results stay", async () => {
    const held = (await api.listLessons()).find((l) => l.times_run > 0)!;
    const before = await api.getReview(held.last_session_id!);
    await api.deleteLesson(held.id);
    expect((await api.listLessons()).some((l) => l.id === held.id)).toBe(false);
    expect((await rejection(api.getLesson(held.id))).code).toBe("not_found");
    expect(await api.getReview(held.last_session_id!)).toEqual(before);
    expect((await rejection(api.deleteLesson(held.id))).code).toBe("not_found");
  });

  test("what was being changed in it goes with it: the open edit draft, and the drafts that were saved from it", async () => {
    const draft = await makeDraft();
    const lesson = await api.saveLesson(saveRequest(draft));
    const editing = await api.startEditing(lesson.id);
    expect((await api.listDrafts()).map((d) => d.id)).toContain(editing.id);
    await api.deleteLesson(lesson.id);
    expect((await api.listDrafts()).some((d) => d.id === editing.id)).toBe(false);
    expect((await rejection(api.getDraft(editing.id))).code).toBe("not_found");
    // The draft the lesson was made from went with it too: nothing is left that leads to a lesson that is not there.
    expect((await rejection(api.getDraft(draft.id))).code).toBe("not_found");
  });

  test("the drafts of other lessons, and of lessons not made yet, are not touched", async () => {
    const waiting = await askDraft();
    const draft = await makeDraft(typed + " Втор нацрт за сличен текст за проба.");
    const lesson = await api.saveLesson(saveRequest(draft));
    await api.deleteLesson(lesson.id);
    expect((await api.listDrafts()).map((d) => d.id)).toContain(waiting.id);
  });

  test("a computer that is offline cannot delete, and nothing is changed", async () => {
    const lesson = (await api.listLessons())[0];
    vi.stubGlobal("navigator", { onLine: false });
    try {
      expect((await rejection(api.deleteLesson(lesson.id))).code).toBe("network");
    } finally {
      vi.unstubAllGlobals();
    }
    expect((await api.listLessons()).some((l) => l.id === lesson.id)).toBe(true);
  });
});

describe("the picture of a question", () => {
  /** A browser that draws any picture and says it is large. */
  const env: ImageEnv = {
    decode: async () => ({ width: 3000, height: 2000, source: "bitmap" }),
    encode: async (_s, width, height) => `data:image/jpeg;base64,${width}x${height}`,
  };
  const withImages = () => createMockApi(source, { delay: () => Promise.resolve(), image: env });
  const picture = (name: string, type: string, size = 5000) => ({ name, type, size }) as File;

  test("a picture is made small and given an id and an address the page can show", async () => {
    const media = await withImages().uploadMedia(picture("graf.png", "image/png"));
    expect(media).toEqual({ id: expect.stringMatching(/^m-n\d+$/), url: "data:image/jpeg;base64,1000x667", alt: null });
  });

  test("two pictures get two ids", async () => {
    const a = withImages();
    const first = await a.uploadMedia(picture("a.jpg", "image/jpeg"));
    const second = await a.uploadMedia(picture("b.jpg", "image/jpeg"));
    expect(first.id).not.toBe(second.id);
  });

  test("takes a moment, as the server does", async () => {
    expect(MEDIA_MS).toBeGreaterThanOrEqual(500);
    const waits: number[] = [];
    const a = createMockApi(source, { delay: async (ms) => void waits.push(ms), image: env });
    await a.uploadMedia(picture("a.jpg", "image/jpeg"));
    expect(waits).toEqual([MEDIA_MS]);
  });

  test("a computer that is offline cannot add a picture, before or after the wait", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    try {
      expect((await rejection(withImages().uploadMedia(picture("a.jpg", "image/jpeg")))).code).toBe("network");
    } finally {
      vi.unstubAllGlobals();
    }
    // The connection drops while the picture is on its way.
    const a = createMockApi(source, {
      delay: async () => void vi.stubGlobal("navigator", { onLine: false }),
      image: env,
    });
    try {
      expect((await rejection(a.uploadMedia(picture("a.jpg", "image/jpeg")))).code).toBe("network");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("a type that is not JPEG, PNG or WebP is refused, with its reason, before it is waited for", async () => {
    const waits: number[] = [];
    const a = createMockApi(source, { delay: async (ms) => void waits.push(ms), image: env });
    const error = await rejection(a.uploadMedia(picture("a.gif", "image/gif")));
    expect(error).toMatchObject({ code: "validation_failed", reason: "image_type", status: 422 });
    expect(waits).toEqual([]);
  });

  test("a picture over 10 MB is refused, and one of exactly 10 MB is not", async () => {
    const a = withImages();
    expect(await rejection(a.uploadMedia(picture("a.jpg", "image/jpeg", 10 * 1024 * 1024 + 1)))).toMatchObject({ code: "validation_failed", reason: "image_too_large" });
    await expect(a.uploadMedia(picture("a.jpg", "image/jpeg", 10 * 1024 * 1024))).resolves.toMatchObject({ alt: null });
  });

  test("a file the browser cannot read as a picture is refused as unreadable", async () => {
    const a = createMockApi(source, { delay: () => Promise.resolve(), image: { decode: async () => Promise.reject(new Error("no")), encode: async () => "" } });
    expect(await rejection(a.uploadMedia(picture("a.png", "image/png")))).toMatchObject({ code: "validation_failed", reason: "image_unreadable" });
  });

  test("a picture stays on the question through a draft, a save and an edit, with its words", async () => {
    const a = withImages();
    const media = await a.uploadMedia(picture("graf.png", "image/png"));
    const draft = await makeDraft();
    const questions = draft.questions.map((q, i) => (i === 0 ? { ...q, media: { ...media, alt: "Графикот на парабола" } } : q));
    await a.updateDraft(draft.id, { questions });
    const lesson = await a.saveLesson({ draft_id: draft.id, title: draft.title, questions: questions as Lesson["questions"] });
    expect(lesson.questions[0].media).toEqual({ id: media.id, url: media.url, alt: "Графикот на парабола" });
    expect((await a.getLesson(lesson.id)).questions[0].media?.alt).toBe("Графикот на парабола");
  });
});

describe("the live lesson", () => {
  /** A lesson started at once, and the students as the clock gives them. */
  async function started() {
    const lesson = (await api.listLessons()).find((l) => l.times_run === 0)!;
    return api.createSession({ lesson_id: lesson.id });
  }
  /** The pool the demo draws its joiners from: the school's 26 students. */
  const POOL = 26;

  test("a lesson that has just been started lists nobody, has the code and every question ready, and names no class or subject", async () => {
    const c = await started();
    expect(c.session).toMatchObject({ state: "lobby", lesson: { id: expect.any(String), title: expect.any(String) } });
    for (const gone of ["class_name", "subject_name", "course_id"]) expect(c.session).not.toHaveProperty(gone);
    expect(c.students).toEqual([]);
    expect(c.join).toMatchObject({ short_code: expect.stringMatching(/^\d{6}$/), token: expect.any(String) });
    expect(c.questions.length).toBeGreaterThanOrEqual(5);
    expect(c.questions.every((q) => q.status === "ready")).toBe(true);
  });

  test("students appear as they scan the code, as time goes by, and a reload finds them where the clock has put it (FR-SES-08)", async () => {
    const first = await started();
    now += 5000;
    const soon = await api.getConsole(first.session.id);
    now += 70_000;
    const later = await api.getConsole(first.session.id);
    expect(soon.students.length).toBeLessThan(later.students.length);
    const share = later.students.length / POOL;
    expect(share).toBeGreaterThanOrEqual(0.7);
    expect(share).toBeLessThanOrEqual(0.9);
    // Everyone listed has a join time that has passed, and is an object of the new shape: no mark of attendance.
    for (const s of later.students) {
      expect(Date.parse(s.joined_at)).toBeLessThanOrEqual(now);
      expect(Object.keys(s).sort()).toEqual(["answer_state", "focus_flags", "full_name", "id", "joined_at", "online", "points"]);
    }
    // A second read, as a second window or a reload, says the same.
    expect(await api.getConsole(first.session.id)).toEqual(later);
  });

  test("the list only ever grows: nobody who has joined drops out, and a student who is not yet in is never named", async () => {
    const c = await started();
    const seen = new Set<string>();
    for (let step = 0; step < 12; step++) {
      now += 15_000;
      const snap = await api.getConsole(c.session.id);
      for (const id of seen) expect(snap.students.some((s) => s.id === id)).toBe(true);
      snap.students.forEach((s) => seen.add(s.id));
      expect(snap.students.length).toBeLessThanOrEqual(POOL);
    }
  });

  test("the code is the same all through its 30 seconds and another one follows", async () => {
    const first = await started();
    const edge = Math.ceil(now / 30_000) * 30_000;
    now = edge - 5000;
    const a = await api.getConsole(first.session.id);
    now = edge - 1;
    expect((await api.getConsole(first.session.id)).join).toEqual(a.join);
    now = edge;
    const b = await api.getConsole(first.session.id);
    expect(b.join!.token).not.toBe(a.join!.token);
    expect(b.join!.valid_to).toBe(new Date(edge + 30_000).toISOString());
  });

  test("the class view names the lesson, holds no student who is not here and none of the console's own data", async () => {
    const c = await started();
    now += 30_000;
    const view = await api.getClassView(c.session.id);
    const console_ = await api.getConsole(c.session.id);
    const text = JSON.stringify(view);
    expect(console_.students.length).toBeGreaterThan(0);
    expect(console_.students.length).toBeLessThan(POOL);
    expect(view.session).toMatchObject({ lesson_title: c.session.lesson.title, joined_count: console_.students.length });
    for (const gone of ["class_name", "subject_name"]) expect(view.session).not.toHaveProperty(gone);
    // The projector may name only the last few to join.
    expect(view.session.recent.length).toBeLessThanOrEqual(5);
    expect(text.match(/"recent":\[[^\]]*\]/)).not.toBeNull();
    expect(view.join).toEqual(console_.join);
    expect(text).not.toContain("students");
  });

  test("another session, or none, is not found", async () => {
    expect((await rejection(api.getConsole("s-none"))).code).toBe("not_found");
    expect((await rejection(api.getClassView("s-none"))).code).toBe("not_found");
    const c = await started();
    expect((await rejection(api.getConsole(`${c.session.id}x`))).code).toBe("not_found");
  });

  test("the teacher moves the lesson from the lobby to teaching, once, and never back (4.1)", async () => {
    const c = await started();
    expect((await rejection(api.advance(c.session.id, { to: "review" as "teaching" }))).code).toBe("validation_failed");
    const t = await api.advance(c.session.id, { to: "teaching" });
    expect(t.session.state).toBe("teaching");
    expect((await api.getOpenSession()).session?.state).toBe("teaching");
    expect((await rejection(api.advance(c.session.id, { to: "teaching" }))).code).toBe("invalid_state");
    expect((await rejection(api.advance(c.session.id, { to: "lobby" as "teaching" }))).code).toBe("validation_failed");
  });

  test("students keep joining after the teacher began the lesson, until End, and nobody is marked late", async () => {
    const c = await started();
    now += 20_000;
    const before = (await api.getConsole(c.session.id)).students.map((s) => s.id);
    await api.advance(c.session.id, { to: "teaching" });
    now += 80_000;
    const after = await api.getConsole(c.session.id);
    const newcomers = after.students.filter((s) => !before.includes(s.id));
    expect(newcomers.length).toBeGreaterThanOrEqual(1);
    for (const id of before) expect(after.students.some((s) => s.id === id)).toBe(true);
    // A join after End is not possible: the lesson is gone.
    await api.endSession(c.session.id);
    expect((await rejection(api.getConsole(c.session.id))).code).toBe("not_found");
  });

  test("a computer that is offline cannot move the lesson, and nothing changes", async () => {
    const c = await started();
    vi.stubGlobal("navigator", { onLine: false });
    try {
      expect((await rejection(api.advance(c.session.id, { to: "teaching" }))).code).toBe("network");
    } finally {
      vi.unstubAllGlobals();
    }
    const again = await api.getConsole(c.session.id);
    expect(again.session.state).toBe("lobby");
  });

  describe("the stream", () => {
    /** The stream, looking when the test says. */
    function listen(channel: `session.${string}.${"public" | "class" | "console"}`) {
      let look: () => void = () => {};
      const streamed = createMockApi(source, { delay: () => Promise.resolve(), tick: (fn) => ((look = fn), () => {}) });
      const events: { type: string }[] = [];
      const statuses: string[] = [];
      const stop = streamed.openChannel(channel, { onEvent: (e) => events.push(e), onStatus: (s) => statuses.push(s) });
      return { events, statuses, stop, look: () => look() };
    }

    test("opens, then says what changed each time it looks, on the channel it was asked for", async () => {
      const c = await started();
      const stream = listen(`session.${c.session.id}.console`);
      await Promise.resolve();
      expect(stream.statuses).toEqual(["connecting", "open"]);
      stream.look();
      expect(stream.events).toEqual([]);
      now += 30_000;
      stream.look();
      expect(stream.events.map((e) => e.type)).toEqual(expect.arrayContaining(["joined.count", "student.joined"]));
      stream.stop();
    });

    test("the class channel carries the code and the count and no student", async () => {
      const c = await started();
      const stream = listen(`session.${c.session.id}.class`);
      await Promise.resolve();
      now += 45_000;
      stream.look();
      const types = stream.events.map((e) => e.type);
      expect(types).toContain("joined.count");
      expect(types).toContain("join_token.rotated");
      expect(types).not.toContain("student.joined");
      stream.stop();
    });

    test("a lesson the teacher moves on is said on every channel", async () => {
      const c = await started();
      const stream = listen(`session.${c.session.id}.public`);
      await Promise.resolve();
      await api.advance(c.session.id, { to: "teaching" });
      stream.look();
      expect(stream.events.map((e) => e.type)).toContain("state.changed");
      stream.stop();
    });

    test("a computer with no connection is reconnecting, and opens again on its own when it is back", async () => {
      const c = await started();
      const stream = listen(`session.${c.session.id}.console`);
      await Promise.resolve();
      vi.stubGlobal("navigator", { onLine: false });
      stream.look();
      vi.unstubAllGlobals();
      stream.look();
      expect(stream.statuses).toEqual(["connecting", "open", "reconnecting", "open"]);
      stream.stop();
    });

    test("stopping it stops it", async () => {
      const c = await started();
      const stream = listen(`session.${c.session.id}.console`);
      await Promise.resolve();
      stream.stop();
      now += 45_000;
      stream.look();
      expect(stream.events).toEqual([]);
    });
  });
});

describe("what is not built yet", () => {
  test("a lesson that is not the teacher's is not found, ended or reviewed", async () => {
    for (const call of [api.endSession("s"), api.getReview("s")]) {
      expect((await rejection(call)).code).toBe("not_found");
    }
  });
});

describe("starting a lesson", () => {
  const prepared = async () => (await api.listLessons()).filter((l) => l.times_run === 0);
  test("nothing is open to begin with, and the answer carries the server's clock", async () => {
    const open = await api.getOpenSession();
    expect(open.session).toBeNull();
    expect(open.server_now).toBe(new Date(NOW).toISOString());
  });

  test("starts in the lobby with no question asked for a class: the body is the lesson alone, every question is ready and nobody is in yet", async () => {
    const [lesson] = await prepared();
    const snapshot = await api.createSession({ lesson_id: lesson.id });
    expect(snapshot.session).toEqual({
      id: expect.any(String),
      state: "lobby",
      ended_at: null,
      started_at: new Date(NOW).toISOString(),
      lesson: { id: lesson.id, title: lesson.title, version: 1 },
    });
    expect(snapshot.questions).toHaveLength(lesson.question_count);
    expect(snapshot.questions.every((q) => q.status === "ready" && q.fired_at === null && !q.adhoc)).toBe(true);
    expect(snapshot.students).toEqual([]);
    expect(snapshot.nudge).toBeNull();
  });

  test("GET /sessions/open then returns it, with the lesson and nothing of a class or a subject (AC-END-05)", async () => {
    const [lesson] = await prepared();
    const { session } = await api.createSession({ lesson_id: lesson.id });
    const open = await api.getOpenSession();
    expect(open.session).toEqual(session);
    expect(open.session?.started_at).toBe(new Date(NOW).toISOString());
  });

  test("a second start is refused as session_open (409), whatever the lesson, and nothing changes", async () => {
    const [first, second] = await prepared();
    const { session } = await api.createSession({ lesson_id: first.id });
    const again = await rejection(api.createSession({ lesson_id: second.id }));
    expect(again.code).toBe("session_open");
    expect(again.status).toBe(409);
    expect((await rejection(api.createSession({ lesson_id: first.id }))).code).toBe("session_open");
    expect((await api.getOpenSession()).session?.id).toBe(session.id);
  });

  test("a lesson that is not the teacher's is not found, even while a lesson is open", async () => {
    expect((await rejection(api.createSession({ lesson_id: "nope" }))).code).toBe("not_found");
    expect((await api.getOpenSession()).session).toBeNull();
  });

  test("the lesson stays prepared until it has been run: starting it does not make it a run lesson", async () => {
    const [lesson] = await prepared();
    await api.createSession({ lesson_id: lesson.id });
    expect((await prepared()).map((l) => l.id)).toContain(lesson.id);
  });

  test("the open lesson is kept with the demo, and each demo school and teacher has their own", async () => {
    const [lesson] = await prepared();
    const { session } = await api.createSession({ lesson_id: lesson.id });
    // A page loaded again builds the adapter afresh over the same saved state.
    await expect(build().getOpenSession()).resolves.toMatchObject({ session: { id: session.id } });
    source.setSchoolType("university");
    expect((await api.getOpenSession()).session).toBeNull();
    source.setSchoolType("school");
    source.setSession("novice");
    expect((await api.getOpenSession()).session).toBeNull();
    source.setSession("veteran");
    expect((await api.getOpenSession()).session).not.toBeNull();
  });

  test("starts at a faculty too, with the lesson alone", async () => {
    source.setSchoolType("university");
    const [lesson] = await prepared();
    const { session } = await api.createSession({ lesson_id: lesson.id });
    expect(session.lesson.id).toBe(lesson.id);
    expect(session).not.toHaveProperty("class_name");
  });

  test("a saved lesson that is open is read back; one that is damaged or ended is dropped, not trusted", async () => {
    const [lesson] = await prepared();
    await api.createSession({ lesson_id: lesson.id });
    const saved = JSON.parse(JSON.stringify(source.state()));
    expect(saved.school.session.state).toBe("lobby");
    const { sanitizeState } = await import("@/lib/teacher/api/mock-state");
    expect(sanitizeState(saved, NOW).school.session?.id).toBe(saved.school.session.id);
    for (const damage of [{ state: "ended" }, { started_at: "yesterday" }, { lesson: null }]) {
      const bad = JSON.parse(JSON.stringify(saved));
      bad.school.session = { ...bad.school.session, ...damage };
      expect(sanitizeState(bad, NOW).school.session).toBeNull();
    }
  });

  test("the demo can show a lesson that is running, twelve minutes in, and close it again", async () => {
    const mock = createMock(source, { delay: () => Promise.resolve() });
    mock.demo.simulateRunning();
    const open = await mock.api.getOpenSession();
    expect(open.session).toMatchObject({ state: "lobby" });
    expect(open.session).not.toHaveProperty("subject_name");
    expect(Date.parse(open.server_now) - Date.parse(open.session!.started_at)).toBe(12 * 60_000);
    // One lesson at a time: pretending again changes nothing, and a real start is refused.
    const id = open.session!.id;
    mock.demo.simulateRunning();
    expect((await mock.api.getOpenSession()).session?.id).toBe(id);
    const [lesson] = await prepared();
    expect((await rejection(mock.api.createSession({ lesson_id: lesson.id }))).code).toBe("session_open");

    await mock.api.endSession(id);
    expect((await mock.api.getOpenSession()).session).toBeNull();
    // Ended, it is a lesson that can be started again.
    expect((await mock.api.createSession({ lesson_id: lesson.id })).session.state).toBe("lobby");
  });

  test("the demo can show a running lesson to a teacher who has made no lesson, too", async () => {
    source.setSession("novice");
    const mock = createMock(source, { delay: () => Promise.resolve() });
    mock.demo.simulateRunning();
    const open = await mock.api.getOpenSession();
    expect(open.session?.lesson.title).toBeTruthy();
  });

  test("starting is refused until somebody is signed in", async () => {
    const [lesson] = await prepared();
    source.setSession(null);
    expect((await rejection(api.createSession({ lesson_id: lesson.id }))).code).toBe("unauthenticated");
    expect((await rejection(api.getOpenSession())).code).toBe("unauthenticated");
  });
});

describe("the new teacher: invited, signed in for the first time", () => {
  const novice = () => {
    const s = memorySource(freshState(ANCHOR), { now: () => now, persona: "novice" });
    return { source: s, api: createMockApi(s, { delay: () => Promise.resolve() }) };
  };

  test("is somebody else at the same school, with the first run not done", async () => {
    const { api } = novice();
    const me = await api.getMe();
    expect(me).toMatchObject({ name: "Игор Арсовски", role: "teacher", first_run_done: false, school: { type: "gymnasium" } });
    expect(me.email).toBe("igor.arsovski@gimnazija-svetlina.example");
    expect((await api.getMe()).id).not.toBe((await build().getMe()).id);
  });

  test("has the same demo students to join a lesson, and has run nothing: no held lessons", async () => {
    const { api } = novice();
    expect(await api.listLessons()).toEqual([]);
  });

  test("has made no lesson, and so has nothing prepared for Today; the school library is there to copy from", async () => {
    const { api } = novice();
    expect(await api.listLessons()).toEqual([]);
    expect((await api.listLibrary()).length).toBeGreaterThan(0);
  });

  test("finishing the first run is kept, for this teacher only", async () => {
    const { api, source } = novice();
    expect((await api.setFirstRunDone()).first_run_done).toBe(true);
    expect((await api.getMe()).first_run_done).toBe(true);
    // Setting it again changes nothing and is not an error.
    expect((await api.setFirstRunDone()).first_run_done).toBe(true);
    // The teacher with history never had a first run to finish, and is not touched.
    source.setSession("veteran");
    expect((await api.getMe()).first_run_done).toBe(true);
    // Signing back in as the new teacher finds it done.
    source.setSession("novice");
    expect((await api.getMe()).first_run_done).toBe(true);
  });

  test("makes lessons of their own, which the teacher with history does not see, and the other way round", async () => {
    const { api, source } = novice();
    const draft = await makeDraftWith(api);
    const saved = await api.saveLesson({ draft_id: draft.id, title: draft.title, questions: draft.questions as Lesson["questions"] });
    expect((await api.listLessons()).map((l) => l.id)).toEqual([saved.id]);
    source.setSession("veteran");
    expect((await api.listLessons()).some((l) => l.id === saved.id)).toBe(false);
    expect((await api.listLessons()).length).toBeGreaterThan(5);
  });

  test("at a faculty is still the new teacher, in that school's words", async () => {
    const { api, source } = novice();
    source.setSchoolType("university");
    const me = await api.getMe();
    expect(me).toMatchObject({ name: "Игор Арсовски", first_run_done: false, school: { type: "faculty" } });
    expect(me.auth_provider).toBe("microsoft");
  });
});

/** A draft made through a new teacher's own adapter, for the tests above. */
async function makeDraftWith(a: TeacherApi): Promise<ReadyDraft> {
  const { source_id } = await a.createSource({ kind: "typed", text: typed });
  const asked = await a.generateLesson({ source_id });
  now += GENERATE_MS + 1;
  const read = await a.getDraft(asked.id);
  if (read.status !== "ready") throw new Error("The draft is not ready");
  return read;
}
