// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockClient } from "@/lib/app/api/mock";
import { LEADERBOARD } from "@/lib/app/api/mock/data";
import { PRACTICE_MAX, PRACTICE_MIN, PRACTICE_MISS_SHARE, pickPracticeQuestions, practiceDef } from "@/lib/app/api/mock/practice";
import { resetMockSessions } from "@/lib/app/api/mock/session";
import { actions, getState } from "@/lib/app/api/mock/store";
import { QUIZZES } from "@/lib/app/api/mock/quiz";
import { setLocale } from "@/lib/app/locale";
import { PRACTICE_POINTS } from "@/lib/app/practice";
import { PRACTICE_CACHE_KEY, loadSets, recallSets } from "@/lib/app/practice-cache";
import { ApiError } from "@/lib/app/api/errors";
import { createOutbox, type AnswerOutcome, PRACTICE_MAX_AGE_MS } from "@/lib/app/session/outbox";
import { memoryStore } from "@/lib/app/session/outbox-store";
import { net } from "@/lib/app/session/net";

// The app's own wiring (index.ts picks the adapter with a build-time require that vitest cannot resolve): the mock.
vi.mock("@/lib/app/api/index", async () => {
  const { mockClient } = await import("@/lib/app/api/mock");
  return { client: mockClient, serverClient: null };
});
const { sendAnswer } = await import("@/lib/app/session/send");

beforeEach(() => {
  resetMockSessions();
  window.localStorage.clear();
  window.sessionStorage.clear();
  setLocale("mk");
  actions.reset();
  actions.signIn();
});
afterEach(() => {
  net.setForcedOffline(false);
  resetMockSessions();
});

const FRACTIONS = "ps-session-math-1";
const sets = () => mockClient.listPracticeSets();
const fractions = async () => (await sets()).find((s) => s.id === FRACTIONS)!;
const myPoints = () => LEADERBOARD.find((l) => l.me)!.points + getState().quizPoints;

describe("which questions go into a set (OPEN-08)", () => {
  const stat = (id: string, missed: number, joined = 28) => ({ id, missed, joined });

  it("takes every question the class missed by the share, in the order of the lesson", () => {
    // 28 students: 40 % is 11.2, so 12 missing it counts and 11 does not.
    const ids = pickPracticeQuestions([stat("a", 12), stat("b", 3), stat("c", 20), stat("d", 11), stat("e", 14)]);
    expect(ids).toEqual(["a", "c", "e"]);
    expect(12 / 28).toBeGreaterThanOrEqual(PRACTICE_MISS_SHARE);
    expect(11 / 28).toBeLessThan(PRACTICE_MISS_SHARE);
  });

  it("tops a set up to the minimum from the next most missed, but never with a question nobody missed", () => {
    expect(pickPracticeQuestions([stat("a", 2), stat("b", 5), stat("c", 0), stat("d", 1)])).toEqual(["a", "b"]);
    expect(pickPracticeQuestions([stat("a", 0), stat("b", 5), stat("c", 0)])).toEqual(["b"]);
    expect(pickPracticeQuestions([stat("a", 0), stat("b", 0)])).toEqual([]);
    expect(PRACTICE_MIN).toBe(2);
  });

  it("is never longer than a lesson can be", () => {
    const many = Array.from({ length: 10 }, (_, i) => stat(`q${i}`, 28 - i));
    const ids = pickPracticeQuestions(many);
    expect(ids).toHaveLength(PRACTICE_MAX);
    // the least missed two are the ones left out
    expect(ids).not.toContain("q9");
    expect(ids).not.toContain("q8");
  });

  it("breaks a tie for the earlier question", () => {
    expect(pickPracticeQuestions([stat("a", 1), stat("b", 1), stat("c", 1)])).toEqual(["a", "b"]);
  });
});

describe("the sets the demo starts with", () => {
  it("are the fractions set, new, newest first, and an older physics set already finished", async () => {
    const all = await sets();
    expect(all.map((s) => s.id)).toEqual([FRACTIONS, "ps-session-phys-2"]);
    const [maths, physics] = all;
    expect(maths).toMatchObject({ courseId: "math", sessionId: "session-math-1", completedAt: null, score: null, points: 0 });
    expect(maths.questions).toHaveLength(4);
    expect(maths.questions.map((q) => q.kind)).toEqual(["multiple_choice", "multiple_choice", "true_false", "numeric"]);
    expect(maths.questions.every((q) => q.answer === null)).toBe(true);
    expect(physics).toMatchObject({ score: 2, points: 2 * PRACTICE_POINTS });
    expect(physics.completedAt).not.toBeNull();
    expect(physics.questions.map((q) => q.answer?.correct)).toEqual([false, true, true]);
  });

  it("tell nothing about the answers before a question is answered", async () => {
    const body = JSON.stringify((await fractions()).questions);
    expect(body).not.toContain("correctAnswer");
    expect(body).not.toContain("explanation");
  });

  it("are in the student's language, and a numeric question carries its unit", async () => {
    expect((await fractions()).questions[0].prompt).toBe("Колку е 2/3 од 12?");
    setLocale("en");
    expect((await fractions()).questions[0].prompt).toBe("What is 2/3 of 12?");
    const physics = (await sets()).find((s) => s.id === "ps-session-phys-2")!;
    expect(physics.questions[0].numeric).toEqual({ unit: "m/s²", allowNegative: true });
  });

  it("are announced by an alert each, unread while the set is untouched", async () => {
    const notices = (await mockClient.listNotifications()).filter((n) => n.kind === "practice_set_sent");
    expect(notices.map((n) => n.payload.practiceSetId).sort()).toEqual([FRACTIONS, "ps-session-phys-2"]);
    expect(notices.find((n) => n.payload.practiceSetId === FRACTIONS)!.readAt).toBeNull();
    expect(notices.find((n) => n.payload.practiceSetId === "ps-session-phys-2")!.readAt).not.toBeNull();
    await mockClient.submitPracticeAnswers(FRACTIONS, [{ questionId: "pf1", response: "1" }]);
    const after = (await mockClient.listNotifications()).find((n) => n.payload.practiceSetId === FRACTIONS)!;
    expect(after.readAt).not.toBeNull();
  });
});

describe("answering a set", () => {
  it("says right with the reason, and credits the points once", async () => {
    const before = myPoints();
    const attempt = await mockClient.submitPracticeAnswers(FRACTIONS, [{ questionId: "pf1", response: "1" }]);
    expect(attempt).toMatchObject({ score: 1, total: 4, points: PRACTICE_POINTS, completed: false });
    expect(attempt.results).toEqual([
      { questionId: "pf1", duplicate: false, correct: true, correctAnswer: "1", explanation: expect.stringContaining("12") },
    ]);
    expect(myPoints()).toBe(before + PRACTICE_POINTS);
    const set = await fractions();
    expect(set).toMatchObject({ score: 1, points: PRACTICE_POINTS, completedAt: null });
    expect(set.questions[0].answer).toMatchObject({ response: "1", correct: true });
  });

  it("says wrong with the right answer, and earns nothing", async () => {
    const before = myPoints();
    const attempt = await mockClient.submitPracticeAnswers(FRACTIONS, [{ questionId: "pf2", response: "2" }]);
    expect(attempt.results[0]).toMatchObject({ correct: false, correctAnswer: "0" });
    expect(attempt.points).toBe(0);
    expect(myPoints()).toBe(before);
  });

  it("keeps the first answer: a second one is answered with the stored verdict and earns nothing", async () => {
    await mockClient.submitPracticeAnswers(FRACTIONS, [{ questionId: "pf1", response: "0" }]);
    const before = myPoints();
    const again = await mockClient.submitPracticeAnswers(FRACTIONS, [{ questionId: "pf1", response: "1" }]);
    expect(again.results[0]).toMatchObject({ duplicate: true, correct: false, correctAnswer: "1" });
    expect(again.score).toBe(0);
    expect(myPoints()).toBe(before);
    expect((await fractions()).questions[0].answer).toMatchObject({ response: "0", correct: false });
  });

  it("finishes the set with the last answer, with 5 points for each right one", async () => {
    const before = myPoints();
    // right, wrong, right, and a number read with a comma as well as a point
    await mockClient.submitPracticeAnswers(FRACTIONS, [
      { questionId: "pf1", response: "1" },
      { questionId: "pf2", response: "3" },
      { questionId: "pf3", response: "true" },
    ]);
    expect((await fractions()).completedAt).toBeNull();
    const last = await mockClient.submitPracticeAnswers(FRACTIONS, [{ questionId: "pf4", response: "15,0" }]);
    expect(last).toMatchObject({ score: 3, total: 4, points: 3 * PRACTICE_POINTS, completed: true });
    const set = await fractions();
    expect(set.completedAt).not.toBeNull();
    expect(set).toMatchObject({ score: 3, points: 15 });
    expect(set.questions[3].answer).toMatchObject({ response: "15", correct: true });
    expect(myPoints()).toBe(before + 15);
  });

  it("refuses what the question cannot have, and a question that is not the set's, writing nothing", async () => {
    const before = myPoints();
    await expect(mockClient.submitPracticeAnswers(FRACTIONS, [{ questionId: "pf1", response: "1" }, { questionId: "pf3", response: "maybe" }])).rejects.toMatchObject({
      code: "validation_failed",
    });
    await expect(mockClient.submitPracticeAnswers(FRACTIONS, [{ questionId: "pf4", response: "-3" }])).rejects.toMatchObject({ code: "validation_failed" });
    await expect(mockClient.submitPracticeAnswers(FRACTIONS, [{ questionId: "m1", response: "1" }])).rejects.toMatchObject({ code: "not_found" });
    await expect(mockClient.submitPracticeAnswers("ps-nothing", [{ questionId: "pf1", response: "1" }])).rejects.toMatchObject({ code: "not_found" });
    expect((await fractions()).score).toBeNull();
    expect(myPoints()).toBe(before);
  });

  it("is only for a student who is signed in", async () => {
    await mockClient.signOut();
    await expect(sets()).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(mockClient.submitPracticeAnswers(FRACTIONS, [{ questionId: "pf1", response: "1" }])).rejects.toBeInstanceOf(ApiError);
  });

  it("starts again when the demo is started over", async () => {
    await mockClient.submitPracticeAnswers(FRACTIONS, [{ questionId: "pf1", response: "1" }]);
    actions.reset();
    expect((await fractions()).score).toBeNull();
  });
});

describe("a set sent after a lesson", () => {
  it("is built from the lesson's own questions, once, and announced", async () => {
    const ids = QUIZZES.math!.questions.map((q) => q.id);
    actions.addPracticeSet({ id: "ps-x", sessionId: "x", courseId: "math", lessonTitle: "Линеарни равенки", createdAt: Date.now(), questionIds: [ids[2], ids[0]] });
    actions.addPracticeSet({ id: "ps-x", sessionId: "x", courseId: "math", lessonTitle: "again", createdAt: Date.now(), questionIds: [ids[1]] });
    const all = await sets();
    expect(all[0]).toMatchObject({ id: "ps-x", lessonTitle: "Линеарни равенки" });
    expect(all[0].questions.map((q) => q.id)).toEqual([ids[2], ids[0]]);
    expect(all.filter((s) => s.id === "ps-x")).toHaveLength(1);
    const attempt = await mockClient.submitPracticeAnswers("ps-x", [{ questionId: ids[2], response: "3.25" }]);
    expect(attempt.results[0]).toMatchObject({ correct: true, explanation: expect.stringContaining("4x") });
    expect((await mockClient.listNotifications())[0]).toMatchObject({ kind: "practice_set_sent", payload: { practiceSetId: "ps-x" } });
  });

  it("only ever holds questions the mock can grade, with an explanation for the two lessons the demo teaches most", () => {
    for (const quiz of Object.values(QUIZZES)) for (const q of quiz!.questions) expect(practiceDef(q.id), q.id).toBe(q);
    for (const subject of ["math", "physics"] as const) for (const q of QUIZZES[subject]!.questions) expect(q.explanation, q.id).toBeDefined();
  });
});

describe("the history the demo starts with", () => {
  it("has maths topics to draw, getting better, and a lesson in the other subjects", async () => {
    const topics = await mockClient.listTopics();
    const equations = topics.find((t) => t.topic === "Линеарни равенки")!;
    expect(equations.subjectId).toBe("math");
    expect(equations.points.map((p) => p.right)).toEqual([2, 3, 4]);
    const times = equations.points.map((p) => p.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(topics.find((t) => t.topic === "Дропки")!.points).toHaveLength(1);
    expect(new Set(topics.map((t) => t.subjectId))).toEqual(new Set(["math", "physics", "mkd", "english"]));
  });

  it("is in the student's language, and grows by the lesson played", async () => {
    setLocale("en");
    expect((await mockClient.listTopics()).map((t) => t.topic)).toContain("Linear equations");
    actions.finishSession({ sessionId: "played", courseId: "math", lessonTitle: "Linear equations", endedAt: Date.parse("2026-10-24T10:00"), right: 5, total: 5, questions: [] });
    const equations = (await mockClient.listTopics()).find((t) => t.topic === "Linear equations")!;
    expect(equations.points.map((p) => p.right)).toEqual([2, 3, 4, 5]);
    expect((await mockClient.listResults())[0].sessionId).toBe("played");
  });
});

describe("a practice answer in the outbox", () => {
  const record = (over = {}) => ({
    kind: "practice" as const,
    key: "practice:ps-session-math-1:pf1",
    studentId: "student-marko",
    sessionId: FRACTIONS,
    sessionQuestionId: "pf1",
    response: "1",
    answeredAt: Date.now(),
    ...over,
  });
  const outboxOf = () => {
    const outbox = createOutbox({ store: memoryStore(), send: sendAnswer, random: () => 0.5 });
    const heard: AnswerOutcome[] = [];
    outbox.subscribe((o) => heard.push(o));
    return { outbox, heard };
  };

  it("goes to the set's answers and comes back with the server's verdict", async () => {
    const { outbox, heard } = outboxOf();
    await outbox.start("student-marko");
    await outbox.enqueue(record());
    await outbox.flush();
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ type: "delivered", duplicate: false });
    const delivered = heard[0] as Extract<AnswerOutcome, { type: "delivered" }>;
    expect(delivered.receipt?.practice?.results[0]).toMatchObject({ questionId: "pf1", correct: true });
    expect((await fractions()).questions[0].answer?.response).toBe("1");
  });

  it("is saved with no signal, and delivered once it is back, with the same verdict", async () => {
    const { outbox, heard } = outboxOf();
    await outbox.start("student-marko");
    net.setForcedOffline(true);
    await outbox.enqueue(record());
    await outbox.flush();
    expect(heard.at(-1)).toMatchObject({ type: "saved" });
    expect(outbox.pendingOf("student-marko", FRACTIONS, "practice").map((r) => r.sessionQuestionId)).toEqual(["pf1"]);
    expect((await fractions()).score).toBeNull();
    net.setForcedOffline(false);
    await outbox.flush();
    expect(heard.at(-1)).toMatchObject({ type: "delivered", duplicate: false });
    expect(outbox.pendingOf("student-marko", FRACTIONS, "practice")).toEqual([]);
    expect((await fractions()).score).toBe(1);
  });

  it("is a resend of the same answer when it is saved twice, and the first answer stands", async () => {
    const { outbox, heard } = outboxOf();
    await outbox.start("student-marko");
    await outbox.enqueue(record());
    await outbox.flush();
    await outbox.enqueue(record({ response: "0" }));
    await outbox.flush();
    expect(heard.map((h) => h.type === "delivered" && h.duplicate)).toEqual([false, true]);
    expect((await fractions()).questions[0].answer?.response).toBe("1");
  });

  it("is kept far longer than a live answer, which a lesson makes pointless after a day", async () => {
    expect(PRACTICE_MAX_AGE_MS).toBeGreaterThan(7 * 24 * 3_600_000);
  });
});

describe("the sets kept on the phone", () => {
  it("are remembered when the API answers, and used when it cannot be reached", async () => {
    const live = await sets();
    const client = {
      listPracticeSets: async () => live,
    } as Parameters<typeof loadSets>[0];
    expect(await loadSets(client)).toEqual(live);
    expect(recallSets()).toEqual(live);
    const down = { listPracticeSets: async () => Promise.reject(new ApiError("network")) } as Parameters<typeof loadSets>[0];
    expect(await loadSets(down)).toEqual(live);
  });

  it("are not used to hide any other failure, or when nothing was kept", async () => {
    const refused = { listPracticeSets: async () => Promise.reject(new ApiError("unauthenticated")) } as Parameters<typeof loadSets>[0];
    await expect(loadSets(refused)).rejects.toMatchObject({ code: "unauthenticated" });
    const down = { listPracticeSets: async () => Promise.reject(new ApiError("network")) } as Parameters<typeof loadSets>[0];
    window.localStorage.removeItem(PRACTICE_CACHE_KEY);
    await expect(loadSets(down)).rejects.toMatchObject({ code: "network" });
  });
});
