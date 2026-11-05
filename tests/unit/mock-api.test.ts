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
  return api.generateLesson({ source_id, subject_id: "math", year: 2, emphasis });
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
  review_summary: draft.review_summary,
  questions: draft.questions as Lesson["questions"],
});

describe("who and what", () => {
  test("the teacher is Марија Петровска at a gymnasium, with three courses", async () => {
    const me = await api.getMe();
    expect(me).toMatchObject({ name: "Марија Петровска", role: "teacher", first_run_done: true, school: { type: "gymnasium" } });
    const courses = await api.listCourses();
    expect(courses.map((c) => c.class.name)).toEqual(["II-4", "III-5", "IV-1"]);
    expect(courses.map((c) => c.student_count)).toEqual([26, 24, 28]);
    expect(courses.every((c) => c.speed_bonus_on && c.lessons_run === 6 && c.last_session_at)).toBe(true);
  });

  test("the demo switch serves the faculty: the same teacher as a professor, with study groups", async () => {
    source.setSchoolType("university");
    const me = await api.getMe();
    expect(me.name).toBe("Марија Петровска");
    expect(me.school.type).toBe("faculty");
    expect((await api.listCourses()).map((c) => c.class.name)).toEqual(["Група 1А", "Група 2Б", "Група 3А"]);
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

describe("the course dashboard", () => {
  test("holds a course's history in the shapes the results page needs", async () => {
    const [course] = await api.listCourses();
    const d = await api.getDashboard(course.id);
    expect(d.course.id).toBe(course.id);
    expect(d.students).toHaveLength(26);
    expect(d.sessions).toHaveLength(6);
    expect(d.sessions[0].started_at > d.sessions[5].started_at).toBe(true); // newest first
    expect(d.attendance.length).toBeGreaterThan(130);
    expect(d.topics.length).toBeGreaterThan(0);
    expect(d.practice.length).toBeGreaterThanOrEqual(1);
    expect(d.students.some((s) => s.joined_mid_year)).toBe(true);
    expect(d.attendance.filter((a) => a.status === "present_no_device").every((a) => a.no_device_reason)).toBe(true);
    expect(d.anon_questions.every((a) => a.sender.name && a.text)).toBe(true);
  });

  test("a lesson's tally adds up to the students enrolled for it", async () => {
    const [course] = await api.listCourses();
    const d = await api.getDashboard(course.id);
    for (const s of d.sessions) {
      expect(s.tally.present + s.tally.late + s.tally.absent + s.tally.present_no_device).toBe(s.tally.total);
      expect(d.attendance.filter((a) => a.session_id === s.id)).toHaveLength(s.tally.total);
      expect(s.participation).toBeGreaterThan(0.8);
      expect(s.right_rate).toBeGreaterThan(0.3);
      expect(s.right_rate).toBeLessThan(1);
    }
  });

  test("the points of the lessons add up to the points of the students", async () => {
    for (const course of await api.listCourses()) {
      const d = await api.getDashboard(course.id);
      const byLesson = d.sessions.reduce((n, s) => n + s.points, 0);
      const byStudent = d.students.reduce((n, s) => n + s.points, 0);
      expect(byLesson).toBe(byStudent);
      expect(byLesson).toBeGreaterThan(0);
    }
  });

  test("a practice set counts the whole class, and who did it, not only those who were at the lesson", async () => {
    const [course] = await api.listCourses();
    const d = await api.getDashboard(course.id);
    for (const p of d.practice) {
      const session = d.sessions.find((s) => s.id === p.practice_set.session_id)!;
      expect(p.students).toBe(session.tally.total);
      expect(p.completed).toBeLessThanOrEqual(p.students);
      if (p.average_score !== null) expect(p.average_score).toBeLessThanOrEqual(p.practice_set.question_count);
    }
  });

  test("a topic's totals are the sum of its students'", async () => {
    const [course] = await api.listCourses();
    const d = await api.getDashboard(course.id);
    for (const t of d.topics) {
      expect(t.by_student.reduce((n, s) => n + s.total, 0)).toBe(t.total);
      expect(t.by_student.reduce((n, s) => n + s.right, 0)).toBe(t.right);
      expect(t.right).toBeLessThanOrEqual(t.total);
    }
  });

  test("a course that is not the teacher's is not found", async () => {
    expect((await rejection(api.getDashboard("course-of-someone-else"))).code).toBe("not_found");
  });

  test("the speed bonus can be switched off for one course, and the switch is kept per demo school", async () => {
    const [course] = await api.listCourses();
    expect((await api.updateCourse(course.id, { speed_bonus_on: false })).speed_bonus_on).toBe(false);
    expect((await api.listCourses())[0].speed_bonus_on).toBe(false);
    expect((await api.listCourses())[1].speed_bonus_on).toBe(true);
    expect((await api.getDashboard(course.id)).course.speed_bonus_on).toBe(false);
    expect((await rejection(api.updateCourse(course.id, { speed_bonus_on: "no" as unknown as boolean }))).code).toBe("validation_failed");
    source.setSchoolType("university");
    expect((await api.listCourses()).every((c) => c.speed_bonus_on)).toBe(true);
  });
});

describe("lessons", () => {
  test("two are prepared and not run, and the rest have been run", async () => {
    const lessons = await api.listLessons();
    const prepared = lessons.filter((l) => l.times_run === 0);
    expect(prepared).toHaveLength(2);
    expect(prepared.every((l) => l.last_run_at === null && l.question_count >= 5)).toBe(true);
    const run = lessons.filter((l) => l.times_run > 0);
    expect(run.reduce((n, l) => n + l.times_run, 0)).toBe(18);
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

  test("a draft that is ready has 5 to 8 valid questions of all three kinds, a review summary and a timer for each", async () => {
    const draft = await makeDraft();
    expect(isValidContent(draft)).toBe(true);
    expect(draft.refinements).toEqual([]);
    expect(new Set(draft.questions.map((q) => q.kind)).size).toBe(3);
    expect(draft.questions.every((q) => q.timer_seconds >= 10 && q.explanation)).toBe(true);
    expect(draft.review_summary.length).toBeGreaterThan(40);
    expect(draft.subject).toEqual({ id: "math", name: "Математика" });
  });

  test("it picks the lesson that fits what the teacher wrote", async () => {
    expect((await makeDraft("Логаритми и нивните својства, за третата година со задачи.")).title).toBe("Логаритми");
    expect((await makeDraft("Извод на функција и правилата за наоѓање извод на полином.")).title).toBe("Извод на функција");
    const { source_id } = await api.createSource({ kind: "upload", file: file("Веројатност - работен лист.pdf") });
    expect((await finished(await api.generateLesson({ source_id, subject_id: "math", year: 4 }))).title).toBe("Основи на веројатноста");
  });

  test("the sentence of emphasis is kept, trimmed", async () => {
    expect((await makeDraft(typed, "  Нагласете ги примерите.  ")).emphasis).toBe("Нагласете ги примерите.");
    expect((await makeDraft(typed, "   ")).emphasis).toBeNull();
  });

  test("a source, subject or year that does not exist is refused", async () => {
    expect((await rejection(api.generateLesson({ source_id: "src-none", subject_id: "math", year: 2 }))).code).toBe("not_found");
    const { source_id } = await api.createSource({ kind: "typed", text: typed });
    expect((await rejection(api.generateLesson({ source_id, subject_id: "physics", year: 2 }))).code).toBe("validation_failed");
    expect((await rejection(api.generateLesson({ source_id, subject_id: "math", year: 0 }))).code).toBe("validation_failed");
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
    expect(lesson).toMatchObject({ version: 1, times_run: 0, copied_from: null, title: draft.title, subject: draft.subject, year: 2 });
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
    const changed = await api.updateLesson(run.id, { title: "Нов наслов", review_summary: lesson.review_summary, questions: lesson.questions });
    expect(changed).toMatchObject({ version: 2, title: "Нов наслов", times_run: run.times_run });
    expect((await api.listLessons()).find((l) => l.id === run.id)).toMatchObject({ version: 2, title: "Нов наслов", times_run: run.times_run });
    const [course] = await api.listCourses();
    const dash = await api.getDashboard(course.id);
    expect(dash.sessions.every((s) => s.lesson.version === 1)).toBe(true);
    expect((await rejection(api.updateLesson(run.id, { title: "", review_summary: "", questions: [] }))).code).toBe("validation_failed");
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
    const [course] = await api.listCourses();
    expect((await api.getDashboard(course.id)).sessions).toHaveLength(6);

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
    expect(lessons.some((l) => l.title === "Граници на низи и функции" && l.times_run === 2)).toBe(true);
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
  test("holds the lessons of several colleagues, in more than one subject, each lesson a valid one", async () => {
    const library = await api.listLibrary();
    expect(new Set(library.map((i) => i.owner.id)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(library.map((i) => i.subject.id)).size).toBeGreaterThanOrEqual(2);
    for (const item of library) {
      const lesson = await api.getLesson(item.lesson_id);
      expect(isValidContent(lesson)).toBe(true);
      expect(lesson.subject).toEqual(item.subject);
      expect(lesson.question_count).toBe(item.question_count);
    }
  });

  test("the faculty has its own colleagues and subjects, and none of the school's", async () => {
    const school = await api.listLibrary();
    source.setSchoolType("university");
    const faculty = await api.listLibrary();
    expect(faculty.length).toBeGreaterThanOrEqual(3);
    expect(new Set(faculty.map((i) => i.subject.id)).size).toBeGreaterThanOrEqual(3);
    expect(faculty.some((i) => i.subject.name === "Дискретна математика")).toBe(true);
    expect(faculty.every((i) => !school.some((s) => s.owner.id === "t-avramovska" && i.owner.id === s.owner.id))).toBe(true);
    expect(new Set(faculty.map((i) => i.owner.name))).toContain("Драган Ристевски");
  });

  test("the teacher's courses cover some of the library's subjects, and not all", async () => {
    const courses = await api.listCourses();
    const mine = new Set(courses.map((c) => c.subject.id));
    const library = await api.listLibrary();
    expect(library.some((i) => mine.has(i.subject.id))).toBe(true);
    expect(library.some((i) => !mine.has(i.subject.id))).toBe(true);
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
  test("a lesson that a class is being held with cannot be deleted, and stays", async () => {
    const lesson = (await api.listLessons()).find((l) => l.times_run === 0)!;
    const [course] = await api.listCourses();
    await api.createSession({ lesson_id: lesson.id, course_id: course.id });
    expect((await rejection(api.deleteLesson(lesson.id))).code).toBe("invalid_state");
    expect((await api.listLessons()).some((l) => l.id === lesson.id)).toBe(true);
    // Another lesson can go while one is running.
    const other = (await api.listLessons()).find((l) => l.id !== lesson.id && l.times_run === 0)!;
    await api.deleteLesson(other.id);
    expect((await api.listLessons()).some((l) => l.id === other.id)).toBe(false);
  });

  test("a lesson that was held goes from the list, and the held lessons and their results stay", async () => {
    const held = (await api.listLessons()).find((l) => l.times_run > 0)!;
    const [course] = await api.listCourses();
    const before = await api.getDashboard(course.id);
    await api.deleteLesson(held.id);
    expect((await api.listLessons()).some((l) => l.id === held.id)).toBe(false);
    expect((await rejection(api.getLesson(held.id))).code).toBe("not_found");
    const after = await api.getDashboard(course.id);
    expect(after.sessions).toEqual(before.sessions);
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
    const lesson = await a.saveLesson({ draft_id: draft.id, title: draft.title, review_summary: draft.review_summary, questions: questions as Lesson["questions"] });
    expect(lesson.questions[0].media).toEqual({ id: media.id, url: media.url, alt: "Графикот на парабола" });
    expect((await a.getLesson(lesson.id)).questions[0].media?.alt).toBe("Графикот на парабола");
  });
});

describe("the live lesson", () => {
  /** A lesson started with II-4, and the class as the clock gives it. */
  async function started() {
    const lesson = (await api.listLessons()).find((l) => l.times_run === 0 && l.year === 2)!;
    const course = (await api.listCourses()).find((c) => c.class.year === 2)!;
    return api.createSession({ lesson_id: lesson.id, course_id: course.id });
  }
  const here = <S extends { attendance: string | null }>(c: { students: S[] }) => c.students.filter((s) => s.attendance === "present" || s.attendance === "late");

  test("a lesson that has just been started has its whole class listed, nobody here, the code and every question ready", async () => {
    const c = await started();
    expect(c.session).toMatchObject({ state: "lobby", class_name: "II-4", subject_name: "Математика" });
    expect(c.students).toHaveLength(26);
    expect(c.students.every((s) => s.attendance === null && !s.online)).toBe(true);
    expect(c.join).toMatchObject({ short_code: expect.stringMatching(/^\d{6}$/), token: expect.any(String) });
    expect(c.questions.length).toBeGreaterThanOrEqual(5);
    expect(c.questions.every((q) => q.status === "ready")).toBe(true);
  });

  test("the class joins as time goes by, and a reload finds it where the clock has put it (FR-SES-08)", async () => {
    const first = await started();
    now += 5000;
    const soon = await api.getConsole(first.session.id);
    now += 70_000;
    const later = await api.getConsole(first.session.id);
    expect(here(soon).length).toBeLessThan(here(later).length);
    const share = here(later).length / 26;
    expect(share).toBeGreaterThanOrEqual(0.7);
    expect(share).toBeLessThanOrEqual(0.85);
    // A second read, as a second window or a reload, says the same.
    expect(await api.getConsole(first.session.id)).toEqual(later);
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

  test("the class view holds no student who is not here and none of the console's own data", async () => {
    const c = await started();
    now += 30_000;
    const view = await api.getClassView(c.session.id);
    const console_ = await api.getConsole(c.session.id);
    const absent = console_.students.filter((s) => s.attendance === null);
    expect(absent.length).toBeGreaterThan(0);
    const text = JSON.stringify(view);
    for (const s of absent) expect(text).not.toContain(s.full_name);
    expect(view.session).toMatchObject({ lesson_title: c.session.lesson.title, class_name: "II-4", joined_count: here(console_).length });
    expect(view.join).toEqual(console_.join);
    expect(text).not.toContain("students");
  });

  test("another session, or none, is not found", async () => {
    expect((await rejection(api.getConsole("s-none"))).code).toBe("not_found");
    expect((await rejection(api.getClassView("s-none"))).code).toBe("not_found");
    const c = await started();
    expect((await rejection(api.getConsole(`${c.session.id}x`))).code).toBe("not_found");
  });

  test("the teacher moves the lesson forward, one state at a time, and never back (4.1)", async () => {
    const c = await started();
    expect((await rejection(api.advance(c.session.id, { to: "review" }))).code).toBe("invalid_state");
    const t = await api.advance(c.session.id, { to: "teaching" });
    expect(t.session.state).toBe("teaching");
    expect((await api.getOpenSession()).session?.state).toBe("teaching");
    expect((await rejection(api.advance(c.session.id, { to: "teaching" }))).code).toBe("invalid_state");
    expect((await rejection(api.advance(c.session.id, { to: "lobby" as "teaching" }))).code).toBe("validation_failed");
    expect((await api.advance(c.session.id, { to: "review" })).session.state).toBe("review");
  });

  test("a student who joins after the lesson began is late, and the ones who joined before are not", async () => {
    const c = await started();
    now += 20_000;
    const before = here(await api.getConsole(c.session.id)).map((s) => s.id);
    await api.advance(c.session.id, { to: "teaching" });
    now += 80_000;
    const after = await api.getConsole(c.session.id);
    const late = after.students.filter((s) => s.attendance === "late");
    expect(late.length).toBeGreaterThanOrEqual(1);
    for (const id of before) expect(after.students.find((s) => s.id === id)!.attendance).toBe("present");
    for (const s of late) expect(Date.parse(s.joined_at!)).toBeGreaterThan(Date.parse(after.session.started_at) + 20_000);
  });

  test("a student can be marked present without a phone, with a reason, and the mark can be taken back", async () => {
    const c = await started();
    const target = c.students[0].id;
    const marked = await api.markNoDevice(c.session.id, target, { reason: "battery" });
    expect(marked.students.find((s) => s.id === target)).toMatchObject({ attendance: "present_no_device", no_device_reason: "battery", joined_at: null });
    // It is kept: a reload finds it.
    expect((await api.getConsole(c.session.id)).students.find((s) => s.id === target)).toMatchObject({ attendance: "present_no_device" });
    // A second mark changes the reason.
    const changed = await api.markNoDevice(c.session.id, target, { reason: "no_data" });
    expect(changed.students.find((s) => s.id === target)?.no_device_reason).toBe("no_data");
    const cleared = await api.clearNoDevice(c.session.id, target);
    expect(cleared.students.find((s) => s.id === target)).toMatchObject({ attendance: null, no_device_reason: null });
    // Taking back what is not there is not an error.
    await expect(api.clearNoDevice(c.session.id, target)).resolves.toMatchObject({ session: { id: c.session.id } });
  });

  test("a student marked who then joins with a phone is present, and the reason is gone (the reversal rule)", async () => {
    const c = await started();
    // Somebody who will join later than the moment of the mark: the one who joins last in the lobby.
    now += 5000;
    const quiet = await api.getConsole(c.session.id);
    const waiting = quiet.students.filter((s) => s.attendance === null);
    now += 70_000;
    const done = await api.getConsole(c.session.id);
    const willJoin = waiting.find((s) => done.students.find((d) => d.id === s.id)!.attendance !== null)!;
    // Go back to before they joined, mark them, and let the clock run.
    now = Date.parse(c.session.started_at) + 5000;
    await api.markNoDevice(c.session.id, willJoin.id, { reason: "no_phone" });
    expect((await api.getConsole(c.session.id)).students.find((s) => s.id === willJoin.id)?.attendance).toBe("present_no_device");
    now = Date.parse(c.session.started_at) + 75_000;
    expect((await api.getConsole(c.session.id)).students.find((s) => s.id === willJoin.id)).toMatchObject({ attendance: "present", no_device_reason: null, online: true });
  });

  test("a student who has joined with a phone cannot be marked: the join stands", async () => {
    const c = await started();
    now += 75_000;
    const joined = (await api.getConsole(c.session.id)).students.find((s) => s.attendance === "present")!;
    expect((await rejection(api.markNoDevice(c.session.id, joined.id, { reason: "battery" }))).code).toBe("invalid_state");
  });

  test("a reason that is none of the four, and a student who is not in the class, are refused", async () => {
    const c = await started();
    expect((await rejection(api.markNoDevice(c.session.id, c.students[0].id, { reason: "lazy" as "battery" }))).code).toBe("validation_failed");
    expect((await rejection(api.markNoDevice(c.session.id, "st-nobody", { reason: "battery" }))).code).toBe("not_found");
    expect((await rejection(api.clearNoDevice(c.session.id, "st-nobody"))).code).toBe("not_found");
  });

  test("a computer that is offline cannot move the lesson or mark anyone, and nothing changes", async () => {
    const c = await started();
    vi.stubGlobal("navigator", { onLine: false });
    try {
      expect((await rejection(api.advance(c.session.id, { to: "teaching" }))).code).toBe("network");
      expect((await rejection(api.markNoDevice(c.session.id, c.students[0].id, { reason: "battery" }))).code).toBe("network");
      expect((await rejection(api.clearNoDevice(c.session.id, c.students[0].id))).code).toBe("network");
    } finally {
      vi.unstubAllGlobals();
    }
    const again = await api.getConsole(c.session.id);
    expect(again.session.state).toBe("lobby");
    expect(again.students[0].attendance).toBeNull();
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
  test("ending, the review and the practice set answer not_implemented", async () => {
    const calls: Promise<unknown>[] = [
      api.endSession("s"),
      api.getReview("s"),
      api.createPracticeSet("s"),
    ];
    for (const call of calls) expect((await rejection(call)).code).toBe("not_implemented");
  });

  test("who did a practice set is read from the history", async () => {
    const [course] = await api.listCourses();
    const d = await api.getDashboard(course.id);
    const practice = d.practice[0];
    const results = await api.getPracticeResults(practice.practice_set.session_id);
    expect(results.practice_set.id).toBe(practice.practice_set.id);
    expect(results.students.length).toBe(practice.students);
    expect(results.students.filter((s) => s.completed_at).length).toBe(practice.completed);
    expect((await rejection(api.getPracticeResults("s-none"))).code).toBe("not_found");
  });
});

describe("starting a lesson", () => {
  const prepared = async () => (await api.listLessons()).filter((l) => l.times_run === 0);
  const courseFor = async (lessonYear: number) => (await api.listCourses()).find((c) => c.class.year === lessonYear)!;

  test("nothing is open to begin with, and the answer carries the server's clock", async () => {
    const open = await api.getOpenSession();
    expect(open.session).toBeNull();
    expect(open.server_now).toBe(new Date(NOW).toISOString());
  });

  test("starts in the lobby and answers the console: every question ready, every student of the class not yet in", async () => {
    const [lesson] = await prepared();
    const course = await courseFor(lesson.year);
    const snapshot = await api.createSession({ lesson_id: lesson.id, course_id: course.id });
    expect(snapshot.session).toMatchObject({
      course_id: course.id,
      state: "lobby",
      ended_at: null,
      started_at: new Date(NOW).toISOString(),
      lesson: { id: lesson.id, title: lesson.title, version: 1 },
      class_name: course.class.name,
      subject_name: course.subject.name,
    });
    expect(snapshot.questions).toHaveLength(lesson.question_count);
    expect(snapshot.questions.every((q) => q.status === "ready" && q.fired_at === null && !q.adhoc)).toBe(true);
    expect(snapshot.students).toHaveLength(course.student_count);
    expect(snapshot.students.every((s) => s.attendance === null && !s.online)).toBe(true);
    expect(snapshot.nudge).toBeNull();
  });

  test("GET /sessions/open then returns it, with the names of the class and the subject (AC-END-05)", async () => {
    const [lesson] = await prepared();
    const course = await courseFor(lesson.year);
    const { session } = await api.createSession({ lesson_id: lesson.id, course_id: course.id });
    const open = await api.getOpenSession();
    expect(open.session).toMatchObject({ id: session.id, state: "lobby", class_name: course.class.name, subject_name: "Математика" });
    expect(open.session?.started_at).toBe(new Date(NOW).toISOString());
  });

  test("a second start is refused as session_open (409), whatever the lesson or the class, and nothing changes", async () => {
    const [first, second] = await prepared();
    const [a, b] = await api.listCourses();
    const { session } = await api.createSession({ lesson_id: first.id, course_id: a.id });
    const sameCourse = await rejection(api.createSession({ lesson_id: second.id, course_id: a.id }));
    expect(sameCourse.code).toBe("session_open");
    expect(sameCourse.status).toBe(409);
    expect((await rejection(api.createSession({ lesson_id: second.id, course_id: b.id }))).code).toBe("session_open");
    expect((await api.getOpenSession()).session?.id).toBe(session.id);
  });

  test("a lesson or a class that is not the teacher's is not found, even while a lesson is open", async () => {
    const [lesson] = await prepared();
    const [course] = await api.listCourses();
    expect((await rejection(api.createSession({ lesson_id: "nope", course_id: course.id }))).code).toBe("not_found");
    expect((await rejection(api.createSession({ lesson_id: lesson.id, course_id: "nope" }))).code).toBe("not_found");
    expect((await api.getOpenSession()).session).toBeNull();
  });

  test("the lesson stays prepared until it has been run: starting it does not make it a run lesson", async () => {
    const [lesson] = await prepared();
    const course = await courseFor(lesson.year);
    await api.createSession({ lesson_id: lesson.id, course_id: course.id });
    expect((await prepared()).map((l) => l.id)).toContain(lesson.id);
    expect((await api.listCourses()).find((c) => c.id === course.id)?.lessons_run).toBe(6);
  });

  test("the open lesson is kept with the demo, and each demo school and teacher has their own", async () => {
    const [lesson] = await prepared();
    const course = await courseFor(lesson.year);
    await api.createSession({ lesson_id: lesson.id, course_id: course.id });
    // A page loaded again builds the adapter afresh over the same saved state.
    await expect(build().getOpenSession()).resolves.toMatchObject({ session: { class_name: course.class.name } });
    source.setSchoolType("university");
    expect((await api.getOpenSession()).session).toBeNull();
    source.setSchoolType("school");
    source.setSession("novice");
    expect((await api.getOpenSession()).session).toBeNull();
    source.setSession("veteran");
    expect((await api.getOpenSession()).session).not.toBeNull();
  });

  test("starts at a faculty too, in the group of that subject", async () => {
    source.setSchoolType("university");
    const [lesson] = await prepared();
    const groups = await api.listCourses();
    const group = groups.find((c) => c.subject.id === lesson.subject.id)!;
    const { session } = await api.createSession({ lesson_id: lesson.id, course_id: group.id });
    expect(session.class_name).toBe(group.class.name);
    expect(session.class_name).toMatch(/^Група/);
  });

  test("a saved lesson that is open is read back; one that is damaged or ended is dropped, not trusted", async () => {
    const [lesson] = await prepared();
    const course = await courseFor(lesson.year);
    await api.createSession({ lesson_id: lesson.id, course_id: course.id });
    const saved = JSON.parse(JSON.stringify(source.state()));
    expect(saved.school.session.state).toBe("lobby");
    const { sanitizeState } = await import("@/lib/teacher/api/mock-state");
    expect(sanitizeState(saved, NOW).school.session?.id).toBe(saved.school.session.id);
    for (const damage of [{ state: "ended" }, { started_at: "yesterday" }, { course_id: 7 }, { lesson: null }]) {
      const bad = JSON.parse(JSON.stringify(saved));
      bad.school.session = { ...bad.school.session, ...damage };
      expect(sanitizeState(bad, NOW).school.session).toBeNull();
    }
  });

  test("the demo can show a lesson that is running, twelve minutes in, and close it again", async () => {
    const mock = createMock(source, { delay: () => Promise.resolve() });
    mock.demo.simulateRunning();
    const open = await mock.api.getOpenSession();
    expect(open.session).toMatchObject({ state: "lobby", subject_name: "Математика" });
    expect(Date.parse(open.server_now) - Date.parse(open.session!.started_at)).toBe(12 * 60_000);
    // One lesson at a time: pretending again changes nothing, and a real start is refused.
    const id = open.session!.id;
    mock.demo.simulateRunning();
    expect((await mock.api.getOpenSession()).session?.id).toBe(id);
    const [lesson] = await prepared();
    const [course] = await api.listCourses();
    expect((await rejection(mock.api.createSession({ lesson_id: lesson.id, course_id: course.id }))).code).toBe("session_open");

    mock.demo.closeRunning();
    expect((await mock.api.getOpenSession()).session).toBeNull();
    // Closed, it is a lesson that can be started again.
    expect((await mock.api.createSession({ lesson_id: lesson.id, course_id: course.id })).session.state).toBe("lobby");
  });

  test("the demo can show a running lesson to a teacher who has made no lesson, too", async () => {
    source.setSession("novice");
    const mock = createMock(source, { delay: () => Promise.resolve() });
    mock.demo.simulateRunning();
    const open = await mock.api.getOpenSession();
    expect(open.session?.lesson.title).toBeTruthy();
    expect(open.session?.class_name).toBeTruthy();
  });

  test("starting is refused until somebody is signed in", async () => {
    const [lesson] = await prepared();
    const [course] = await api.listCourses();
    source.setSession(null);
    expect((await rejection(api.createSession({ lesson_id: lesson.id, course_id: course.id }))).code).toBe("unauthenticated");
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

  test("has the same classes and rosters, and has run nothing: no history, no points", async () => {
    const { api } = novice();
    const courses = await api.listCourses();
    expect(courses.map((c) => c.class.name)).toEqual(["II-4", "III-5", "IV-1"]);
    expect(courses.map((c) => c.student_count)).toEqual([26, 24, 28]);
    expect(courses.every((c) => c.lessons_run === 0 && c.last_session_at === null)).toBe(true);
    const d = await api.getDashboard(courses[0].id);
    expect(d.students).toHaveLength(26);
    expect(d.sessions).toEqual([]);
    expect(d.attendance).toEqual([]);
    expect(d.students.every((s) => s.points === 0)).toBe(true);
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
    const saved = await api.saveLesson({ draft_id: draft.id, title: draft.title, review_summary: draft.review_summary, questions: draft.questions as Lesson["questions"] });
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
  const asked = await a.generateLesson({ source_id, subject_id: "math", year: 2 });
  now += GENERATE_MS + 1;
  const read = await a.getDraft(asked.id);
  if (read.status !== "ready") throw new Error("The draft is not ready");
  return read;
}
