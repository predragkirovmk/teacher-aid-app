import { beforeEach, describe, expect, test } from "vitest";
import type { TeacherApi } from "@/lib/teacher/api/client";
import type { ApiError } from "@/lib/teacher/api/errors";
import { createMockApi, memorySource } from "@/lib/teacher/api/mock";
import { eventsBetween } from "@/lib/teacher/api/mock-live";
import { freshState } from "@/lib/teacher/api/mock-state";
import type { ConsoleSnapshot } from "@/lib/teacher/api/types";
import { sortRegister } from "@/lib/teacher/results";

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
  return api.createSession({ lesson_id: lesson.id });
}

/** A lesson with every question sent and ended by its time, so every answer has shown. */
async function allAsked(): Promise<ConsoleSnapshot> {
  const l = await lobby();
  now += 60_000;
  let c = await api.advance(l.session.id, { to: "teaching" });
  for (const q of c.questions) {
    await api.fireQuestion(c.session.id, q.id);
    now += q.question.timer_seconds * 1000 + 1;
    now += 1000;
  }
  c = await api.getConsole(c.session.id);
  return c;
}

describe("a question ends and its answer shows by itself", () => {
  test("open until its time, then revealed with the counts, with no step in between", async () => {
    const l = await lobby();
    now += 60_000;
    const c = await api.advance(l.session.id, { to: "teaching" });
    const first = c.questions[0];
    const sent = await api.fireQuestion(c.session.id, first.id);
    expect(sent.questions[0]).toMatchObject({ status: "open", revealed_at: null, counts: null });
    now += first.question.timer_seconds * 1000 - 1;
    expect((await api.getConsole(c.session.id)).questions[0].status).toBe("open");
    now += 2;
    const over = (await api.getConsole(c.session.id)).questions[0];
    expect(over.status).toBe("revealed");
    expect(over.revealed_at).not.toBeNull();
    expect(over.counts).not.toBeNull();
  });

  test("the class view carries the right answer once the question has ended, and not before", async () => {
    const l = await lobby();
    now += 60_000;
    const c = await api.advance(l.session.id, { to: "teaching" });
    await api.fireQuestion(c.session.id, c.questions[0].id);
    now += 1000;
    const during = await api.getClassView(c.session.id);
    expect(during.question?.status).toBe("open");
    expect(during.reveal).toBeNull();
    now += c.questions[0].question.timer_seconds * 1000;
    const after = await api.getClassView(c.session.id);
    expect(after.question?.status).toBe("revealed");
    expect(after.reveal).toMatchObject({ session_question_id: c.questions[0].id, correct_answer: c.questions[0].question.correct });
  });

  test("there is no call to show the answer, no closed event and no review event", async () => {
    expect("revealQuestion" in api).toBe(false);
    const l = await lobby();
    now += 60_000;
    const c = await api.advance(l.session.id, { to: "teaching" });
    const before = await api.fireQuestion(c.session.id, c.questions[0].id);
    now += c.questions[0].question.timer_seconds * 1000 + 1;
    const after = await api.getConsole(c.session.id);
    for (const channel of ["session.s-n1.public", "session.s-n1.class", "session.s-n1.console"] as const) {
      const types = eventsBetween(before, after, channel).map((e) => e.type);
      expect(types).toContain("question.revealed");
      expect(types).not.toContain("question.closed");
      expect(types).not.toContain("review.ready");
      // The ranking is said before the answer, as the class view shows the answer with the ranking beside it.
      expect(types.indexOf("leaderboard.updated")).toBeLessThan(types.indexOf("question.revealed"));
    }
  });

  test("a question may be skipped while it is ready or open, and not once its answer has shown", async () => {
    const l = await lobby();
    now += 60_000;
    const c = await api.advance(l.session.id, { to: "teaching" });
    expect((await api.skipQuestion(c.session.id, c.questions[0].id)).questions[0].status).toBe("skipped");
    await api.fireQuestion(c.session.id, c.questions[1].id);
    now += 2000;
    expect((await api.skipQuestion(c.session.id, c.questions[1].id)).questions[1].status).toBe("skipped");
    await api.fireQuestion(c.session.id, c.questions[2].id);
    now += c.questions[2].question.timer_seconds * 1000 + 1;
    expect((await rejection(api.skipQuestion(c.session.id, c.questions[2].id))).code).toBe("invalid_state");
  });

  test("a lesson cannot be moved to a review: there is none", async () => {
    const l = await lobby();
    now += 60_000;
    const c = await api.advance(l.session.id, { to: "teaching" });
    expect((await rejection(api.advance(c.session.id, { to: "review" } as never))).code).toBe("validation_failed");
    expect((await rejection(api.advance(c.session.id, { to: "teaching" }))).code).toBe("invalid_state");
  });
});

describe("End", () => {
  test("lists the students who joined, in register order, each with their score", async () => {
    const c = await allAsked();
    const end = await api.endSession(c.session.id);
    expect(end.session.state).toBe("ended");
    expect(end.students.length).toBeGreaterThan(0);
    expect(end.students.length).toBe(c.students.length);
    expect(end.students.map((s) => s.student_id)).toEqual(sortRegister(end.students).map((s) => s.student_id));
    const total = c.questions.length;
    for (const s of end.students) {
      expect(s.asked).toBeLessThanOrEqual(total);
      expect(s.correct).toBeLessThanOrEqual(s.asked);
    }
    // Someone who was in the lesson from the start was put every question, and the class got some of them right.
    expect(end.students.some((s) => s.asked === total)).toBe(true);
    expect(end.students.some((s) => s.correct > 0)).toBe(true);
  });

  test("a student who joined after a question was sent is not asked it", async () => {
    const l = await lobby();
    now += 60_000;
    let c = await api.advance(l.session.id, { to: "teaching" });
    // Students keep joining after the lesson began: those who come in later are asked fewer questions.
    for (const q of c.questions) {
      await api.fireQuestion(c.session.id, q.id);
      now += q.question.timer_seconds * 1000 + 1;
      now += 4 * 60_000;
    }
    c = await api.getConsole(c.session.id);
    const end = await api.endSession(c.session.id);
    const joined = new Map(c.students.map((s) => [s.id, Date.parse(s.joined_at)]));
    for (const s of end.students) {
      const expected = c.questions.filter((q) => Date.parse(q.fired_at as string) >= (joined.get(s.student_id) as number)).length;
      expect(s.asked).toBe(expected);
    }
    expect(new Set(end.students.map((s) => s.asked)).size).toBeGreaterThan(1);
  });

  test("a skipped question and one never sent count for nobody; a quick question counts like any other", async () => {
    const l = await lobby();
    now += 60_000;
    let c = await api.advance(l.session.id, { to: "teaching" });
    await api.skipQuestion(c.session.id, c.questions[0].id);
    c = await api.fireAdhoc(c.session.id, { kind: "true_false", prompt: "Земјата е рамна?", correct: "false", timer_seconds: 15 });
    now += 16_000;
    const end = await api.endSession(c.session.id);
    expect(Math.max(...end.students.map((s) => s.asked))).toBe(1);
    expect(end.students.every((s) => s.asked <= 1 && s.correct <= s.asked)).toBe(true);
  });

  test("a lesson that was ended before any question was sent gives everyone 0 of 0", async () => {
    const l = await lobby();
    now += 20_000;
    const early = await api.getConsole(l.session.id);
    const end = await api.endSession(l.session.id);
    expect(end.students).toHaveLength(early.students.length);
    expect(end.students.every((s) => s.asked === 0 && s.correct === 0)).toBe(true);
  });

  test("the answer is the same SessionReview that is read afterwards, and only then", async () => {
    const c = await allAsked();
    expect((await rejection(api.getReview(c.session.id))).code).toBe("invalid_state");
    const end = await api.endSession(c.session.id);
    expect(Object.keys(end).sort()).toEqual(["server_now", "session", "students"]);
    expect(await api.getReview(c.session.id)).toEqual(end);
  });

  test("closes the lesson everywhere: no open lesson, the console is gone, the projector says it ended", async () => {
    const c = await allAsked();
    await api.endSession(c.session.id);
    expect((await api.getOpenSession()).session).toBeNull();
    expect((await rejection(api.getConsole(c.session.id))).code).toBe("not_found");
    const view = await api.getClassView(c.session.id);
    expect(view.session).toMatchObject({ state: "ended", recent: [] });
    expect(view).toMatchObject({ question: null, board: [], join: null });
    // The lesson is held now, and leads to its end page.
    const held = (await api.listLessons()).find((x) => x.id === c.session.lesson.id)!;
    expect(held).toMatchObject({ times_run: 1, last_session_id: c.session.id });
  });

  test("works from the lobby and from teaching, and a second End is invalid_state with nothing changed", async () => {
    const l = await lobby();
    const end = await api.endSession(l.session.id);
    expect((await rejection(api.endSession(l.session.id))).code).toBe("invalid_state");
    expect(await api.getReview(l.session.id)).toEqual(end);
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

  test("a lesson of the history is read the same way, from the same answers its ranking uses", async () => {
    const held = (await api.listLessons()).find((l) => l.last_session_id !== null)!;
    const review = await api.getReview(held.last_session_id!);
    expect(review.session.state).toBe("ended");
    expect(review.students.length).toBeGreaterThan(0);
    expect(review.students.every((s) => s.correct <= s.asked)).toBe(true);
    expect(review.students.some((s) => s.asked > 0)).toBe(true);
    expect(review.students.map((s) => s.student_id)).toEqual(sortRegister(review.students).map((s) => s.student_id));
    expect(Object.keys(review.students[0]).sort()).toEqual(["asked", "correct", "full_name", "student_id"]);
  });
});
