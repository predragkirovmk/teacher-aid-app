// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockClient, mockClient } from "@/lib/app/api/mock";
import { CLASSMATES, CORRECT_POINTS, DURATION, QUIZZES, SPEED_POINTS, speedBonus } from "@/lib/app/api/mock/quiz";
import { ANSWER_GRACE_MS, SCRIPT, SKEW_MS, joinMock, mockSessionFor, mockTransport, resetMockSessions, serverNow, type MockSession } from "@/lib/app/api/mock/session";
import { actions, getState } from "@/lib/app/api/mock/store";
import { iso } from "@/lib/app/api/wire";
import { setLocale } from "@/lib/app/locale";
import type { RealtimeMessage } from "@/lib/app/session/transport";
import { createSessionHandle } from "@/lib/app/session/controller";
import { net } from "@/lib/app/session/net";
import { createOutbox } from "@/lib/app/session/outbox";
import { memoryStore } from "@/lib/app/session/outbox-store";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-20T08:00:00Z"));
  // Nothing random: every classmate answers at the same moment, and the same ones are right.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  window.localStorage.clear();
  window.sessionStorage.clear();
  setLocale("mk");
  actions.reset();
  actions.signIn();
  resetMockSessions();
});
afterEach(() => {
  resetMockSessions();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const quiz = QUIZZES.math!;
const first = quiz.questions[0];
const right = first.kind === "mc" ? String(first.answer) : first.answer === 0 ? "true" : "false";
const wrong = first.kind === "mc" ? String((first.answer + 1) % 4) : first.answer === 0 ? "false" : "true";
const dur = DURATION[first.kind];

/** Join the maths lesson and record everything the server says. */
function lesson(code = "MATH-7B") {
  const joined = joinMock(code, "mk");
  const session = mockSessionFor(joined.session.id)!;
  const heard: RealtimeMessage[] = [];
  session.listen((m) => heard.push(m));
  return { joined, session, heard, types: () => heard.map((m) => m.type) };
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** Run to the moment question 1 opens: the lobby, then the teacher's first question. */
const toFirstQuestion = () => advance(SCRIPT.start);

const answer = (s: MockSession, response: string, afterMs: number, key = "k") => {
  const q = s.studentState().question!;
  return s.submit({ sessionQuestionId: q.id, response, answeredAt: q.firedAt! + afterMs, idempotencyKey: key });
};

describe("the points", () => {
  it("are 10 and 5", () => {
    expect([CORRECT_POINTS, SPEED_POINTS]).toEqual([10, 5]);
  });

  it("give the whole speed bonus for an instant answer, none at the buzzer, and round in between", () => {
    expect(speedBonus(dur, dur)).toBe(5);
    expect(speedBonus(0, dur)).toBe(0);
    expect(speedBonus(dur / 2, dur)).toBe(3);
    expect(speedBonus(dur / 4, dur)).toBe(1);
    expect(speedBonus(dur * 0.9, dur)).toBe(5);
  });

  it("give a question 20 seconds, a true-or-false 15 and a number 30", () => {
    expect(DURATION).toEqual({ mc: 20_000, tf: 15_000, num: 30_000 });
  });
});

describe("answering a question", () => {
  /** Run until the open question has closed, and not a moment longer (the next one opens 8 seconds later). */
  const closeAfter = async (s: MockSession) => {
    for (let i = 0; i < 250 && s.studentState().question?.status === "open"; i++) await advance(100);
  };

  it("earns 15 for a right answer at once", async () => {
    const l = lesson();
    await toFirstQuestion();
    answer(l.session, right, 0);
    await closeAfter(l.session);
    expect(l.session.studentState().result).toMatchObject({ correct: true, speedBonus: 5, points: 15 });
    expect(l.session.studentState().sessionPoints).toBe(15);
  });

  it("earns less bonus the later the answer", async () => {
    const half = lesson();
    await toFirstQuestion();
    answer(half.session, right, dur / 2);
    await closeAfter(half.session);
    expect(half.session.studentState().result).toMatchObject({ speedBonus: 3, points: 13 });
  });

  it("earns nothing for a wrong answer, however fast", async () => {
    const l = lesson();
    await toFirstQuestion();
    answer(l.session, wrong, 0);
    await closeAfter(l.session);
    expect(l.session.studentState().result).toMatchObject({ correct: false, speedBonus: 0, points: 0 });
  });

  it("earns nothing for no answer, and still tells the student", async () => {
    const l = lesson();
    await toFirstQuestion();
    await closeAfter(l.session);
    expect(l.session.studentState().result).toMatchObject({ correct: false, points: 0 });
    expect(l.types()).toContain("question.result");
  });

  it("keeps the first answer: a second one is refused", async () => {
    const l = lesson();
    await toFirstQuestion();
    answer(l.session, wrong, 100, "a");
    expect(() => answer(l.session, right, 200, "b")).toThrowError(expect.objectContaining({ code: "already_answered" }));
    await closeAfter(l.session);
    expect(l.session.studentState().result?.correct).toBe(false);
  });

  it("counts the same key once", async () => {
    const l = lesson();
    await toFirstQuestion();
    expect(answer(l.session, right, 100, "same")).toEqual({ accepted: true, duplicate: false });
    expect(answer(l.session, right, 100, "same")).toEqual({ accepted: true, duplicate: true });
  });

  it("refuses an answer whose own time is past the question's end and the grace", async () => {
    const l = lesson();
    await toFirstQuestion();
    const q = l.session.studentState().question!;
    await closeAfter(l.session);
    expect(() =>
      l.session.submit({ sessionQuestionId: q.id, response: right, answeredAt: q.closesAt! + ANSWER_GRACE_MS + 1, idempotencyKey: "late" }),
    ).toThrowError(expect.objectContaining({ code: "question_closed" }));
  });

  it("counts an answer that arrives after the question closed but was given inside its window (BR-NET-01)", async () => {
    const l = lesson();
    await toFirstQuestion();
    const q = l.session.studentState().question!;
    await closeAfter(l.session);
    expect(l.session.studentState().result).toMatchObject({ correct: false, points: 0 });
    l.session.submit({ sessionQuestionId: q.id, response: right, answeredAt: q.firedAt! + 2000, idempotencyKey: "late" });
    // Worked out again with the time the student gave, and sent to them as a corrected result.
    const speed = speedBonus(dur - 2000, dur);
    expect(l.session.studentState().result).toMatchObject({ correct: true, speedBonus: speed, points: CORRECT_POINTS + speed });
    expect(l.session.studentState().sessionPoints).toBe(CORRECT_POINTS + speed);
    // This question's result, then its correction.
    expect(l.types().filter((t) => t === "question.result")).toHaveLength(2);
    expect(l.session.studentState().myResponse).toBe(right);
  });

  it("counts a late answer to a question the class has moved on from", async () => {
    const l = lesson();
    await toFirstQuestion();
    const first = l.session.studentState().question!;
    await closeAfter(l.session);
    await advance(SCRIPT.next + 100);
    expect(l.session.studentState().question!.id).not.toBe(first.id);
    l.session.submit({ sessionQuestionId: first.id, response: right, answeredAt: first.firedAt! + 1000, idempotencyKey: "old" });
    expect(l.session.studentState().sessionPoints).toBeGreaterThan(0);
  });

  it("refuses a response the question cannot have", async () => {
    const l = lesson();
    await toFirstQuestion();
    expect(() => answer(l.session, "9", 0)).toThrowError(expect.objectContaining({ code: "validation_failed" }));
  });

  it("clamps the answer time to the question's window", async () => {
    const l = lesson();
    await toFirstQuestion();
    // A phone claiming it answered a minute before the question opened gets the full bonus, not more.
    answer(l.session, right, -60_000);
    await closeAfter(l.session);
    expect(l.session.studentState().result?.points).toBe(15);
  });

  it("closes early when the student and everyone else have answered", async () => {
    const l = lesson();
    await toFirstQuestion();
    answer(l.session, right, 1000);
    await advance(8000);
    expect(l.types()).toContain("question.closed");
    expect(l.session.studentState().question?.status).not.toBe("open");
  });

  it("is not cut short by the timer of the question before it", async () => {
    const l = lesson();
    await toFirstQuestion();
    answer(l.session, right, 0);
    // Question 1 closes early, at about 8.5 s; question 2 opens 8.6 s later, before question 1's own 20 s would have run out.
    await advance(dur + 500);
    const q = l.session.studentState().question!;
    expect(q.index).toBe(1);
    expect(q.status).toBe("open");
    // Question 1 closed once.
    expect(l.types().filter((t) => t === "question.closed")).toHaveLength(1);
  });

  it("keeps the question open while a classmate has not answered", async () => {
    const l = lesson();
    await toFirstQuestion();
    await advance(1500);
    expect(l.session.studentState().question?.status).toBe("open");
  });

  it("ranks a tie in the student's favour, and moves the student up as points come", async () => {
    const l = lesson();
    await toFirstQuestion();
    answer(l.session, right, 0);
    await closeAfter(l.session);
    const s = l.session.studentState();
    expect(s.sessionRank).toBeGreaterThanOrEqual(1);
    expect(s.board?.find((r) => r.studentId === "student-marko")?.rank).toBe(s.sessionRank);
    expect(s.board).toHaveLength(CLASSMATES.length + 1);
  });
});

describe("the script", () => {
  it("fills the lobby, starts, and plays one question at a time to the end", async () => {
    const l = lesson();
    expect(l.joined.session).toMatchObject({ state: "lobby", courseId: "math", questionCount: quiz.questions.length });
    await advance(SCRIPT.lobbyTick * 3 + 10);
    expect(l.types().filter((t) => t === "joined.count").length).toBeGreaterThanOrEqual(3);
    expect(l.session.studentState().session.joinedCount).toBeGreaterThan(10);

    // Never answering: the script still runs to the end by itself.
    await advance(15 * 60_000);
    const types = l.types();
    const all = quiz.questions.length;
    expect(types.filter((t) => t === "question.opened")).toHaveLength(all);
    expect(types.filter((t) => t === "question.closed")).toHaveLength(all);
    expect(types.filter((t) => t === "question.revealed")).toHaveLength(all);
    expect(types.filter((t) => t === "question.result")).toHaveLength(all);
    // In order: opened, closed, result, revealed for each question, then review, then the end.
    const per = types.filter((t) => ["question.opened", "question.closed", "question.result", "question.revealed"].includes(t));
    expect(per.slice(0, 4)).toEqual(["question.opened", "question.closed", "question.result", "question.revealed"]);
    expect(types.indexOf("state.changed")).toBeGreaterThan(-1);
    expect(types.at(-1)).toBe("session.ended");
    const states = l.heard.filter((m) => m.type === "state.changed").map((m) => (m.data as { state: string }).state);
    expect(states).toEqual(["teaching", "review", "ended"]);
    expect(l.session.studentState()).toMatchObject({ session: { state: "ended" }, summary: { right: 0, total: quiz.questions.length } });
  });

  it("never puts the right answer in a question being asked, and gives it only at the reveal", async () => {
    const l = lesson();
    await advance(15 * 60_000);
    for (const m of l.heard) {
      const body = JSON.stringify(m.data);
      if (m.type === "question.opened") expect(body).not.toContain("correct");
      if (m.type === "question.result") expect((m.data as { correct_answer: unknown }).correct_answer).toBeNull();
      if (m.type === "question.revealed") expect((m.data as { correct_answer: string }).correct_answer).toMatch(/^(-?\d+(\.\d+)?|true|false)$/);
    }
  });

  it("opens each question with fired_at and closes_at on the server's clock", async () => {
    const l = lesson();
    await toFirstQuestion();
    const opened = l.heard.filter((m) => m.type === "question.opened")[0].data as { server_now: string; question: { fired_at: string; closes_at: string; timer_seconds: number } };
    expect(Date.parse(opened.question.closes_at) - Date.parse(opened.question.fired_at)).toBe(opened.question.timer_seconds * 1000);
    expect(Math.abs(Date.parse(opened.question.fired_at) - serverNow())).toBeLessThan(50);
  });

  it("keeps the server's clock a few seconds ahead of the phone's", () => {
    const l = lesson();
    expect(l.session.studentState().serverNow - Date.now()).toBe(SKEW_MS);
    expect(l.joined.serverNow - Date.now()).toBe(SKEW_MS);
  });

  it("speaks the proposed wire format (a time on every event, the channel it is for)", async () => {
    const l = lesson();
    await advance(15 * 60_000);
    for (const m of l.heard) {
      const d = m.data as { channel: string; server_now: string };
      expect(d.channel).toBe(m.channel);
      expect(Number.isNaN(Date.parse(d.server_now)), m.type).toBe(false);
    }
    expect(new Set(l.heard.map((m) => m.channel))).toEqual(new Set([l.session.channels.public, l.session.channels.student]));
  });

  it("keeps the student's points and achievements as they are earned, and the finished session for the summary", async () => {
    const l = lesson();
    await toFirstQuestion();
    answer(l.session, right, 0);
    for (let i = 0; i < 250 && l.session.studentState().question?.status === "open"; i++) await advance(100);
    expect(getState().quizPoints).toBe(15);
    expect(getState().quizAnswered).toBe(true);
    await advance(15 * 60_000);
    const [done] = getState().finished;
    expect(done).toMatchObject({ sessionId: l.session.id, courseId: "math", total: quiz.questions.length, right: 1 });
    expect(done.questions[0]).toMatchObject({ correct: true });
    expect(done.questions[1].yourAnswer).toBeNull();
    const results = await mockClient.listResults();
    expect(results[0]).toMatchObject({ sessionId: l.session.id, right: 1 });
  });

  it("sends the class a practice set from the pop-ups it missed once the lesson has ended (F-12, OPEN-08)", async () => {
    const l = lesson();
    expect(getState().practiceSets).toHaveLength(0);
    await advance(15 * 60_000);
    const [set] = getState().practiceSets;
    expect(set).toMatchObject({ id: `ps-${l.session.id}`, sessionId: l.session.id, courseId: "math" });
    // Only pop-ups, in the order of the lesson, and at least the minimum.
    const lessonIds = quiz.questions.map((q) => q.id);
    expect(set.questionIds.length).toBeGreaterThanOrEqual(2);
    expect(set.questionIds.every((id) => lessonIds.includes(id))).toBe(true);
    expect(set.questionIds).toEqual(lessonIds.filter((id) => set.questionIds.includes(id)));
    // The student never answered, so every question was missed by them as well as by part of the class.
    const sent = (await mockClient.listPracticeSets()).find((p) => p.id === set.id)!;
    expect(sent).toMatchObject({ score: null, completedAt: null, courseId: "math" });
    expect(sent.questions.map((q) => q.id)).toEqual(set.questionIds);
    const notice = (await mockClient.listNotifications()).find((n) => n.payload.practiceSetId === set.id)!;
    expect(notice).toMatchObject({ kind: "practice_set_sent", readAt: null });
  });

  it("earns no points for joining (BR-PTS-01)", () => {
    lesson();
    expect(getState().quizPoints).toBe(0);
  });

  it("starts a new lesson when the last one is over, and keeps one that is running", async () => {
    const a = lesson();
    expect(lesson().session).toBe(a.session);
    await advance(15 * 60_000);
    expect(a.session.ended).toBe(true);
    expect(lesson().session).not.toBe(a.session);
  });

  it("gives every lesson its own id so two playthroughs have two summaries", async () => {
    const a = lesson();
    await advance(15 * 60_000);
    const b = lesson();
    expect(b.session.id).not.toBe(a.session.id);
  });
});

describe("the special codes", () => {
  it.each([
    ["EXPIRED-7B", "token_expired"],
    ["expired-7b", "token_expired"],
    ["OTHER-8A", "not_enrolled"],
    ["ENDED-7B", "session_ended"],
    ["NOPE-9", "not_found"],
    ["", "not_found"],
  ])("%s is refused as %s", (code, error) => {
    expect(() => joinMock(code, "mk")).toThrowError(expect.objectContaining({ code: error }));
    expect(getState().checkins).toHaveLength(0);
  });

  it("OFFLINE-7B has no connection the first time, then opens the maths lesson", () => {
    expect(() => joinMock("OFFLINE-7B", "mk")).toThrowError(expect.objectContaining({ code: "network" }));
    expect(joinMock("OFFLINE-7B", "mk").session.courseId).toBe("math");
  });

  it("LATE-7B joins a lesson in progress and is marked late, the same on every repeat", async () => {
    const j = joinMock("LATE-7B", "mk");
    expect(j.session.state).toBe("teaching");
    expect(j.attendance.status).toBe("late");
    const state = mockSessionFor(j.session.id)!.studentState();
    expect(state.question).toMatchObject({ status: "open", index: 0 });
    // Six seconds of the question are already gone.
    expect(state.question!.closesAt! - state.serverNow).toBeLessThan(dur - 5000);
    expect(joinMock("LATE-7B", "mk").attendance.id).toBe(j.attendance.id);
    expect(getState().checkins).toHaveLength(1);
    expect(getState().quizPoints).toBe(0);
    // Still able to answer the open question.
    const s = mockSessionFor(j.session.id)!;
    expect(answer(s, right, 7000)).toEqual({ accepted: true, duplicate: false });
  });

  it("joining a lesson a second time after the lobby does not turn an on-time attendance into a late one", async () => {
    const a = joinMock("MATH-7B", "mk");
    await advance(SCRIPT.start + 1000);
    const again = joinMock("MATH-7B", "mk");
    expect(again.attendance.status).toBe("present");
    expect(again.attendance.id).toBe(a.attendance.id);
  });
});

describe("the realtime link", () => {
  const connected = async (code: string) => {
    const joined = joinMock(code, "mk");
    const transport = mockTransport(joined.session.id);
    const heard: RealtimeMessage[] = [];
    const session = mockSessionFor(joined.session.id)!;
    transport.subscribe(session.channels.public, (m) => heard.push(m));
    transport.subscribe(session.channels.student, (m) => heard.push(m));
    const states: string[] = [];
    transport.onState((s) => states.push(s));
    await advance(10);
    return { joined, transport, session, heard, states };
  };

  it("carries the lesson's events once it is open, and only on the channels asked for", async () => {
    const { transport, heard } = await connected("MATH-7B");
    expect(transport.state).toBe("open");
    await advance(SCRIPT.start + 10);
    expect(heard.map((m) => m.type)).toContain("question.opened");
    transport.close();
  });

  it("FLAKY-7B drops once during the first question, retries with backoff, and comes back", async () => {
    const { transport, states, heard, session } = await connected("FLAKY-7B");
    await advance(SCRIPT.start + SCRIPT.dropAfter + 10);
    expect(states).toEqual(["open", "reconnecting"]);
    const during = heard.length;
    // What the lesson does while the link is down never reaches the phone.
    await advance(SCRIPT.downFor);
    expect(heard.length).toBe(during);
    await advance(20_000);
    expect(transport.state).toBe("open");
    expect(states.at(-1)).toBe("open");
    expect(session.studentState().question).not.toBeNull();
    // It is a one-off: no second outage.
    await advance(120_000);
    expect(states.filter((s) => s === "reconnecting")).toHaveLength(states.filter((s) => s === "open").length - 1);
    transport.close();
  });
});

describe("through the session engine, the way the screen runs it", () => {
  it("plays a whole lesson: join, answer every question, the verdicts, the end", async () => {
    const joined = joinMock("MATH-7B", "mk");
    const session = mockSessionFor(joined.session.id)!;
    const client = createMockClient({ state: getState, locale: () => "mk", writable: true });
    const sent: string[] = [];
    const handle = createSessionHandle({
      sessionId: joined.session.id,
      meId: "student-marko",
      transport: mockTransport(joined.session.id),
      getSnapshot: (id) => client.getStudentState(id),
      outbox: createOutbox({
        store: memoryStore(),
        send: (id, a, kind) => (sent.push(`${kind}:${a.sessionQuestionId}`), client.submitAnswer(id, a)),
      }),
    });
    const stages = new Set<string>();
    handle.subscribe(() => stages.add(handle.getView().stage));
    await advance(10);
    expect(handle.getView().stage).toBe("waiting_start");

    let answered = 0;
    for (let i = 0; i < 400 && handle.getView().stage !== "ended"; i++) {
      const v = handle.getView();
      if (v.stage === "answering") {
        const q = quiz.questions[v.question!.index];
        handle.answer(q.kind === "mc" ? String(q.answer) : q.kind === "num" ? q.answer : q.answer === 0 ? "true" : "false");
        answered++;
      }
      await advance(500);
    }
    const v = handle.getView();
    expect(answered).toBe(quiz.questions.length);
    // Every pop-up, each once.
    expect(new Set(sent).size).toBe(quiz.questions.length);
    expect(v.stage).toBe("ended");
    expect(v.summary).toEqual({ right: quiz.questions.length, total: quiz.questions.length });
    // Ten for each right answer, and the speed bonus on top.
    expect(v.points).toBeGreaterThanOrEqual(quiz.questions.length * CORRECT_POINTS);
    for (const s of ["waiting_start", "answering", "waiting_others", "right", "waiting_next", "ended"]) expect(stages, s).toContain(s);
    expect(getState().perfectQuiz).toBe(true);
    expect(session.ended).toBe(true);
    handle.dispose();
  });

  it("recovers after the flaky connection: the question that closed while it was down is not lost", async () => {
    const joined = joinMock("FLAKY-7B", "mk");
    const client = createMockClient({ state: getState, locale: () => "mk", writable: true });
    const getSnapshot = vi.fn((id: string) => client.getStudentState(id));
    const handle = createSessionHandle({
      sessionId: joined.session.id,
      meId: "student-marko",
      transport: mockTransport(joined.session.id),
      getSnapshot,
      outbox: createOutbox({ store: memoryStore(), send: (id, a) => client.submitAnswer(id, a) }),
    });
    await advance(SCRIPT.start + 5000);
    expect(handle.getView().stage).toBe("answering");
    // The student never answers; the link drops 12 s in and stays down for a while.
    await advance(SCRIPT.dropAfter);
    expect(handle.getView().connection).toBe("reconnecting");
    const asked = getSnapshot.mock.calls.length;
    await advance(SCRIPT.downFor + 20_000);
    expect(handle.getView().connection).toBe("open");
    expect(getSnapshot.mock.calls.length).toBeGreaterThan(asked);
    // Back in step with the server: whatever it is doing now, so is the screen.
    const server = mockSessionFor(joined.session.id)!.studentState();
    expect(handle.getView().question?.id).toBe(server.question?.id);
    expect(handle.getView().points).toBe(server.sessionPoints);
    handle.dispose();
  });
});

describe("the iso helper the events use", () => {
  it("round-trips a time", () => {
    expect(Date.parse(iso(1_800_000_000_123))).toBe(1_800_000_000_123);
  });
});

describe("OFFLINE-ANSWER-7B and the mock's network", () => {
  it("drops the network for 15 seconds as the first answer is sent, then lets the same answer through", async () => {
    const l = lesson("OFFLINE-ANSWER-7B");
    const client = createMockClient({ state: getState, locale: () => "mk", writable: true });
    await toFirstQuestion();
    const q = l.session.studentState().question!;
    const input = { sessionQuestionId: q.id, response: right, answeredAt: q.firedAt! + 1000, idempotencyKey: "k1" };

    expect(net.isOffline()).toBe(false);
    await expect(client.submitAnswer(l.session.id, input)).rejects.toMatchObject({ code: "network" });
    expect(net.isOffline()).toBe(true);
    // While it is gone, nothing gets through: not another answer, not a snapshot.
    await expect(client.submitAnswer(l.session.id, input)).rejects.toMatchObject({ code: "network" });
    await expect(client.getStudentState(l.session.id)).rejects.toMatchObject({ code: "network" });

    await advance(SCRIPT.answerOutage - 100);
    expect(net.isOffline()).toBe(true);
    await advance(200);
    expect(net.isOffline()).toBe(false);
    await expect(client.submitAnswer(l.session.id, input)).resolves.toEqual({ accepted: true, duplicate: false });
    // The outage happens once.
    expect(net.isOffline()).toBe(false);
  });

  it("other lessons are never cut off", async () => {
    const l = lesson("MATH-7B");
    const client = createMockClient({ state: getState, locale: () => "mk", writable: true });
    await toFirstQuestion();
    const q = l.session.studentState().question!;
    await expect(client.submitAnswer(l.session.id, { sessionQuestionId: q.id, response: right, answeredAt: q.firedAt! + 1000, idempotencyKey: "k1" })).resolves.toBeTruthy();
    expect(net.isOffline()).toBe(false);
  });

  it("the phone being offline stops answers and snapshots in the mock, and the lesson's link drops and returns", async () => {
    const l = lesson("MATH-7B");
    const client = createMockClient({ state: getState, locale: () => "mk", writable: true });
    await toFirstQuestion();
    const q = l.session.studentState().question!;
    net.setForcedOffline(true);
    await expect(client.submitAnswer(l.session.id, { sessionQuestionId: q.id, response: right, answeredAt: q.firedAt! + 1000, idempotencyKey: "k1" })).rejects.toMatchObject({ code: "network" });
    net.setForcedOffline(false);
    await expect(client.getStudentState(l.session.id)).resolves.toBeTruthy();
  });
});

describe("the special code for the numeric question", () => {
  it("NUMERIC-7B opens the physics lesson on its numeric question: a unit, a minus, a decimal and a tolerance", () => {
    const j = joinMock("NUMERIC-7B", "mk");
    expect(j.session).toMatchObject({ courseId: "physics", state: "teaching" });
    const q = mockSessionFor(j.session.id)!.studentState().question!;
    expect(q).toMatchObject({ kind: "numeric", options: null, status: "open", numeric: { unit: "m/s²", tolerance: 0.1, allowNegative: true } });
    expect(q.closesAt! - q.firedAt!).toBe(DURATION.num);
  });

  it("each is its own lesson, apart from the regular code for the same subject", () => {
    const a = joinMock("NUMERIC-7B", "mk");
    const b = joinMock("PHYS-7B", "mk");
    expect(b.session.id).not.toBe(a.session.id);
    expect(joinMock("numeric-7b", "mk").session.id).toBe(a.session.id);
  });
});

describe("a numeric question", () => {
  const numeric = () => {
    const joined = joinMock("NUMERIC-7B", "mk");
    const session = mockSessionFor(joined.session.id)!;
    const heard: RealtimeMessage[] = [];
    session.listen((m) => heard.push(m));
    return { session, heard, ofType: (t: string) => heard.filter((m) => m.type === t).map((m) => m.data as Record<string, unknown>) };
  };
  const give = (s: MockSession, response: string, afterMs = 1000, key = "n") => {
    const q = s.studentState().question!;
    return s.submit({ sessionQuestionId: q.id, response, answeredAt: q.firedAt! + afterMs, idempotencyKey: key });
  };
  const closeIt = async (s: MockSession) => {
    for (let i = 0; i < 400 && s.studentState().question?.status === "open"; i++) await advance(100);
  };

  it("is right within the tolerance, edges included, and earns the speed bonus", async () => {
    const { session } = numeric();
    give(session, "-2.4", 0);
    await closeIt(session);
    expect(session.studentState().result).toMatchObject({ correct: true, speedBonus: 5, points: 15 });
  });

  it("is wrong past the tolerance", async () => {
    const { session } = numeric();
    give(session, "-2.3");
    await closeIt(session);
    expect(session.studentState().result).toMatchObject({ correct: false, points: 0 });
  });

  it("keeps the number as the server reads it, so a comma and a point are the same answer", async () => {
    const { session } = numeric();
    give(session, "-2,50");
    expect(session.studentState().myResponse).toBe("-2.5");
    await closeIt(session);
    expect(session.studentState().result?.correct).toBe(true);
  });

  it("refuses what is not a number", async () => {
    const { session } = numeric();
    expect(() => give(session, "abc")).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    expect(() => give(session, "")).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    expect(() => give(session, "1.000,5")).toThrowError(expect.objectContaining({ code: "validation_failed" }));
  });

  it("takes no minus on a question that does not allow one, and a decimal with a comma on the maths one", async () => {
    const joined = joinMock("MATH-7B", "mk");
    const math = mockSessionFor(joined.session.id)!;
    // The lobby, then two pop-ups nobody answers, and the third is the number.
    await advance(SCRIPT.start + DURATION.mc + SCRIPT.next + DURATION.tf + SCRIPT.next);
    const q = math.studentState().question!;
    expect(q).toMatchObject({ kind: "numeric", status: "open", numeric: { unit: null, tolerance: 0.01, allowNegative: false } });
    const send = (response: string, key: string) => math.submit({ sessionQuestionId: q.id, response, answeredAt: q.firedAt! + 1000, idempotencyKey: key });
    expect(() => send("-3,25", "a")).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    send("3,26", "b");
    for (let i = 0; i < 400 && math.studentState().question?.status === "open"; i++) await advance(100);
    // 3.26 is 0.01 away from 3.25: the edge of the tolerance counts.
    expect(math.studentState().result).toMatchObject({ correct: true });
  });

  it("reveals the number as plain text, and the summary writes it with its unit and the locale's separator", async () => {
    const { session, ofType } = numeric();
    give(session, "-2,5", 1000);
    await advance(15 * 60_000);
    expect(ofType("question.revealed")[0]).toMatchObject({ correct_answer: "-2.5" });
    const [done] = getState().finished;
    expect(done.questions[0]).toMatchObject({ correct: true, correctAnswer: "−2,5 m/s²", yourAnswer: "−2,5 m/s²" });
  });

  it("counts only the questions the class got to: a lesson joined at question 3 has three", async () => {
    const { session } = numeric();
    await advance(15 * 60_000);
    expect(session.studentState().summary).toEqual({ right: 0, total: 3 });
  });
});

describe("questions to the teacher and the focus flag", () => {
  const consoleLog = () => JSON.parse(window.localStorage.getItem("teacheraid-mock-console") ?? "{}") as import("@/lib/app/api/mock/session").MockConsole;
  const ask = (s: MockSession, text: string, key: string) => s.submitAsk({ text, askedAt: serverNow(), idempotencyKey: key });

  it("ASK-7B is the maths lesson with a limit of 2 questions, where every other lesson has 3", () => {
    const a = mockSessionFor(joinMock("ASK-7B", "mk").session.id)!;
    expect(a.studentState().anon).toEqual({ used: 0, limit: 2 });
    expect(joinMock("ASK-7B", "mk").session.courseId).toBe("math");
    const normal = mockSessionFor(joinMock("MATH-7B", "mk").session.id)!;
    expect(normal.studentState().anon).toEqual({ used: 0, limit: 3 });
    expect(normal.id).not.toBe(a.id);
  });

  it("stores a question with its sender for the console only, and never sends it to the class", () => {
    const { session, types } = lesson("ASK-7B");
    ask(session, "  Can you   repeat that? ", "k1");
    expect(consoleLog().asks).toEqual([{ text: "Can you repeat that?", sender: "student-marko", at: expect.any(Number) }]);
    expect(types()).not.toContain("anon_question.received");
    expect(JSON.stringify(session.studentState())).not.toContain("Can you repeat");
  });

  it("takes a repeat of a key once, refuses a third past the limit of 2, and an empty one", () => {
    const { session } = lesson("ASK-7B");
    expect(ask(session, "one", "k1")).toEqual({ accepted: true, duplicate: false });
    expect(ask(session, "one", "k1")).toEqual({ accepted: true, duplicate: true });
    expect(ask(session, "two", "k2")).toEqual({ accepted: true, duplicate: false });
    expect(() => ask(session, "three", "k3")).toThrowError(expect.objectContaining({ code: "limit_reached" }));
    // A repeat is still a repeat once the limit is reached.
    expect(ask(session, "two", "k2")).toEqual({ accepted: true, duplicate: true });
    expect(() => ask(session, "  ", "k4")).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    expect(session.studentState().anon).toEqual({ used: 2, limit: 2 });
  });

  it("counts what the student sent for the Your data screen: a repeat is one, a refusal is none", () => {
    const { session } = lesson("ASK-7B");
    const before = getState().asksSent;
    ask(session, "one", "k1");
    ask(session, "one", "k1");
    ask(session, "two", "k2");
    expect(() => ask(session, "three", "k3")).toThrow();
    expect(getState().asksSent).toBe(before + 2);
  });

  it("refuses a question after the lesson has ended", async () => {
    const { session } = lesson("ASK-7B");
    await advance(SCRIPT.start + 60_000 * 10);
    expect(session.ended).toBe(true);
    expect(() => ask(session, "late", "k1")).toThrowError(expect.objectContaining({ code: "session_ended" }));
  });

  it("FOCUS-7B goes from the lobby straight into a first question that lasts a minute", async () => {
    const { session, types } = lesson("FOCUS-7B");
    expect(session.state).toBe("lobby");
    await toFirstQuestion();
    const q = session.studentState().question!;
    expect(q).toMatchObject({ status: "open" });
    expect(q.closesAt! - q.firedAt!).toBe(SCRIPT.focusFirstQuestion);
    // The lobby goes to teaching.
    expect(session.state).toBe("teaching");
    expect(types()).toContain("question.opened");
  });

  it("flags a lost inside the open question, records the back, and raises no flag outside it (AC-FOC-01, AC-FOC-02)", async () => {
    const { session } = lesson("FOCUS-7B");
    await toFirstQuestion();
    const q = session.studentState().question!;
    session.recordFocus([
      { type: "lost", at: q.firedAt! + 5000, sessionQuestionId: q.id },
      { type: "back", at: q.firedAt! + 12_000, sessionQuestionId: q.id },
      // Before it was open, and after it closed: stored, never flagged.
      { type: "lost", at: q.firedAt! - 1000, sessionQuestionId: q.id },
      { type: "lost", at: q.closesAt! + 5000, sessionQuestionId: q.id },
    ]);
    expect(consoleLog().focus.map((f) => [f.type, f.flagged])).toEqual([
      ["lost", true],
      ["back", false],
      ["lost", false],
      ["lost", false],
    ]);
  });

  it("counts the times the student left the quiz, once each, and not the times they came back", async () => {
    const { session } = lesson("FOCUS-7B");
    await toFirstQuestion();
    const q = session.studentState().question!;
    const before = getState().focusLost;
    const lost = { type: "lost" as const, at: q.firedAt! + 5000, sessionQuestionId: q.id };
    session.recordFocus([lost, { type: "back", at: q.firedAt! + 9000, sessionQuestionId: q.id }]);
    session.recordFocus([lost]);
    expect(getState().focusLost).toBe(before + 1);
  });

  it("takes the same focus event twice as one, and refuses a question that is not the lesson's", async () => {
    const { session } = lesson("FOCUS-7B");
    await toFirstQuestion();
    const q = session.studentState().question!;
    const e = { type: "lost" as const, at: q.firedAt! + 5000, sessionQuestionId: q.id };
    session.recordFocus([e]);
    session.recordFocus([e]);
    expect(consoleLog().focus).toHaveLength(1);
    expect(() => session.recordFocus([{ ...e, sessionQuestionId: "nope" }])).toThrowError(expect.objectContaining({ code: "not_found" }));
  });
});
