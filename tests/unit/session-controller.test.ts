import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/app/api/errors";
import type { SessionQuestion, StudentSessionState } from "@/lib/app/api/types";
import { iso } from "@/lib/app/api/wire";
import { createSessionHandle, publicChannel, studentChannel, type SessionDeps, type SessionHandle } from "@/lib/app/session/controller";
import { T0, question, result, session, snapshot } from "./support/session";
import { FakeTransport, deferred, wireQuestion, wireResult } from "./support/transport";

const SKEW = 90_000; // the phone runs a minute and a half ahead of the server
const PUBLIC = publicChannel("s1");
const STUDENT = studentChannel("me");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 + SKEW);
});
afterEach(() => vi.useRealTimers());

/** The server's time right now, which is the phone's minus its skew. */
const serverNow = () => Date.now() - SKEW;

/** Question 1 as the server has it: fired `agoMs` ago, 20 s long. */
const firedAgo = (agoMs: number, over: Partial<SessionQuestion> = {}) =>
  question(1, { firedAt: serverNow() - agoMs, closesAt: serverNow() - agoMs + 20_000, ...over });

/** What the fake server answers a snapshot request with: the next of these, stamped with its clock as the request lands. */
type Reply = Omit<StudentSessionState, "serverNow"> | Error;
const reply = (over: Partial<StudentSessionState> = {}): Reply => {
  const { serverNow: _ignored, ...rest } = snapshot(over);
  void _ignored;
  return rest;
};

function setup(overrides: Partial<SessionDeps> = {}, replies: Reply[] = [reply()]) {
  const transport = new FakeTransport();
  let call = 0;
  const getSnapshot = vi.fn(async () => {
    const next = replies[Math.min(call++, replies.length - 1)];
    if (next instanceof Error) throw next;
    return { ...next, serverNow: serverNow() } as StudentSessionState;
  });
  const sendAnswer = vi.fn(async () => ({ accepted: true, duplicate: false }));
  const handle: SessionHandle = createSessionHandle({
    sessionId: "s1",
    meId: "me",
    transport,
    getSnapshot,
    sendAnswer,
    newKey: () => "key-1",
    random: () => 0.5,
    ...overrides,
  });
  return { transport, getSnapshot, sendAnswer, handle };
}

describe("starting", () => {
  it("listens to the public channel and the student's own, and asks for the snapshot at once", async () => {
    const { transport, getSnapshot, handle } = setup();
    expect(transport.channels()).toEqual([PUBLIC, STUDENT].sort());
    expect(getSnapshot).toHaveBeenCalledOnce();
    expect(handle.getView().stage).toBe("syncing");
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.getView().stage).toBe("waiting_next");
  });

  it("draws the lobby from the snapshot", async () => {
    const { handle } = setup({}, [reply({ session: session({ state: "lobby", joinedCount: 12 }) })]);
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.getView()).toMatchObject({ stage: "waiting_start", joined: 12, title: "Linear equations" });
  });

  it("tells its listeners when the view changes, and not when it does not", async () => {
    const { handle } = setup();
    const heard = vi.fn();
    handle.subscribe(heard);
    await vi.advanceTimersByTimeAsync(0);
    const n = heard.mock.calls.length;
    expect(n).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(heard.mock.calls.length).toBe(n);
  });
});

describe("the question clock", () => {
  it("counts down on the server's clock and stops taking answers when it reaches closes_at", async () => {
    const { handle } = setup({}, [reply({ question: firedAgo(2000) })]);
    await vi.advanceTimersByTimeAsync(0);
    const first = handle.getView();
    expect(first).toMatchObject({ stage: "answering", duration: 20_000 });
    expect(first.secondsLeft).toBe(18);
    expect(first.elapsed).toBeGreaterThanOrEqual(2000);

    const reads: number[] = [];
    handle.subscribe(() => reads.push(handle.getView().secondsLeft));
    await vi.advanceTimersByTimeAsync(5000);
    expect(handle.getView().secondsLeft).toBe(13);
    expect(reads.length).toBeGreaterThan(3);
    await vi.advanceTimersByTimeAsync(13_000);
    expect(handle.getView().stage).toBe("waiting_result");
    expect(handle.getView().secondsLeft).toBe(0);
  });
});

describe("events", () => {
  it("opens a question, with the phone's clock off by a minute and a half", async () => {
    const { transport, handle } = setup();
    await vi.advanceTimersByTimeAsync(0);
    const opened = firedAgo(0);
    transport.push(PUBLIC, "question.opened", { server_now: iso(serverNow() + 5), question: wireQuestion(opened) });
    expect(handle.getView()).toMatchObject({ stage: "answering", secondsLeft: 20 });
    expect(handle.getView().question?.prompt).toBe("Question 1");
  });

  it("takes the student's result from their own channel", async () => {
    const { transport, handle } = setup();
    await vi.advanceTimersByTimeAsync(0);
    transport.push(PUBLIC, "question.opened", { server_now: iso(serverNow()), question: wireQuestion(firedAgo(15_000)) });
    handle.answer("1");
    transport.push(PUBLIC, "question.closed", { server_now: iso(serverNow() + 1), session_question_id: "q1" });
    transport.push(STUDENT, "question.result", wireResult(result(1, { points: 14 }), 14, serverNow() + 2));
    expect(handle.getView()).toMatchObject({ stage: "right", gain: 14, points: 14, rank: 4, picked: "1" });
  });

  it("ignores events it has no use for and asks again about ones it cannot read", async () => {
    const { transport, getSnapshot, handle } = setup();
    await vi.advanceTimersByTimeAsync(0);
    const calls = getSnapshot.mock.calls.length;
    transport.push(PUBLIC, "opener.counts", { a: 1 });
    transport.push(PUBLIC, "join_token.rotated", {});
    expect(getSnapshot.mock.calls.length).toBe(calls);
    expect(handle.getView().stage).toBe("waiting_next");
    // A known event whose body is not the proposal's: the phone did not really get it, so it asks.
    transport.push(PUBLIC, "question.closed", { nonsense: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot.mock.calls.length).toBe(calls + 1);
  });

  it("tells the app that the student signed in elsewhere, and that there is a notification", async () => {
    const onSignedInElsewhere = vi.fn();
    const onNotification = vi.fn();
    const { transport } = setup({ onSignedInElsewhere, onNotification });
    await vi.advanceTimersByTimeAsync(0);
    transport.push(STUDENT, "signed_in_elsewhere", {});
    transport.push(STUDENT, "notification.created", {});
    expect(onSignedInElsewhere).toHaveBeenCalledOnce();
    expect(onNotification).toHaveBeenCalledOnce();
  });

  it("tells the app once that the session ended, however it learns it", async () => {
    const onEnded = vi.fn();
    const { transport, handle } = setup({ onEnded });
    await vi.advanceTimersByTimeAsync(0);
    transport.push(PUBLIC, "state.changed", { server_now: iso(serverNow()), state: "ended" });
    transport.push(STUDENT, "session.ended", { server_now: iso(serverNow() + 1), session_points: 40, session_rank: 2, summary: { right: 4, total: 5 } });
    expect(onEnded).toHaveBeenCalledOnce();
    expect(handle.getView()).toMatchObject({ stage: "ended", points: 40, rank: 2, summary: { right: 4, total: 5 } });
  });

  it("asks for a snapshot when an event shows it missed a question", async () => {
    const { transport, getSnapshot, handle } = setup();
    await vi.advanceTimersByTimeAsync(0);
    transport.push(PUBLIC, "question.closed", { server_now: iso(serverNow()), session_question_id: "q7" });
    expect(getSnapshot).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.getState().stale).toBe(false);
  });
});

describe("reconnecting", () => {
  it("fetches the snapshot every time the link opens, and what it says replaces what the phone believed", async () => {
    const q3 = question(3, { status: "closed", firedAt: serverNow() - 30_000, closesAt: serverNow() - 10_000 });
    const { transport, getSnapshot, handle } = setup({}, [
      reply({ question: firedAgo(1000) }),
      reply({ question: firedAgo(1000) }),
      reply({ question: q3, result: result(3, { correct: false, points: 0, correctAnswer: null }), sessionPoints: 26, sessionRank: 6 }),
    ]);
    transport.setState("open");
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot).toHaveBeenCalledTimes(2);

    // The student answers, then the link drops for a while.
    handle.answer("2");
    await vi.advanceTimersByTimeAsync(0);
    transport.setState("reconnecting");
    expect(handle.getView().connection).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(10_000);
    transport.setState("open");
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot).toHaveBeenCalledTimes(3);
    expect(handle.getView()).toMatchObject({ connection: "open", points: 26, rank: 6, picked: null });
    expect(handle.getView().question?.id).toBe("q3");
  });

  it("holds the events that come while the snapshot is on its way and applies them after", async () => {
    const wait = deferred<StudentSessionState>();
    const transport = new FakeTransport();
    let n = 0;
    const getSnapshot = vi.fn(() => (n++ === 0 ? Promise.resolve(snapshot({ session: session({ state: "lobby" }), serverNow: serverNow() })) : wait.promise));
    const handle = createSessionHandle({ sessionId: "s1", meId: "me", transport, getSnapshot, sendAnswer: vi.fn(), random: () => 0.5 });
    await vi.advanceTimersByTimeAsync(0);

    transport.setState("open"); // asks again
    transport.push(PUBLIC, "state.changed", { server_now: iso(serverNow() + 10), state: "teaching" });
    expect(handle.getView().sessionState).toBe("lobby"); // held
    wait.resolve(snapshot({ session: session({ state: "lobby" }), serverNow: serverNow() - 5 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.getView().sessionState).toBe("teaching");
  });

  it("asks once at a time: a second request waits for the first and then goes", async () => {
    const first = deferred<StudentSessionState>();
    const transport = new FakeTransport();
    const getSnapshot = vi.fn(() => first.promise);
    createSessionHandle({ sessionId: "s1", meId: "me", transport, getSnapshot, sendAnswer: vi.fn(), random: () => 0.5 });
    transport.setState("open");
    transport.setState("reconnecting");
    transport.setState("open");
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    first.resolve(snapshot({ serverNow: serverNow() }));
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("retries a snapshot that fails, with backoff, and says it is syncing", async () => {
    const { getSnapshot, handle } = setup({}, [new ApiError("network"), new ApiError("network"), reply()]);
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.getView().syncing).toBe(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getSnapshot).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(getSnapshot).toHaveBeenCalledTimes(3);
    expect(handle.getView()).toMatchObject({ syncing: false, stage: "waiting_next" });
  });

  it("applies held events to what it has once the snapshot has failed twice", async () => {
    const { transport, handle } = setup({}, [
      reply({ question: firedAgo(1000) }),
      new ApiError("server_error"),
      new ApiError("server_error"),
      new ApiError("server_error"),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    transport.setState("open");
    await vi.advanceTimersByTimeAsync(0);
    transport.push(PUBLIC, "question.closed", { server_now: iso(serverNow() + 1), session_question_id: "q1" });
    expect(handle.getView().stage).toBe("answering"); // held
    await vi.advanceTimersByTimeAsync(2000);
    expect(handle.getView().stage).toBe("waiting_result");
  });

  it("gives up on a session that is not there", async () => {
    const { getSnapshot, handle } = setup({}, [new ApiError("not_found")]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(handle.getView().failed?.code).toBe("not_found");
    expect(getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("tries again on request after giving up", async () => {
    const { getSnapshot, handle } = setup({}, [new ApiError("not_found"), reply()]);
    await vi.advanceTimersByTimeAsync(0);
    handle.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot).toHaveBeenCalledTimes(2);
    expect(handle.getView()).toMatchObject({ failed: null, stage: "waiting_next" });
  });

  it("asks for a result that is overdue, shortly after the question should have closed", async () => {
    const { getSnapshot, handle } = setup({}, [
      reply({ question: firedAgo(15_000) }),
      reply({ question: firedAgo(23_000, { status: "closed" }), result: result(1) }),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    // The question closes in 5 s; the result is overdue 3 s after that.
    await vi.advanceTimersByTimeAsync(7900);
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(getSnapshot).toHaveBeenCalledTimes(2);
    expect(handle.getView().stage).toBe("right");
  });

  it("wakes up: reconnects a link that is down, and refreshes one that is up", async () => {
    const { transport, getSnapshot, handle } = setup();
    await vi.advanceTimersByTimeAsync(0);
    transport.setState("reconnecting");
    handle.wake();
    expect(transport.reconnect).toHaveBeenCalledOnce();
    transport.setState("open");
    await vi.advanceTimersByTimeAsync(0);
    const calls = getSnapshot.mock.calls.length;
    handle.wake();
    expect(getSnapshot.mock.calls.length).toBe(calls + 1);
    expect(transport.reconnect).toHaveBeenCalledOnce();
  });
});

describe("answering", () => {
  async function openQuestion(extra: Partial<SessionDeps> = {}) {
    const s = setup(extra, [reply({ question: firedAgo(1000) })]);
    await vi.advanceTimersByTimeAsync(0);
    return s;
  }

  it("sends the answer through the one send function, with a key and the time in server terms", async () => {
    const { handle, sendAnswer } = await openQuestion();
    const tapped = serverNow();
    handle.answer("2");
    expect(handle.getView()).toMatchObject({ stage: "waiting_others", picked: "2", answer: "sending" });
    await vi.advanceTimersByTimeAsync(0);
    expect(sendAnswer).toHaveBeenCalledOnce();
    const [sessionId, input] = sendAnswer.mock.calls[0] as unknown as [string, { sessionQuestionId: string; response: string; answeredAt: number; idempotencyKey: string }];
    expect(sessionId).toBe("s1");
    expect(input).toMatchObject({ sessionQuestionId: "q1", response: "2", idempotencyKey: "key-1" });
    // The phone's clock is a minute and a half ahead; the answer carries the server's time, not the phone's.
    expect(Math.abs(input.answeredAt - tapped)).toBeLessThan(50);
    expect(handle.getView().answer).toBe("sent");
  });

  it("sends it once, however often the student taps", async () => {
    const { handle, sendAnswer } = await openQuestion();
    handle.answer("2");
    handle.answer("3");
    handle.answer("1");
    await vi.advanceTimersByTimeAsync(0);
    expect(sendAnswer).toHaveBeenCalledOnce();
    expect(handle.getView().picked).toBe("2");
  });

  it("tries again with the same key when the network fails, while the question can still take it", async () => {
    const sendAnswer = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("network"))
      .mockRejectedValueOnce(new ApiError("server_error"))
      .mockResolvedValue({ accepted: true, duplicate: false });
    const { handle } = await openQuestion({ sendAnswer });
    handle.answer("2");
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.getView().answer).toBe("sending");
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sendAnswer).toHaveBeenCalledTimes(3);
    expect(sendAnswer.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(["key-1", "key-1", "key-1"]);
    expect(handle.getView().answer).toBe("sent");
  });

  it("gives up on an answer it could not deliver once the question is long over", async () => {
    const sendAnswer = vi.fn().mockRejectedValue(new ApiError("network"));
    const { handle } = await openQuestion({ sendAnswer });
    handle.answer("2");
    await vi.advanceTimersByTimeAsync(19_000 + 10_000);
    expect(handle.getView().answer).toBe("sending");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(handle.getView().answer).toBe("late");
  });

  it("marks the answer late, and asks what happened, when the server says the question had closed", async () => {
    const sendAnswer = vi.fn().mockRejectedValue(new ApiError("question_closed"));
    const { handle, getSnapshot } = await openQuestion({ sendAnswer });
    handle.answer("2");
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.getView()).toMatchObject({ answer: "late", picked: null });
    expect(getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("keeps the first answer when the server already had one", async () => {
    const sendAnswer = vi.fn().mockRejectedValue(new ApiError("already_answered"));
    const s = setup({ sendAnswer }, [reply({ question: firedAgo(1000) }), reply({ question: firedAgo(1000), myResponse: "0" })]);
    await vi.advanceTimersByTimeAsync(0);
    s.handle.answer("2");
    await vi.advanceTimersByTimeAsync(0);
    // The server's first answer, not the one the student just tapped, is what counts.
    expect(s.handle.getView()).toMatchObject({ answer: "sent", picked: "0" });
  });

  it("takes no answer once time is up on the server's clock", async () => {
    const { handle, sendAnswer } = await openQuestion();
    await vi.advanceTimersByTimeAsync(19_500);
    handle.answer("2");
    await vi.advanceTimersByTimeAsync(0);
    expect(sendAnswer).not.toHaveBeenCalled();
    expect(handle.getView().stage).toBe("waiting_result");
  });
});

describe("stopping", () => {
  it("closes the transport, stops timers and makes no more calls", async () => {
    const { transport, getSnapshot, handle } = setup({}, [reply({ question: firedAgo(1000) })]);
    await vi.advanceTimersByTimeAsync(0);
    handle.dispose();
    expect(transport.close).toHaveBeenCalledOnce();
    const calls = getSnapshot.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    transport.setState("open");
    expect(getSnapshot.mock.calls.length).toBe(calls);
    expect(vi.getTimerCount()).toBe(0);
  });
});
