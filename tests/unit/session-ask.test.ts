import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/app/api/errors";
import type { StudentSessionState } from "@/lib/app/api/types";
import { iso } from "@/lib/app/api/wire";
import { createSessionHandle, publicChannel } from "@/lib/app/session/controller";
import { askWaiting } from "@/lib/app/session/engine";
import { FOCUS_LOST_AFTER_MS } from "@/lib/app/session/focus";
import { BATCH_MS, createFocusQueue, memoryFocusStore } from "@/lib/app/session/focus-queue";
import { createOutbox } from "@/lib/app/session/outbox";
import { memoryStore } from "@/lib/app/session/outbox-store";
import { viewOf } from "@/lib/app/session/view";
import { T0, from, play, question, snap, snapshot } from "./support/session";
import { FakeTransport, wireQuestion } from "./support/transport";

/** The engine: questions to the teacher (F-09) are the session's, saved and sent on their own. */
const withAnon = (used: number, limit = 3) => snap(snapshot({ anon: { used, limit } }));
const at = (n: number) => T0 + n;

describe("the engine", () => {
  it("takes a question, cleaned, stamped with the server's time of writing", () => {
    // The phone runs 5 s ahead of the server.
    const s = from(play(snap(snapshot({ anon: { used: 0, limit: 3 } }), 5000)), { type: "ask", text: "  Why  is\n it so?  ", key: "a1", now: T0 + 5000 + 700 });
    expect(s.asks).toEqual([{ key: "a1", text: "Why is it so?", at: at(700), status: "sending" }]);
  });

  it("takes nothing that is empty, a key it has, or after the lesson has ended", () => {
    const base = play(withAnon(0));
    expect(from(base, { type: "ask", text: "   ", key: "a1", now: T0 }).asks).toEqual([]);
    const one = from(base, { type: "ask", text: "x", key: "a1", now: T0 });
    expect(from(one, { type: "ask", text: "y", key: "a1", now: T0 }).asks).toHaveLength(1);
    const ended = from(base, { type: "event", event: { type: "session.ended", serverNow: at(10), summary: null, sessionPoints: 0, sessionRank: 1 }, receivedAt: T0 + 10 });
    expect(from(ended, { type: "ask", text: "x", key: "a2", now: T0 + 20 }).asks).toEqual([]);
  });

  it("counts a question waiting to be sent against the limit, so a third cannot be queued past it", () => {
    let s = play(withAnon(1, 3));
    s = from(s, { type: "ask", text: "one", key: "a1", now: T0 }, { type: "ask", text: "two", key: "a2", now: T0 }, { type: "ask", text: "three", key: "a3", now: T0 });
    expect(s.asks.map((a) => a.key)).toEqual(["a1", "a2"]);
    expect(viewOf(s, T0).askRemaining).toBe(0);
  });

  it("goes on counting while the limit is unknown, and says so", () => {
    const s = from(play(snap(snapshot({ anon: null }))), { type: "ask", text: "x", key: "a1", now: T0 });
    expect(s.asks).toHaveLength(1);
    expect(viewOf(s, T0)).toMatchObject({ askLimit: null, askRemaining: null });
  });

  it("moves from sending to saved to sent, and the count follows the server's", () => {
    let s = from(play(withAnon(0, 2)), { type: "ask", text: "x", key: "a1", now: T0 });
    expect(viewOf(s, T0).askRemaining).toBe(1);
    s = from(s, { type: "ask.saved", key: "a1" });
    expect(s.asks[0].status).toBe("saved");
    s = from(s, { type: "ask.sent", key: "a1", duplicate: false });
    expect(s.asks[0].status).toBe("sent");
    expect(s.anon).toEqual({ used: 1, limit: 2 });
    expect(viewOf(s, T0).askRemaining).toBe(1);
    // The snapshot is the truth, whatever the phone added up.
    s = from(s, withAnon(2, 2));
    expect(viewOf(s, T0).askRemaining).toBe(0);
  });

  it("does not count a duplicate twice: the server counted it the first time", () => {
    const s = from(play(withAnon(1)), { type: "ask", text: "x", key: "a1", now: T0 }, { type: "ask.sent", key: "a1", duplicate: true });
    expect(s.anon).toEqual({ used: 1, limit: 3 });
  });

  it("learns from a refused one that there is no room, whatever it thought", () => {
    const s = from(play(withAnon(0, 3)), { type: "ask", text: "x", key: "a1", now: T0 }, { type: "ask.refused", key: "a1", reason: "limit_reached" });
    expect(s.asks[0].status).toBe("limit_reached");
    expect(s.anon).toEqual({ used: 3, limit: 3 });
    expect(viewOf(s, T0).askRemaining).toBe(0);
    expect(askWaiting(s.asks[0])).toBe(false);
  });

  it("keeps a final outcome: a late 'saved' or 'sent' cannot undo it", () => {
    let s = from(play(withAnon(0)), { type: "ask", text: "x", key: "a1", now: T0 }, { type: "ask.refused", key: "a1", reason: "session_ended" });
    s = from(s, { type: "ask.saved", key: "a1" }, { type: "ask.sent", key: "a1", duplicate: false });
    expect(s.asks[0].status).toBe("session_ended");
  });

  it("restores one that was waiting after a reload, once", () => {
    const s = from(play(withAnon(0, 3)), { type: "ask.restore", key: "a1", text: "x", at: at(5) }, { type: "ask.restore", key: "a1", text: "x", at: at(5) });
    expect(s.asks).toEqual([{ key: "a1", text: "x", at: at(5), status: "saved" }]);
    expect(viewOf(s, T0).askRemaining).toBe(2);
  });
});

/** The controller: through the outbox, with the server's clock, and the focus flag over a real question. */
const SKEW = 90_000;
const PUBLIC = publicChannel("s1");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 + SKEW);
});
afterEach(() => vi.useRealTimers());

const serverNow = () => Date.now() - SKEW;

function setup(over: { snapshot?: Partial<StudentSessionState>; send?: Parameters<typeof createOutbox>[0]["send"]; enabled?: () => boolean } = {}) {
  const transport = new FakeTransport();
  const { serverNow: _ignored, ...rest } = snapshot({ anon: { used: 0, limit: 3 }, ...over.snapshot });
  void _ignored;
  // The fake server counts what it takes, as the real one does, so the snapshot after a send agrees with it.
  const server = { used: rest.anon?.used ?? 0 };
  const getSnapshot = vi.fn(async () => ({ ...rest, anon: rest.anon && { ...rest.anon, used: server.used }, serverNow: serverNow() }) as StudentSessionState);
  const inner: NonNullable<typeof over.send> = over.send ?? (async () => ({ accepted: true, duplicate: false }));
  const send = vi.fn(async (...args: Parameters<typeof inner>) => {
    try {
      const receipt = await inner(...args);
      server.used++;
      return receipt;
    } catch (e) {
      if (e instanceof ApiError && e.code === "limit_reached") server.used = rest.anon?.limit ?? 3;
      throw e;
    }
  });
  const outbox = createOutbox({ store: memoryStore(), send, random: () => 0.5 });
  const sendFocus = vi.fn(async () => {});
  const focus = createFocusQueue({ store: memoryFocusStore(), send: sendFocus, random: () => 0.5 });
  let n = 0;
  const handle = createSessionHandle({
    sessionId: "s1",
    meId: "me",
    transport,
    getSnapshot,
    outbox,
    focus,
    focusEnabled: over.enabled,
    newKey: () => `k${++n}`,
    random: () => 0.5,
  });
  return { transport, handle, send, outbox, sendFocus, getSnapshot };
}

describe("asking through the session", () => {
  it("saves the question in the outbox with no question to answer, and the time it was written in server terms", async () => {
    const { handle, send } = setup();
    await vi.advanceTimersByTimeAsync(0);
    const written = serverNow();
    expect(handle.ask("Can you explain it again?")).toBe("k1");
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledWith("s1", { sessionQuestionId: "", response: "Can you explain it again?", answeredAt: written, idempotencyKey: "k1" }, "ask");
    expect(handle.getView().asks[0]).toMatchObject({ key: "k1", status: "sent" });
    expect(handle.getView().askRemaining).toBe(2);
  });

  it("refuses to take an empty one or one past the limit", async () => {
    const { handle, send } = setup({ snapshot: { anon: { used: 3, limit: 3 } } });
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.ask("one more")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps it when there is no signal, says so, and sends it again with the same key", async () => {
    let up = false;
    const { handle, send, outbox } = setup({
      send: async () => {
        if (!up) throw new ApiError("network");
        return { accepted: true, duplicate: false };
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    handle.ask("Is it on the test?");
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.getView().asks[0].status).toBe("saved");
    expect(outbox.getStatus()).toMatchObject({ pending: 1, pendingAsks: 1, failing: true });
    // The phone cannot send a second one past the limit while the first waits.
    expect(handle.getView().askRemaining).toBe(2);

    up = true;
    await outbox.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.getView().asks[0].status).toBe("sent");
    expect(new Set(send.mock.calls.map((c) => c[1].idempotencyKey))).toEqual(new Set(["k1"]));
  });

  it("is told by the server that the limit is reached, and shows no room left", async () => {
    const { handle } = setup({ send: async () => Promise.reject(new ApiError("limit_reached")) });
    await vi.advanceTimersByTimeAsync(0);
    handle.ask("a fourth");
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.getView().asks[0].status).toBe("limit_reached");
    expect(handle.getView().askRemaining).toBe(0);
  });

  it("is told the lesson has ended", async () => {
    const { handle } = setup({ send: async () => Promise.reject(new ApiError("session_ended")) });
    await vi.advanceTimersByTimeAsync(0);
    handle.ask("too late");
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.getView().asks[0].status).toBe("session_ended");
  });

  it("picks a question back up from the outbox after a reload", async () => {
    const store = memoryStore();
    await store.put({ kind: "ask", key: "old", studentId: "me", sessionId: "s1", sessionQuestionId: "", response: "Left from before", answeredAt: serverNow() - 5000, savedAt: Date.now() });
    const transport = new FakeTransport();
    const outbox = createOutbox({ store, send: async () => Promise.reject(new ApiError("network")), random: () => 0.5 });
    const handle = createSessionHandle({
      sessionId: "s1",
      meId: "me",
      transport,
      getSnapshot: async () => ({ ...snapshot({ anon: { used: 1, limit: 3 } }), serverNow: serverNow() }),
      outbox,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.getView().asks).toEqual([{ key: "old", text: "Left from before", at: serverNow() - 5000, status: "saved" }]);
    // One at the server, one waiting on the phone.
    expect(handle.getView().askRemaining).toBe(1);
  });
});

describe("the focus flag through the session", () => {
  const open = async (h: ReturnType<typeof setup>) => {
    await vi.advanceTimersByTimeAsync(0);
    h.transport.push(PUBLIC, "question.opened", { server_now: iso(serverNow()), question: wireQuestion(question(1, { firedAt: serverNow(), closesAt: serverNow() + 60_000 })) });
  };

  it("sends lost and back for a student who leaves during an open question, with server-clock times and the question's id", async () => {
    const h = setup();
    await open(h);
    const left = serverNow();
    h.handle.focus("hidden");
    await vi.advanceTimersByTimeAsync(FOCUS_LOST_AFTER_MS + BATCH_MS);
    expect(h.sendFocus).toHaveBeenCalledWith("s1", [{ type: "lost", at: left, sessionQuestionId: "q1" }]);
    const came = serverNow();
    h.handle.focus("visible");
    await vi.advanceTimersByTimeAsync(BATCH_MS);
    expect(h.sendFocus).toHaveBeenLastCalledWith("s1", [{ type: "back", at: came, sessionQuestionId: "q1" }]);
  });

  it("records nothing between questions", async () => {
    const h = setup();
    await vi.advanceTimersByTimeAsync(0);
    h.handle.focus("hidden");
    await vi.advanceTimersByTimeAsync(20_000);
    h.handle.focus("visible");
    await vi.advanceTimersByTimeAsync(BATCH_MS);
    expect(h.sendFocus).not.toHaveBeenCalled();
  });

  it("records nothing once the question has closed, and nothing after the lesson", async () => {
    const h = setup();
    await open(h);
    h.transport.push(PUBLIC, "question.closed", { server_now: iso(serverNow() + 1), session_question_id: "q1" });
    h.handle.focus("hidden");
    await vi.advanceTimersByTimeAsync(20_000);
    h.handle.focus("visible");
    await vi.advanceTimersByTimeAsync(BATCH_MS);
    expect(h.sendFocus).not.toHaveBeenCalled();
  });

  it("records nothing for a student who has not been told", async () => {
    const h = setup({ enabled: () => false });
    await open(h);
    h.handle.focus("hidden");
    await vi.advanceTimersByTimeAsync(20_000);
    h.handle.focus("visible");
    await vi.advanceTimersByTimeAsync(BATCH_MS);
    expect(h.sendFocus).not.toHaveBeenCalled();
  });

  it("never touches the student's screen: the view is the same before, during and after", async () => {
    const h = setup();
    await open(h);
    const before = h.handle.getView();
    h.handle.focus("hidden");
    await vi.advanceTimersByTimeAsync(10_000);
    const during = h.handle.getView();
    h.handle.focus("visible");
    expect(during.stage).toBe(before.stage);
    expect(h.handle.getView().stage).toBe("answering");
    // And the student can still answer.
    h.handle.answer("1");
    expect(h.handle.getView().picked).toBe("1");
  });
});

