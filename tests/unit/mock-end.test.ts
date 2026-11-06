import { beforeEach, describe, expect, test } from "vitest";
import type { TeacherApi } from "@/lib/teacher/api/client";
import type { ApiError } from "@/lib/teacher/api/errors";
import { createMockApi, memorySource } from "@/lib/teacher/api/mock";
import { eventsBetween, planClass } from "@/lib/teacher/api/mock-live";
import { freshState } from "@/lib/teacher/api/mock-state";
import type { ChannelEvent, ConsoleSnapshot, TeacherChannel } from "@/lib/teacher/api/types";
import { applyClassEvent } from "@/lib/teacher/live";
import { tallyOf } from "@/lib/teacher/attendance";
import { selectPracticeQuestions } from "@/lib/teacher/scoring";

const NOW = new Date(2026, 9, 29, 9, 0).getTime();
const ANCHOR = new Date(2026, 9, 29).getTime();

let source: ReturnType<typeof memorySource>;
let api: TeacherApi;
let now = NOW;

beforeEach(() => {
  now = NOW;
  source = memorySource(freshState(ANCHOR), { now: () => now });
  api = createMockApi(source, { delay: () => Promise.resolve() });
});

const rejection = async (p: Promise<unknown>): Promise<ApiError> => {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("It did not reject");
};

async function lobby(): Promise<ConsoleSnapshot> {
  const [lesson] = (await api.listLessons()).filter((l) => l.times_run === 0);
  const course = (await api.listCourses()).find((c) => c.class.year === lesson.year)!;
  return api.createSession({ lesson_id: lesson.id, course_id: course.id });
}

/** A lesson with every question sent, closed and shown, ready to be moved to the review. */
async function allAsked(): Promise<ConsoleSnapshot> {
  const l = await lobby();
  now += 60_000;
  let c = await api.advance(l.session.id, { to: "teaching" });
  for (const q of c.questions) {
    await api.fireQuestion(c.session.id, q.id);
    now += q.question.timer_seconds * 1000 + 1;
    c = await api.revealQuestion(c.session.id, q.id);
    now += 1000;
  }
  return c;
}

describe("moving to the review", () => {
  test("is refused while a question is open, and is allowed with questions unsent", async () => {
    const l = await lobby();
    now += 60_000;
    const c = await api.advance(l.session.id, { to: "teaching" });
    await api.fireQuestion(c.session.id, c.questions[0].id);
    expect((await rejection(api.advance(c.session.id, { to: "review" }))).code).toBe("question_open");
    now += c.questions[0].question.timer_seconds * 1000 + 1;
    expect((await api.advance(c.session.id, { to: "review" })).session.state).toBe("review");
  });

  test("the review is read only in review, with the names of who asked; the projector's has the text alone", async () => {
    const c = await allAsked();
    expect((await rejection(api.getReview(c.session.id))).code).toBe("invalid_state");
    await api.advance(c.session.id, { to: "review" });
    const review = await api.getReview(c.session.id);
    expect(review.attendance).toBeNull();
    expect(review.most_missed.length).toBeGreaterThan(0);
    const shares = review.most_missed.map((m) => m.missed / m.joined);
    expect(shares).toEqual([...shares].sort((a, b) => b - a));
    expect(review.most_missed[0]).toMatchObject({ correct_answer: expect.any(String) });
    expect(review.anon_questions.every((a) => a.sender.name)).toBe(true);

    const view = await api.getClassView(c.session.id);
    expect(view.review?.most_missed).toEqual(review.most_missed);
    // The review on the projector holds no sender: the board and the last joined may name a student, the questions never say who asked.
    expect(JSON.stringify(view.review)).not.toContain("sender");
    for (const a of review.anon_questions) expect(JSON.stringify(view.review)).not.toContain(a.sender.name);
  });
});

describe("the anonymous text and the channels", () => {
  /** The events of the move to the review, for each channel, from one lesson. */
  const events = async (...channels: TeacherChannel[]): Promise<ChannelEvent[][]> => {
    const c = await allAsked();
    const before = await api.getConsole(c.session.id);
    const after = await api.advance(c.session.id, { to: "review" });
    return channels.map((channel) => eventsBetween(before, after, channel));
  };

  test("review.ready goes to the class and console channels, text only, and never to the public one", async () => {
    const [forClass, forConsole] = await events("session.s-n1.class", "session.s-n1.console");
    const ready = forClass.find((e) => e.type === "review.ready");
    expect(ready).toBeDefined();
    if (ready?.type !== "review.ready") throw new Error("no event");
    expect(ready.anon_questions.length).toBeGreaterThan(0);
    for (const a of ready.anon_questions) expect(Object.keys(a).sort()).toEqual(["id", "text"]);

    expect(forConsole.some((e) => e.type === "review.ready")).toBe(true);
  });

  test("a student never reads it: the public channel carries state.changed and nothing with a text", async () => {
    const [pub] = await events("session.s-n1.public");
    expect(pub.some((e) => e.type === "state.changed")).toBe(true);
    expect(pub.some((e) => e.type === "review.ready")).toBe(false);
    expect(JSON.stringify(pub)).not.toMatch(/anon_questions|sender/);
  });

  test("the projector's snapshot takes the review from the event, and loses it with the end", async () => {
    const [forClass] = await events("session.s-n1.class");
    let view = await api.getClassView("s-n1");
    view = { ...view, review: null, session: { ...view.session, state: "teaching" } };
    for (const e of forClass) view = applyClassEvent(view, e);
    expect(view.session.state).toBe("review");
    expect(view.review?.anon_questions.length).toBeGreaterThan(0);
    view = applyClassEvent(view, { type: "state.changed", state: "ended", channel: "session.s-n1.class", server_now: new Date(now).toISOString() });
    expect(view).toMatchObject({ review: null, board: [], join: null, session: { state: "ended", recent: [] } });
  });
});

describe("End", () => {
  test("writes the register: joined, late, marked without a phone with the reason, and the rest absent", async () => {
    const l = await lobby();
    now += 20_000;
    const planned = new Set(planClass(l.session.id, l.students.map((s) => s.id)).map((p) => p.id));
    const waiting = l.students.filter((s) => !planned.has(s.id));
    await api.markNoDevice(l.session.id, waiting[0].id, { reason: "battery" });
    now += 40_000;
    await api.advance(l.session.id, { to: "teaching" });
    now += 60_000;
    const end = await api.endSession(l.session.id);
    expect(end.session.state).toBe("ended");
    expect(end.attendance).toHaveLength(l.students.length);
    expect(end.tally).toEqual(tallyOf(end.attendance));
    const marked = end.attendance.find((a) => a.student_id === waiting[0].id)!;
    expect(marked).toMatchObject({ status: "present_no_device", no_device_reason: "battery", marked_by: "teacher" });
    expect(end.attendance.filter((a) => a.status === "absent").every((a) => a.marked_by === "system" && a.joined_at === null)).toBe(true);
    expect(end.tally.absent).toBeGreaterThan(0);
    expect(end.tally.late).toBeGreaterThanOrEqual(0);
  });

  test("closes the lesson everywhere: no open lesson, the console is gone, the projector says it ended, the review holds the register", async () => {
    const c = await allAsked();
    await api.advance(c.session.id, { to: "review" });
    const end = await api.endSession(c.session.id);
    expect((await api.getOpenSession()).session).toBeNull();
    expect((await rejection(api.getConsole(c.session.id))).code).toBe("not_found");
    const view = await api.getClassView(c.session.id);
    expect(view.session).toMatchObject({ state: "ended", recent: [] });
    expect(view).toMatchObject({ question: null, board: [], review: null, join: null });
    const review = await api.getReview(c.session.id);
    expect(review.attendance).toEqual(end.attendance);
    expect(review.most_missed).toEqual(end.most_missed);
    // The lesson is held now, and leads to its end page.
    const held = (await api.listLessons()).find((x) => x.id === c.session.lesson.id)!;
    expect(held).toMatchObject({ times_run: 1, last_session_id: c.session.id });
  });

  test("works from the lobby and from teaching, and a second End is invalid_state with nothing changed", async () => {
    const l = await lobby();
    const end = await api.endSession(l.session.id);
    expect(end.most_missed).toEqual([]);
    expect((await rejection(api.endSession(l.session.id))).code).toBe("invalid_state");
    expect((await api.getReview(l.session.id)).attendance).toEqual(end.attendance);
    // Another lesson can be started now.
    expect((await lobby()).session.state).toBe("lobby");
  });

  test("a network that is down is a failure and the lesson is still open", async () => {
    const l = await lobby();
    const offline = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
    try {
      expect((await rejection(api.endSession(l.session.id))).code).toBe("network");
    } finally {
      if (offline) Object.defineProperty(globalThis, "navigator", offline);
      else Reflect.deleteProperty(globalThis, "navigator");
    }
    expect((await api.getOpenSession()).session?.id).toBe(l.session.id);
  });

  test("a lesson of the history can be read the same way", async () => {
    const [course] = await api.listCourses();
    const dash = await api.getDashboard(course.id);
    const review = await api.getReview(dash.sessions[0].id);
    expect(review.session.state).toBe("ended");
    expect(review.attendance?.length).toBeGreaterThan(0);
    expect(review.most_missed.every((m) => m.missed > 0)).toBe(true);
  });
});

describe("the practice set", () => {
  test("is made from what was missed, one per session, and not before End", async () => {
    const c = await allAsked();
    expect((await rejection(api.createPracticeSet(c.session.id))).code).toBe("invalid_state");
    await api.advance(c.session.id, { to: "review" });
    const end = await api.endSession(c.session.id);
    const expected = selectPracticeQuestions(end.most_missed.map((m) => ({ id: m.session_question_id, order: m.order, skipped: false, joined: m.joined, missed: m.missed })));
    const made = await api.createPracticeSet(c.session.id);
    expect(made.practice_set).toMatchObject({ session_id: c.session.id, question_count: expected.length });
    expect(expected.length).toBeGreaterThanOrEqual(1);
    expect((await api.createPracticeSet(c.session.id)).practice_set?.id).toBe(made.practice_set?.id);
    const results = await api.getPracticeResults(c.session.id);
    expect(results.students).toHaveLength(end.attendance.length);
    expect(results.students.every((s) => s.completed_at === null)).toBe(true);
  });

  test("nothing missed means no set, and nothing to read", async () => {
    const l = await lobby();
    await api.endSession(l.session.id);
    expect(await api.createPracticeSet(l.session.id)).toEqual({ practice_set: null });
    expect((await rejection(api.getPracticeResults(l.session.id))).code).toBe("not_found");
  });

  test("a skipped question and one never sent are in neither the review nor the set; a quick question counts like any other", async () => {
    const l = await lobby();
    now += 60_000;
    let c = await api.advance(l.session.id, { to: "teaching" });
    await api.skipQuestion(c.session.id, c.questions[0].id);
    c = await api.fireAdhoc(c.session.id, { kind: "true_false", prompt: "Земјата е рамна?", correct: "false", timer_seconds: 15 });
    const quick = c.questions.find((q) => q.adhoc)!;
    now += 16_000;
    await api.revealQuestion(c.session.id, quick.id);
    const end = await api.endSession(c.session.id);
    const ids = end.most_missed.map((m) => m.session_question_id);
    expect(ids).not.toContain(c.questions[0].id);
    for (const q of c.questions.filter((x) => !x.adhoc)) expect(ids).not.toContain(q.id);
    // The quick question's topic is the lesson's title.
    for (const m of end.most_missed) expect(m.topic).toBeTruthy();
    const counted = await api.getConsole(c.session.id).catch(() => null);
    expect(counted).toBeNull();
  });

  test("some students finish over time, from the clock, and nobody is given points", async () => {
    const c = await allAsked();
    await api.advance(c.session.id, { to: "review" });
    await api.endSession(c.session.id);
    await api.createPracticeSet(c.session.id);
    now += 60 * 60_000;
    const later = await api.getPracticeResults(c.session.id);
    const done = later.students.filter((s) => s.completed_at !== null);
    expect(done.length).toBeGreaterThan(2);
    expect(done.length).toBeLessThan(later.students.length);
    expect(done.every((s) => s.score !== null && s.score <= later.practice_set.question_count)).toBe(true);
    // The same clock gives the same answer.
    expect(await api.getPracticeResults(c.session.id)).toEqual(later);
  });
});
