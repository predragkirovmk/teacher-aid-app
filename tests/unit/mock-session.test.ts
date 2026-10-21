// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockClient, mockClient } from "@/lib/app/api/mock";
import { CLASSMATES, CORRECT_POINTS, DURATION, OPENER_TIMES, QUIZZES, SPEED_POINTS, speedBonus } from "@/lib/app/api/mock/quiz";
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

/** The opener's whole length, from opening to the question closing. */
const OPENER_MS = OPENER_TIMES.vote + OPENER_TIMES.reason;

/** Run to the moment question 1 opens: the lobby, the opener (nobody votes), and the pause after it. */
const toFirstQuestion = () => advance(SCRIPT.start + OPENER_MS + SCRIPT.afterOpener);
/** The same for the lessons that skip the opener (the connection scenarios). */
const toFirstQuestionDirect = () => advance(SCRIPT.start);

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
    // The opener's result came first, then this question's, then its correction.
    expect(l.types().filter((t) => t === "question.result")).toHaveLength(3);
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
    // The opener closed, and question 1 once.
    expect(l.types().filter((t) => t === "question.closed")).toHaveLength(2);
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
    // The opener is not one of the questions the lesson counts.
    expect(l.joined.session).toMatchObject({ state: "lobby", courseId: "math", questionCount: quiz.questions.length });
    await advance(SCRIPT.lobbyTick * 3 + 10);
    expect(l.types().filter((t) => t === "joined.count").length).toBeGreaterThanOrEqual(3);
    expect(l.session.studentState().session.joinedCount).toBeGreaterThan(10);

    // Never answering: the script still runs to the end by itself.
    await advance(15 * 60_000);
    const types = l.types();
    // The opener comes first and goes through the same four events as every pop-up.
    const all = quiz.questions.length + 1;
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
    expect(states).toEqual(["opener", "teaching", "review", "ended"]);
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
    const opened = l.heard.filter((m) => m.type === "question.opened")[1].data as { server_now: string; question: { fired_at: string; closes_at: string; timer_seconds: number } };
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
        send: (id, a, kind) => (
          sent.push(`${kind}:${a.sessionQuestionId}`),
          kind === "vote" ? client.submitVote(id, a) : kind === "reason" ? client.submitReason(id, a) : client.submitAnswer(id, a)
        ),
      }),
    });
    const stages = new Set<string>();
    handle.subscribe(() => stages.add(handle.getView().stage));
    await advance(10);
    expect(handle.getView().stage).toBe("waiting_start");

    let answered = 0;
    for (let i = 0; i < 400 && handle.getView().stage !== "ended"; i++) {
      const v = handle.getView();
      if (v.stage === "voting") handle.answer(String((quiz.opener as { answer: number }).answer));
      else if (v.stage === "reasoning") handle.reason("Same on both sides keeps the balance.");
      else if (v.stage === "answering") {
        const q = quiz.questions[v.question!.index];
        handle.answer(q.kind === "mc" ? String(q.answer) : q.kind === "num" ? q.answer : q.answer === 0 ? "true" : "false");
        answered++;
      }
      await advance(500);
    }
    const v = handle.getView();
    expect(answered).toBe(quiz.questions.length);
    // Every pop-up, and the opener's vote and reason, each once.
    expect(new Set(sent).size).toBe(quiz.questions.length + 2);
    expect(v.stage).toBe("ended");
    expect(v.summary).toEqual({ right: quiz.questions.length, total: quiz.questions.length });
    // The opener: a right prediction (10) and a reason (8), then the pop-ups.
    expect(v.points).toBeGreaterThanOrEqual(CORRECT_POINTS + 8 + quiz.questions.length * CORRECT_POINTS);
    for (const s of ["waiting_start", "voting", "reasoning", "opener_wait", "opener_result", "answering", "waiting_others", "right", "waiting_next", "ended"]) expect(stages, s).toContain(s);
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
    await toFirstQuestionDirect();
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

describe("the special codes for the new question kinds", () => {
  it("OPENER-7B opens the maths lesson on its prediction opener, with nobody late and no lobby", () => {
    const j = joinMock("OPENER-7B", "mk");
    expect(j.session).toMatchObject({ courseId: "math", state: "opener", questionCount: quiz.questions.length });
    expect(j.attendance.status).toBe("present");
    const q = mockSessionFor(j.session.id)!.studentState().question!;
    expect(q).toMatchObject({ kind: "opener_prediction", status: "open", numeric: null });
    expect(q.options).toHaveLength(3);
    expect(q.opener).toMatchObject({ reasonMax: 80 });
    expect(q.opener!.voteClosesAt - q.firedAt!).toBe(OPENER_TIMES.vote);
    expect(q.closesAt! - q.firedAt!).toBe(OPENER_TIMES.vote + OPENER_TIMES.reason);
  });

  it("DEBATE-7B opens the English lesson on a claim with two sides and no options", () => {
    const j = joinMock("DEBATE-7B", "en");
    expect(j.session).toMatchObject({ courseId: "english", state: "opener" });
    expect(mockSessionFor(j.session.id)!.studentState().question).toMatchObject({ kind: "opener_debate", options: null });
  });

  it("NUMERIC-7B opens the physics lesson on its numeric question: a unit, a minus, a decimal and a tolerance", () => {
    const j = joinMock("NUMERIC-7B", "mk");
    expect(j.session).toMatchObject({ courseId: "physics", state: "teaching" });
    const q = mockSessionFor(j.session.id)!.studentState().question!;
    expect(q).toMatchObject({ kind: "numeric", options: null, status: "open", opener: null, numeric: { unit: "m/s²", tolerance: 0.1, allowNegative: true } });
    expect(q.closesAt! - q.firedAt!).toBe(DURATION.num);
  });

  it("each is its own lesson, apart from the regular code for the same subject", () => {
    const a = joinMock("OPENER-7B", "mk");
    const b = joinMock("MATH-7B", "mk");
    expect(b.session.id).not.toBe(a.session.id);
    expect(joinMock("opener-7b", "mk").session.id).toBe(a.session.id);
  });
});

describe("the opener", () => {
  const hear = (code: string) => {
    const joined = joinMock(code, "mk");
    const session = mockSessionFor(joined.session.id)!;
    const heard: RealtimeMessage[] = [];
    session.listen((m) => heard.push(m));
    return { session, heard, ofType: (t: string) => heard.filter((m) => m.type === t).map((m) => m.data as Record<string, unknown>) };
  };
  const o = (s: MockSession) => s.studentState().question!;
  const vote = (s: MockSession, response: string, afterMs: number, key = "v") =>
    s.submitVote({ sessionQuestionId: o(s).id, response, answeredAt: o(s).firedAt! + afterMs, idempotencyKey: key });
  const reason = (s: MockSession, text: string, afterMs: number, key = "r") =>
    s.submitReason({ sessionQuestionId: o(s).id, response: text, answeredAt: o(s).firedAt! + afterMs, idempotencyKey: key });
  const mathRight = String((quiz.opener as { answer: number }).answer);
  const mathWrong = mathRight === "0" ? "1" : "0";
  /** Run until the opener has closed and no further. */
  const closeOpener = async (s: MockSession) => {
    for (let i = 0; i < 700 && s.studentState().question?.status === "open"; i++) await advance(100);
  };

  it("is the first thing the class does after the teacher starts, and moves the lesson to `opener`", async () => {
    const { heard, session } = hear("MATH-7B");
    await advance(SCRIPT.start);
    expect(heard.filter((m) => ["state.changed", "question.opened"].includes(m.type)).map((m) => [m.type, (m.data as { state?: string }).state ?? (m.data as { question: { kind: string } }).question.kind])).toEqual([
      ["state.changed", "opener"],
      ["question.opened", "opener_prediction"],
    ]);
    expect(session.studentState().session.state).toBe("opener");
  });

  it("gives 10 for a right vote and 8 for a reason, 18 together", async () => {
    const { session, ofType } = hear("OPENER-7B");
    expect(vote(session, mathRight, 1000)).toEqual({ accepted: true, duplicate: false });
    expect(reason(session, "Same on both sides keeps the balance.", 3000)).toEqual({ accepted: true, duplicate: false });
    await closeOpener(session);
    expect(session.studentState().result).toMatchObject({ correct: true, points: 18, reasonPoints: 8, speedBonus: 0, correctAnswer: null });
    expect(session.studentState().sessionPoints).toBe(18);
    expect(getState().quizPoints).toBe(18);
    expect(ofType("question.result")[0]).toMatchObject({ correct: true, points: 18, reason_points: 8, session_points: 18 });
  });

  it("gives the reason's 8 even when the vote was wrong (BR-PTS-06), and 10 alone for a right vote with no reason", async () => {
    const wrong = hear("OPENER-7B");
    vote(wrong.session, mathWrong, 1000);
    reason(wrong.session, "I think it doubles.", 3000);
    await closeOpener(wrong.session);
    expect(wrong.session.studentState().result).toMatchObject({ correct: false, points: 8, reasonPoints: 8 });
    resetMockSessions();
    const silent = hear("OPENER-7B");
    vote(silent.session, mathRight, 1000);
    await closeOpener(silent.session);
    expect(silent.session.studentState().result).toMatchObject({ correct: true, points: 10, reasonPoints: 0 });
  });

  it("has no right side in a debate: the vote earns nothing and the reason earns 8 (OPEN-07)", async () => {
    const { session, ofType } = hear("DEBATE-7B");
    vote(session, "agree", 1000);
    reason(session, "It changes the meaning.", 3000);
    await closeOpener(session);
    expect(session.studentState().result).toMatchObject({ correct: null, points: 8, reasonPoints: 8 });
    await advance(SCRIPT.reveal + 10);
    expect(ofType("question.revealed")[0]).toMatchObject({ correct_answer: null });
    expect(session.studentState().result?.correctAnswer).toBeNull();
    // A debate vote is agree or disagree, nothing else.
    expect(() => vote(session, "1", 1500, "x")).toThrowError(expect.objectContaining({ code: "already_answered" }));
  });

  it("tells a student who did not vote that they got nothing", async () => {
    const { session } = hear("OPENER-7B");
    await closeOpener(session);
    expect(session.studentState().result).toMatchObject({ correct: false, points: 0, reasonPoints: 0 });
  });

  it("sends the counts live while voting, final when voting closes, and again with the reveal", async () => {
    const { session, ofType } = hear("OPENER-7B");
    await advance(SCRIPT.progressTick * 2 + 10);
    expect(ofType("opener.counts").every((c) => c.phase === "voting")).toBe(true);
    await advance(OPENER_TIMES.vote);
    const phases = ofType("opener.counts").map((c) => c.phase);
    expect(phases).toContain("reasoning");
    const sizes = new Set(ofType("opener.counts").map((c) => (c.votes as number[]).length));
    expect(sizes).toEqual(new Set([3]));
    const final = ofType("opener.counts").find((c) => c.phase === "reasoning")!.votes as number[];
    // Everybody in the class voted, the student did not.
    expect(final.reduce((a, b) => a + b, 0)).toBe(CLASSMATES.length);
    await closeOpener(session);
    await advance(SCRIPT.reveal + 10);
    expect(ofType("opener.counts").at(-1)).toMatchObject({ phase: "revealed", votes: final });
  });

  it("keeps the anonymous reasons back until the reveal, and gives no names", async () => {
    const { session, ofType, heard } = hear("OPENER-7B");
    await closeOpener(session);
    expect(ofType("opener.reasons")).toHaveLength(0);
    expect(session.studentState().opener!.reasons).toEqual([]);
    await advance(SCRIPT.reveal + 10);
    const [r] = ofType("opener.reasons");
    expect((r.reasons as string[]).length).toBeGreaterThan(3);
    expect(Object.keys(r).sort()).toEqual(["channel", "reasons", "server_now", "session_question_id"]);
    expect(session.studentState().opener).toMatchObject({ phase: "revealed", reasons: r.reasons });
    const names = CLASSMATES.map((c) => c.split(" ")[0]);
    expect(JSON.stringify(heard.filter((m) => m.type.startsWith("opener."))).includes(names[0])).toBe(false);
  });

  it("closes voting when everyone has voted, without waiting for the planned end", async () => {
    const { session, ofType } = hear("OPENER-7B");
    vote(session, mathRight, 500);
    await advance(OPENER_TIMES.vote / 2);
    const closed = ofType("opener.counts").find((c) => c.phase === "reasoning")!;
    expect(closed).toBeTruthy();
    // The student's own vote is in the final count.
    expect((closed.votes as number[]).reduce((a, b) => a + b, 0)).toBe(CLASSMATES.length + 1);
  });

  it("refuses a vote given after voting really ended, and a reason after the end and its grace", async () => {
    const { session } = hear("OPENER-7B");
    const q = o(session);
    await closeOpener(session);
    expect(() => session.submitVote({ sessionQuestionId: q.id, response: mathRight, answeredAt: q.opener!.voteClosesAt + ANSWER_GRACE_MS + 1, idempotencyKey: "a" })).toThrowError(
      expect.objectContaining({ code: "question_closed" }),
    );
    expect(() => session.submitReason({ sessionQuestionId: q.id, response: "Late.", answeredAt: q.closesAt! + ANSWER_GRACE_MS + 1, idempotencyKey: "b" })).toThrowError(
      expect.objectContaining({ code: "question_closed" }),
    );
  });

  it("counts a vote and a reason that were saved offline and arrive after the opener closed (BR-NET-01)", async () => {
    const { session, ofType } = hear("OPENER-7B");
    const q = o(session);
    await closeOpener(session);
    expect(session.studentState().result).toMatchObject({ points: 0 });
    session.submitVote({ sessionQuestionId: q.id, response: mathRight, answeredAt: q.firedAt! + 2000, idempotencyKey: "late-v" });
    expect(session.studentState().result).toMatchObject({ correct: true, points: 10 });
    session.submitReason({ sessionQuestionId: q.id, response: "No air.", answeredAt: q.firedAt! + 4000, idempotencyKey: "late-r" });
    expect(session.studentState().result).toMatchObject({ correct: true, points: 18, reasonPoints: 8 });
    expect(session.studentState().sessionPoints).toBe(18);
    // The opener's result, then one correction for the vote and one for the reason.
    expect(ofType("question.result")).toHaveLength(3);
    expect(ofType("question.result").at(-1)).toMatchObject({ points: 18, reason_points: 8, session_points: 18 });
  });

  it("counts a vote and a reason that arrive after the class has moved on to the first pop-up", async () => {
    const { session } = hear("OPENER-7B");
    const q = o(session);
    await closeOpener(session);
    await advance(SCRIPT.afterOpener + 100);
    expect(o(session).id).not.toBe(q.id);
    session.submitVote({ sessionQuestionId: q.id, response: mathRight, answeredAt: q.firedAt! + 2000, idempotencyKey: "old-v" });
    expect(session.studentState().sessionPoints).toBe(10);
  });

  it("refuses what the opener cannot take", async () => {
    const { session } = hear("OPENER-7B");
    // A reason belongs to a vote.
    expect(() => reason(session, "No vote yet.", 500)).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    expect(() => vote(session, "7", 500)).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    expect(() => vote(session, "agree", 500)).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    vote(session, mathRight, 800, "v1");
    expect(() => reason(session, "   ", 1000)).toThrowError(expect.objectContaining({ code: "validation_failed" }));
    expect(reason(session, "One.", 1200, "r1")).toEqual({ accepted: true, duplicate: false });
    expect(reason(session, "One.", 1200, "r1")).toEqual({ accepted: true, duplicate: true });
    expect(() => reason(session, "Two.", 1500, "r2")).toThrowError(expect.objectContaining({ code: "already_answered" }));
    expect(() => vote(session, mathWrong, 900, "v2")).toThrowError(expect.objectContaining({ code: "already_answered" }));
    expect(() => session.submitVote({ sessionQuestionId: "nope", response: "0", answeredAt: 0, idempotencyKey: "z" })).toThrowError(expect.objectContaining({ code: "not_found" }));
  });

  it("keeps a reason to one line of at most 80 characters", async () => {
    const { session } = hear("OPENER-7B");
    vote(session, mathRight, 500);
    reason(session, `  ${"word ".repeat(40)}\n\nmore  `, 900);
    // What the server kept shows in the snapshot.
    const kept = session.studentState().myReason!;
    expect(kept.length).toBeLessThanOrEqual(80);
    expect(kept.length).toBeGreaterThan(70);
    expect(kept).not.toMatch(/\s{2}|\n|\s$/);
  });

  it("is followed by the lesson's first question after a pause", async () => {
    const { session } = hear("OPENER-7B");
    await closeOpener(session);
    await advance(SCRIPT.afterOpener + 10);
    expect(session.studentState().question).toMatchObject({ index: 0, kind: "multiple_choice", status: "open" });
    expect(session.studentState().session.state).toBe("teaching");
    expect(session.studentState().opener).toBeNull();
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
    // The lobby, the opener, then two pop-ups nobody answers, and the third is the number.
    await advance(SCRIPT.start + OPENER_MS + SCRIPT.afterOpener + DURATION.mc + SCRIPT.next + DURATION.tf + SCRIPT.next);
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
