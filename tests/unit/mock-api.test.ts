import { beforeEach, describe, expect, test } from "vitest";
import { ApiError } from "@/lib/teacher/api/errors";
import { createMock, createMockApi, memorySource } from "@/lib/teacher/api/mock";
import { freshState } from "@/lib/teacher/api/mock-state";
import type { TeacherApi } from "@/lib/teacher/api/client";
import type { Lesson, LessonDraft, QuestionKind } from "@/lib/teacher/api/types";
import { isValidContent } from "@/lib/teacher/lessons";

const NOW = new Date(2026, 9, 29, 9, 0).getTime();
const ANCHOR = new Date(2026, 9, 29).getTime();

let source: ReturnType<typeof memorySource>;
let api: TeacherApi;
const build = () => createMockApi(source, { delay: () => Promise.resolve() });

beforeEach(() => {
  source = memorySource(freshState(ANCHOR), { now: () => NOW });
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

async function makeDraft(text = typed, emphasis?: string): Promise<LessonDraft> {
  const { source_id } = await api.createSource({ kind: "typed", text });
  return api.generateLesson({ source_id, subject_id: "math", year: 2, emphasis });
}

const saveRequest = (draft: LessonDraft) => ({
  draft_id: draft.id,
  title: draft.title,
  review_summary: draft.review_summary,
  questions: draft.questions,
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
  test("typed sentences are taken, and a text that is too short is refused with a reason", async () => {
    expect((await api.createSource({ kind: "typed", text: typed })).source_id).toMatch(/^src-/);
    const error = await rejection(api.createSource({ kind: "typed", text: "Кратко." }));
    expect(error.code).toBe("validation_failed");
    expect(error.reason).toBe("text_too_short");
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

  test("a draft has 5 to 8 valid questions of all three kinds, a review summary and a timer for each", async () => {
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
    expect((await api.generateLesson({ source_id, subject_id: "math", year: 4 })).title).toBe("Основи на веројатноста");
  });

  test("the sentence of emphasis is kept, trimmed", async () => {
    expect((await makeDraft(typed, "  Нагласете ги примерите.  ")).emphasis).toBe("Нагласете ги примерите.");
    expect((await makeDraft(typed, "   ")).emphasis).toBeNull();
  });

  test("the AI can be made to fail with [fail], so the failure screen can be tried", async () => {
    const { source_id } = await api.createSource({ kind: "typed", text: `${typed} [fail]` });
    expect((await rejection(api.generateLesson({ source_id, subject_id: "math", year: 2 }))).code).toBe("generation_failed");
    expect((await rejection(makeDraft(typed, "[fail]"))).code).toBe("generation_failed");
  });

  test("a source, subject or year that does not exist is refused", async () => {
    expect((await rejection(api.generateLesson({ source_id: "src-none", subject_id: "math", year: 2 }))).code).toBe("not_found");
    const { source_id } = await api.createSource({ kind: "typed", text: typed });
    expect((await rejection(api.generateLesson({ source_id, subject_id: "physics", year: 2 }))).code).toBe("validation_failed");
    expect((await rejection(api.generateLesson({ source_id, subject_id: "math", year: 0 }))).code).toBe("validation_failed");
  });

  test("the generation waits as the AI does, and the wait can be set", async () => {
    const waits: number[] = [];
    const slow = createMockApi(source, { delay: async (ms) => void waits.push(ms) });
    const { source_id } = await slow.createSource({ kind: "typed", text: typed });
    const draft = await slow.generateLesson({ source_id, subject_id: "math", year: 2 });
    await slow.refineDraft(draft.id, "easier");
    expect(waits).toEqual([1600, 900]);
  });

  test("a draft is found again by its id, as after a reload", async () => {
    const draft = await makeDraft();
    expect(await build().getDraft(draft.id)).toEqual(draft);
    expect((await rejection(api.getDraft("d-none"))).code).toBe("not_found");
  });
});

describe("refining a draft (FR-LES-08)", () => {
  test("Shorter timers shortens every timer, to no less than 10 seconds", async () => {
    const draft = await makeDraft();
    const refined = await api.refineDraft(draft.id, "shorter_timers");
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
    draft = await api.refineDraft(draft.id, "more_questions");
    expect(draft.questions.length).toBeGreaterThan(before);
    for (let i = 0; i < 3; i++) draft = await api.refineDraft(draft.id, "more_questions");
    expect(draft.questions.length).toBeLessThanOrEqual(8);
    expect(isValidContent(draft)).toBe(true);
    expect(draft.refinements).toHaveLength(4);
    expect(new Set(draft.questions.map((q) => q.prompt)).size).toBe(draft.questions.length);
    expect(draft.questions.map((q) => q.order)).toEqual(draft.questions.map((_, i) => i));
  });

  test("Easier and Harder change the questions or the timers, and keep the draft valid", async () => {
    const draft = await makeDraft();
    const easier = await api.refineDraft(draft.id, "easier");
    const harder = await api.refineDraft(draft.id, "harder");
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
    const edited = draft.questions.map((q, i) => (i === 0 ? { ...q, prompt: "Едно друго прашање?", timer_seconds: 40 } : q));
    const lesson = await api.saveLesson({ ...saveRequest(draft), title: "  Мој наслов ", questions: edited });
    expect(lesson.title).toBe("Мој наслов");
    expect(lesson.questions[0]).toMatchObject({ prompt: "Едно друго прашање?", timer_seconds: 40 });
  });

  test("a draft is saved once, and a lesson that is not valid is refused", async () => {
    const draft = await makeDraft();
    expect((await rejection(api.saveLesson({ ...saveRequest(draft), questions: draft.questions.slice(0, 4) }))).code).toBe("validation_failed");
    expect((await rejection(api.saveLesson({ ...saveRequest(draft), title: "  " }))).code).toBe("validation_failed");
    await api.saveLesson(saveRequest(draft));
    expect((await rejection(api.saveLesson(saveRequest(draft)))).code).toBe("not_found");
    expect((await rejection(api.getDraft(draft.id))).code).toBe("not_found");
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
    expect(library).toHaveLength(3);
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

describe("what is not built yet", () => {
  test("the rest of the live lesson answers not_implemented", async () => {
    const calls: Promise<unknown>[] = [
      api.getConsole("s"),
      api.getClassView("s"),
      api.advance("s", { to: "teaching" }),
      api.fireQuestion("s", "q"),
      api.revealQuestion("s", "q"),
      api.skipQuestion("s", "q"),
      api.fireAdhoc("s", { kind: "true_false", prompt: "?", correct: null, timer_seconds: 15 }),
      api.markNoDevice("s", "st", { reason: "battery" }),
      api.markAnonAnswered("s", "a"),
      api.endSession("s"),
      api.getReview("s"),
      api.createPracticeSet("s"),
      api.uploadMedia(new Blob(["x"])),
    ];
    for (const call of calls) expect((await rejection(call)).code).toBe("not_implemented");
    expect(() => api.openChannel("session.s.public", () => {})).toThrowError(ApiError);
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
    expect(snapshot.nudge).toBe(false);
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
    const s = memorySource(freshState(ANCHOR), { now: () => NOW, persona: "novice" });
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
    const saved = await api.saveLesson({ draft_id: draft.id, title: draft.title, review_summary: draft.review_summary, questions: draft.questions });
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
async function makeDraftWith(a: TeacherApi): Promise<LessonDraft> {
  const { source_id } = await a.createSource({ kind: "typed", text: typed });
  return a.generateLesson({ source_id, subject_id: "math", year: 2 });
}
