import { IDBDatabase, IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/app/api/errors";
import type { AnswerInput, SubmissionKind } from "@/lib/app/api/types";
import { MAX_AGE_MS, createOutbox, type AnswerOutcome, type NewAnswer, type Outbox } from "@/lib/app/session/outbox";
import { indexedDbStore, memoryStore, type OutboxStore } from "@/lib/app/session/outbox-store";
import { backoffDelay } from "@/lib/app/session/transport";
import { T0 } from "./support/session";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

const answer = (key: string, at = T0, over: Partial<NewAnswer> = {}): NewAnswer => ({
  kind: "answer",
  key,
  studentId: "me",
  sessionId: "s1",
  sessionQuestionId: "q1",
  response: "2",
  answeredAt: at,
  ...over,
});

type Send = (sessionId: string, a: AnswerInput, kind: SubmissionKind) => Promise<{ accepted: boolean; duplicate: boolean }>;
const ok: Send = async () => ({ accepted: true, duplicate: false });
const down: Send = async () => {
  throw new ApiError("network");
};
const refuses = (code: ConstructorParameters<typeof ApiError>[0]): Send => async () => {
  throw new ApiError(code);
};

/** The send function the outbox was given, as a mock. */
function setup(send: Send, store: OutboxStore = memoryStore()) {
  const sender = vi.fn(send);
  const outbox: Outbox = createOutbox({ store, send: sender, random: () => 0.5 });
  const heard: AnswerOutcome[] = [];
  outbox.subscribe((o) => heard.push(o));
  return { outbox, store, heard, sender };
}

describe("saving before sending", () => {
  it("writes the answer to the store before the first attempt to send it", async () => {
    const order: string[] = [];
    const store = memoryStore();
    const put = store.put;
    store.put = async (r) => (order.push("put"), put(r));
    const { outbox } = setup(async () => (order.push("send"), { accepted: true, duplicate: false }), store);
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(["put", "send"]);
  });

  it("keeps the answer's own time, whatever the phone's clock says by the time it is sent", async () => {
    const { outbox, sender } = setup(down);
    await outbox.start("me");
    await outbox.enqueue(answer("k1", T0 + 4000));
    // Ten minutes pass offline; the phone's clock is nowhere near the server's anyway.
    vi.setSystemTime(T0 + 600_000);
    await outbox.flush();
    expect(sender.mock.calls.at(-1)![1].answeredAt).toBe(T0 + 4000);
  });

  it("sends the same body every time: session, question, response, time and key", async () => {
    const { outbox, sender } = setup(down);
    await outbox.start("me");
    await outbox.enqueue(answer("k1", T0 + 1234));
    await outbox.flush();
    await outbox.flush();
    const bodies = sender.mock.calls.map((c) => c[1]);
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    for (const body of bodies) expect(body).toEqual({ sessionQuestionId: "q1", response: "2", answeredAt: T0 + 1234, idempotencyKey: "k1" });
    expect(sender.mock.calls.every((c) => c[0] === "s1")).toBe(true);
  });
});

describe("what the server says", () => {
  it("delivered: the record is forgotten and the student is told", async () => {
    const { outbox, heard, store } = setup(ok);
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(heard.map((h) => h.type)).toEqual(["delivered"]);
    expect(await store.all()).toEqual([]);
    expect(outbox.getStatus()).toEqual({ pending: 0, failing: false });
  });

  it("already_answered is delivered: the server has an answer, and the first one stands", async () => {
    const { outbox, heard, store } = setup(refuses("already_answered"));
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(heard).toMatchObject([{ type: "delivered", duplicate: true }]);
    expect(await store.all()).toEqual([]);
  });

  it("a duplicate receipt is delivered too", async () => {
    const { outbox, heard } = setup(async () => ({ accepted: true, duplicate: true }));
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(heard).toMatchObject([{ type: "delivered", duplicate: true }]);
  });

  it("question_closed beyond the grace: too late, and not tried again", async () => {
    const { outbox, heard, sender, store } = setup(refuses("question_closed"));
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heard.map((h) => h.type)).toEqual(["late"]);
    expect(sender).toHaveBeenCalledOnce();
    expect(await store.all()).toEqual([]);
  });

  it("session_ended: the lesson is over, and the answer is let go", async () => {
    const { outbox, heard, sender } = setup(refuses("session_ended"));
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heard.map((h) => h.type)).toEqual(["ended"]);
    expect(sender).toHaveBeenCalledOnce();
  });

  it.each(["validation_failed", "not_found"] as const)("%s: the server will never take it, so it is dropped", async (code) => {
    const { outbox, heard, sender } = setup(refuses(code));
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heard).toMatchObject([{ type: "dropped", code }]);
    expect(sender).toHaveBeenCalledOnce();
  });

  it("a signed-out student's answer is kept and not retried until they sign in again (EC-AUTH-01)", async () => {
    let signedIn = false;
    const { outbox, sender, store } = setup(async () => {
      if (!signedIn) throw new ApiError("signed_in_elsewhere");
      return { accepted: true, duplicate: false };
    });
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sender).toHaveBeenCalledOnce();
    expect(await store.all()).toHaveLength(1);
    expect(outbox.getStatus().failing).toBe(false);
    signedIn = true;
    await outbox.start("me");
    expect(await store.all()).toEqual([]);
  });
});

describe("retrying", () => {
  it("backs off 1 s, 2 s, 4 s and so on while the network is down, with the same key each time", async () => {
    const { outbox, sender, heard } = setup(down);
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(outbox.getStatus()).toEqual({ pending: 1, failing: true });
    expect(heard[0]).toMatchObject({ type: "saved" });
    const waits = [1, 2, 4, 8].map((n) => backoffDelay(Math.log2(n), () => 0.5));
    expect(waits).toEqual([1000, 2000, 4000, 8000]);

    let calls = 1;
    for (const wait of waits) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(sender).toHaveBeenCalledTimes(calls);
      await vi.advanceTimersByTimeAsync(1);
      expect(sender).toHaveBeenCalledTimes(++calls);
    }
    expect(new Set(sender.mock.calls.map((c) => c[1].idempotencyKey))).toEqual(new Set(["k1"]));
  });

  it("never waits longer than 15 s between tries", async () => {
    const { outbox, sender } = setup(down);
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(1 + 2 + 4 + 8 + 1000);
    const before = sender.mock.calls.length;
    await vi.advanceTimersByTimeAsync(16_000);
    expect(sender.mock.calls.length).toBeGreaterThan(before);
  });

  it("sends at once, not after the backoff, when the connection may be back", async () => {
    let up = false;
    const { outbox, sender, heard } = setup(async () => {
      if (!up) throw new ApiError("network");
      return { accepted: true, duplicate: false };
    });
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(sender).toHaveBeenCalledTimes(1);
    up = true;
    await outbox.flush(); // the `online` event
    expect(sender).toHaveBeenCalledTimes(2);
    expect(heard.at(-1)).toMatchObject({ type: "delivered" });
    // And the timer that was waiting is gone: nothing more is sent.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it("a flush asked for while one is running is run again after it", async () => {
    let calls = 0;
    const { outbox } = setup(async () => {
      calls++;
      if (calls === 1) throw new ApiError("network");
      return { accepted: true, duplicate: false };
    });
    await outbox.start("me");
    const enqueued = outbox.enqueue(answer("k1"));
    await enqueued;
    await outbox.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(outbox.getStatus().pending).toBe(0);
  });

  it("obeys a Retry-After longer than its own backoff", async () => {
    const send = vi.fn().mockRejectedValueOnce(new ApiError("rate_limited", { retryAfter: 30 })).mockResolvedValue({ accepted: true, duplicate: false });
    const { outbox } = setup(send);
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(29_000);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("order and dedupe", () => {
  it("sends one answer at a time, oldest answer first, whatever order they were saved in", async () => {
    const store = memoryStore();
    // Saved out of order, as they would be read back after a reload.
    await store.put({ ...answer("third", T0 + 3000, { sessionQuestionId: "q3" }), savedAt: T0 });
    await store.put({ ...answer("first", T0 + 1000, { sessionQuestionId: "q1" }), savedAt: T0 });
    await store.put({ ...answer("second", T0 + 2000, { sessionQuestionId: "q2" }), savedAt: T0 });
    const seen: string[] = [];
    let active = 0;
    let overlap = false;
    const { outbox } = setup(async (_s, a) => {
      if (++active > 1) overlap = true;
      await Promise.resolve();
      seen.push(a.idempotencyKey);
      active--;
      return { accepted: true, duplicate: false };
    }, store);
    await outbox.start("me");
    expect(seen).toEqual(["first", "second", "third"]);
    expect(overlap).toBe(false);
  });

  it("a failure stops the line: the next answer is not tried for the same reason", async () => {
    const store = memoryStore();
    await store.put({ ...answer("b", T0 + 2000, { sessionQuestionId: "q2" }), savedAt: T0 });
    await store.put({ ...answer("a", T0 + 1000, { sessionQuestionId: "q1" }), savedAt: T0 });
    const { outbox, sender } = setup(down, store);
    await outbox.start("me");
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender.mock.calls[0][1].idempotencyKey).toBe("a");
    expect(outbox.getStatus()).toEqual({ pending: 2, failing: true });
  });

  it("holds one record per key: the same answer saved twice while it waits is one answer", async () => {
    const { outbox, store } = setup(down);
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await outbox.enqueue(answer("k1"));
    expect(await store.all()).toHaveLength(1);
    expect(outbox.getStatus().pending).toBe(1);
  });

  it("a delivery that is repeated, because the reply was lost, is harmless: the server answers duplicate", async () => {
    let first = true;
    const { outbox, heard } = setup(async () => {
      if (first) {
        first = false;
        throw new ApiError("network"); // the request got there, the reply did not
      }
      return { accepted: true, duplicate: true };
    });
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(heard.map((h) => h.type)).toEqual(["saved", "delivered"]);
  });

  it("finds the answer saved for a question", async () => {
    const { outbox } = setup(down);
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    expect(outbox.pendingFor("me", "s1", "q1")?.key).toBe("k1");
    expect(outbox.pendingFor("me", "s1", "q2")).toBeNull();
    expect(outbox.pendingFor("someone-else", "s1", "q1")).toBeNull();
  });
});

describe("an opener's vote and reason", () => {
  const vote = (key: string, at = T0) => answer(key, at, { kind: "vote", sessionQuestionId: "o1", response: "1" });
  const reasonOf = (key: string, at = T0) => answer(key, at, { kind: "reason", sessionQuestionId: "o1", response: "No air." });

  it("are sent to their own endpoints in the order they were given, with the kind they were saved under", async () => {
    let up = false;
    const { outbox, sender } = setup(async () => {
      if (!up) throw new ApiError("network");
      return { accepted: true, duplicate: false };
    });
    await outbox.start("me");
    // The reason was saved first and the vote second, as can happen when the phone restarts between them.
    await outbox.enqueue(reasonOf("r1", T0 + 3000));
    await outbox.enqueue(vote("v1", T0 + 1000));
    up = true;
    sender.mockClear();
    await outbox.flush();
    expect(sender.mock.calls.map((c) => [c[2], c[1].idempotencyKey])).toEqual([
      ["vote", "v1"],
      ["reason", "r1"],
    ]);
    expect(sender.mock.calls[1][1]).toMatchObject({ response: "No air.", answeredAt: T0 + 3000, sessionQuestionId: "o1" });
  });

  it("keep the reason behind a vote that cannot be sent yet, and send both when the connection is back", async () => {
    let up = false;
    const { outbox, sender, heard } = setup(async () => {
      if (!up) throw new ApiError("network");
      return { accepted: true, duplicate: false };
    });
    await outbox.start("me");
    await outbox.enqueue(vote("v1", T0 + 1000));
    await outbox.enqueue(reasonOf("r1", T0 + 3000));
    await vi.advanceTimersByTimeAsync(0);
    // A failure stops the line: the reason is not tried before the vote has gone.
    expect(new Set(sender.mock.calls.map((c) => c[2]))).toEqual(new Set(["vote"]));
    expect(outbox.getStatus().pending).toBe(2);
    up = true;
    await outbox.flush();
    expect(heard.filter((h) => h.type === "delivered").map((h) => h.record.kind)).toEqual(["vote", "reason"]);
    expect(outbox.getStatus().pending).toBe(0);
  });

  it("are told late or ended like an answer", async () => {
    const closed = setup(refuses("question_closed"));
    await closed.outbox.start("me");
    await closed.outbox.enqueue(reasonOf("r1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(closed.heard).toMatchObject([{ type: "late", record: { kind: "reason" } }]);
    const noVote = setup(refuses("validation_failed"));
    await noVote.outbox.start("me");
    await noVote.outbox.enqueue(reasonOf("r2"));
    await vi.advanceTimersByTimeAsync(0);
    expect(noVote.heard).toMatchObject([{ type: "dropped", code: "validation_failed" }]);
  });

  it("are found by kind", async () => {
    const { outbox } = setup(down);
    await outbox.start("me");
    await outbox.enqueue(vote("v1"));
    await outbox.enqueue(reasonOf("r1", T0 + 1));
    expect(outbox.pendingFor("me", "s1", "o1", "vote")?.key).toBe("v1");
    expect(outbox.pendingFor("me", "s1", "o1", "reason")?.key).toBe("r1");
    expect(outbox.pendingFor("me", "s1", "o1", "answer")).toBeNull();
  });
});

describe("whose answers they are", () => {
  it("sends only the signed-in student's, and keeps the others' for when they sign in", async () => {
    const store = memoryStore();
    await store.put({ ...answer("mine"), savedAt: T0 });
    await store.put({ ...answer("theirs", T0, { studentId: "them" }), savedAt: T0 });
    const { outbox, sender } = setup(ok, store);
    await outbox.start("me");
    expect(sender.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(["mine"]);
    expect((await store.all()).map((r) => r.key)).toEqual(["theirs"]);
    expect(outbox.getStatus().pending).toBe(0);
    outbox.stop();
    await outbox.flush();
    expect(sender).toHaveBeenCalledTimes(1);
  });
});

describe("how long an answer is kept", () => {
  it("drops an answer older than 24 hours without sending it", async () => {
    const store = memoryStore();
    await store.put({ ...answer("old"), savedAt: T0 - MAX_AGE_MS - 1 });
    await store.put({ ...answer("fresh", T0, { sessionQuestionId: "q2" }), savedAt: T0 - MAX_AGE_MS + 60_000 });
    const { outbox, sender, heard } = setup(ok, store);
    await outbox.start("me");
    expect(sender.mock.calls.map((c) => c[1].idempotencyKey)).toEqual(["fresh"]);
    expect(heard.map((h) => h.type)).toEqual(["expired", "delivered"]);
    expect(await store.all()).toEqual([]);
  });

  it("drops an answer that outlives the limit while the phone has been offline", async () => {
    const { outbox, heard, store } = setup(down);
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(T0 + MAX_AGE_MS + 1000);
    await outbox.flush();
    expect(heard.at(-1)).toMatchObject({ type: "expired" });
    expect(await store.all()).toEqual([]);
  });
});

describe("surviving a reload", () => {
  // fake-indexeddb schedules its work with timers of its own, so this part runs on the real ones.
  beforeEach(() => vi.useRealTimers());
  const reopen = (factory: IDBFactory) => indexedDbStore(factory);

  it("a new page on the same IndexedDB finds the answer and sends it", async () => {
    const factory = new IDBFactory();
    const first = setup(down, reopen(factory));
    await first.outbox.start("me");
    await first.outbox.enqueue(answer("k1", T0 + 5000));
    await first.outbox.flush();
    expect(first.outbox.getStatus().pending).toBe(1);
    first.outbox.stop(); // the page is gone

    // The page is gone (a reload, an app kill). A new one opens on the same disk, and the network is back.
    const second = setup(ok, reopen(factory));
    await second.outbox.load();
    expect(second.outbox.pendingFor("me", "s1", "q1")).toMatchObject({ key: "k1", answeredAt: T0 + 5000, response: "2", sessionId: "s1" });
    await second.outbox.start("me");
    expect(second.sender).toHaveBeenCalledOnce();
    expect(second.sender.mock.calls[0][1]).toMatchObject({ idempotencyKey: "k1", answeredAt: T0 + 5000 });

    // Delivered, so a third page finds nothing.
    const third = setup(ok, reopen(factory));
    await third.outbox.load();
    expect(third.outbox.pendingFor("me", "s1", "q1")).toBeNull();
    expect(await reopen(factory).all()).toEqual([]);
  });

  it("falls back to memory where IndexedDB is missing, and still retries for as long as the page lives", async () => {
    const store = indexedDbStore(undefined);
    const { outbox, sender } = setup(down, store);
    await outbox.start("me");
    await outbox.enqueue(answer("k1"));
    expect((await store.all()).map((r) => r.key)).toEqual(["k1"]);
    await outbox.flush();
    await outbox.flush();
    expect(sender.mock.calls.length).toBeGreaterThanOrEqual(2);
    outbox.stop();
  });

  it("falls back to memory where IndexedDB refuses to open (a private window)", async () => {
    const refusing = {
      open() {
        const request: Record<string, unknown> = {};
        queueMicrotask(() => (request.onerror as () => void)?.());
        Object.defineProperty(request, "error", { get: () => new Error("denied") });
        return request;
      },
    } as unknown as IDBFactory;
    const store = indexedDbStore(refusing);
    await store.put({ ...answer("k1"), savedAt: T0 });
    expect((await store.all()).map((r) => r.key)).toEqual(["k1"]);
    await store.remove("k1");
    expect(await store.all()).toEqual([]);
  });

  it("falls back to memory for one write that the disk refuses (full disk)", async () => {
    const factory = new IDBFactory();
    const store = indexedDbStore(factory);
    await store.all(); // open it
    const spy = vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });
    await store.put({ ...answer("k1"), savedAt: T0 });
    spy.mockRestore();
    expect((await store.all()).map((r) => r.key)).toEqual(["k1"]);
  });
});
