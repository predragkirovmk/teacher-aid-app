import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/app/api/errors";
import type { FocusEventInput } from "@/lib/app/api/types";
import { BATCH_MAX, BATCH_MS, createFocusQueue, memoryFocusStore, type FocusStore } from "@/lib/app/session/focus-queue";
import { MAX_AGE_MS } from "@/lib/app/session/outbox";
import { T0 } from "./support/session";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

const event = (type: "lost" | "back", at: number, id = "q1", over: Record<string, string> = {}) => ({
  type,
  at,
  sessionQuestionId: id,
  studentId: "me",
  sessionId: "s1",
  ...over,
});

type Send = (sessionId: string, events: FocusEventInput[]) => Promise<void>;
function setup(send: Send = async () => {}, store: FocusStore = memoryFocusStore()) {
  const sender = vi.fn(send);
  const queue = createFocusQueue({ store, send: sender, random: () => 0.5 });
  return { queue, sender, store };
}
const down: Send = async () => {
  throw new ApiError("network");
};
const refuses =
  (code: ConstructorParameters<typeof ApiError>[0]): Send =>
  async () => {
    throw new ApiError(code);
  };

describe("batching", () => {
  it("sends events written close together in one request, oldest first", async () => {
    const { queue, sender } = setup();
    queue.start("me");
    queue.add(event("back", T0 + 9000));
    queue.add(event("lost", T0 + 4000));
    expect(sender).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(BATCH_MS);
    expect(sender).toHaveBeenCalledOnce();
    expect(sender).toHaveBeenCalledWith("s1", [
      { type: "lost", at: T0 + 4000, sessionQuestionId: "q1" },
      { type: "back", at: T0 + 9000, sessionQuestionId: "q1" },
    ]);
    expect(queue.size("me")).toBe(0);
  });

  it("sends nothing but a time, a type and a question: no other field leaves the phone", async () => {
    const { queue, sender } = setup();
    queue.start("me");
    queue.add(event("lost", T0));
    await vi.advanceTimersByTimeAsync(BATCH_MS);
    expect(Object.keys(sender.mock.calls[0][1][0]).sort()).toEqual(["at", "sessionQuestionId", "type"]);
  });

  it("splits what is too many for one request, and sends it all", async () => {
    const { queue, sender } = setup();
    queue.start("me");
    for (let i = 0; i < BATCH_MAX + 5; i++) queue.add(event(i % 2 ? "back" : "lost", T0 + i));
    await vi.advanceTimersByTimeAsync(BATCH_MS);
    expect(sender.mock.calls.map((c) => c[1].length)).toEqual([BATCH_MAX, 5]);
  });

  it("keeps each lesson's events apart", async () => {
    const { queue, sender } = setup();
    queue.start("me");
    queue.add(event("lost", T0, "q1"));
    queue.add(event("lost", T0 + 1, "q9", { sessionId: "s2" }));
    await vi.advanceTimersByTimeAsync(BATCH_MS);
    expect(sender.mock.calls.map((c) => c[0]).sort()).toEqual(["s1", "s2"]);
  });
});

describe("with no signal (EC-FOC-04)", () => {
  it("keeps the events with their own times, and sends them all, again and again, until the server has them", async () => {
    let up = false;
    const { queue, sender } = setup(async () => {
      if (!up) throw new ApiError("network");
    });
    queue.start("me");
    queue.add(event("lost", T0 + 1000));
    queue.add(event("back", T0 + 8000));
    await vi.advanceTimersByTimeAsync(BATCH_MS);
    expect(queue.size("me")).toBe(2);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(sender.mock.calls.length).toBeGreaterThan(1);
    // A later event waits with the rest and does not start the retry over.
    queue.add(event("lost", T0 + 30_000));
    up = true;
    await queue.flush();
    expect(queue.size("me")).toBe(0);
    const last = sender.mock.calls.at(-1)![1];
    expect(last.map((e) => e.at)).toEqual([T0 + 1000, T0 + 8000, T0 + 30_000]);
  });

  it("survives a reload: a new queue over the same store sends what the old one kept", async () => {
    const store = memoryFocusStore();
    const first = setup(down, store);
    first.queue.start("me");
    first.queue.add(event("lost", T0 + 500));
    await vi.advanceTimersByTimeAsync(BATCH_MS);
    expect(first.queue.size("me")).toBe(1);

    const second = setup(async () => {}, store);
    second.queue.start("me");
    await vi.advanceTimersByTimeAsync(0);
    expect(second.sender).toHaveBeenCalledWith("s1", [{ type: "lost", at: T0 + 500, sessionQuestionId: "q1" }]);
    expect(second.queue.size("me")).toBe(0);
  });
});

describe("what the server says", () => {
  it.each(["session_ended", "validation_failed", "not_found"] as const)("drops events it refuses as %s: sending them again would only fail again", async (code) => {
    const { queue, sender } = setup(refuses(code));
    queue.start("me");
    queue.add(event("lost", T0));
    await vi.advanceTimersByTimeAsync(BATCH_MS);
    expect(queue.size("me")).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sender).toHaveBeenCalledOnce();
  });

  it("keeps them when the student is signed out, and does not retry until they sign in", async () => {
    const { queue, sender } = setup(refuses("unauthenticated"));
    queue.start("me");
    queue.add(event("lost", T0));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sender).toHaveBeenCalledOnce();
    expect(queue.size("me")).toBe(1);
  });

  it("retries on a server error, with the same events", async () => {
    let fail = true;
    const { queue, sender } = setup(async () => {
      if (fail) throw new ApiError("server_error");
    });
    queue.start("me");
    queue.add(event("lost", T0));
    await vi.advanceTimersByTimeAsync(BATCH_MS);
    fail = false;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sender.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(sender.mock.calls[0][1]).toEqual(sender.mock.calls.at(-1)![1]);
    expect(queue.size("me")).toBe(0);
  });
});

describe("whose events", () => {
  it("never sends a student's events under another's session", async () => {
    const store = memoryFocusStore();
    const first = setup(down, store);
    first.queue.start("a");
    first.queue.add(event("lost", T0, "q1", { studentId: "a" }));
    await vi.advanceTimersByTimeAsync(BATCH_MS);

    const second = setup(async () => {}, store);
    second.queue.start("b");
    await vi.advanceTimersByTimeAsync(5000);
    expect(second.sender).not.toHaveBeenCalled();
    expect(second.queue.size("a")).toBe(1);
  });

  it("drops events older than the outbox keeps an answer", async () => {
    const { queue, sender } = setup(down);
    queue.start("me");
    queue.add(event("lost", T0));
    await vi.advanceTimersByTimeAsync(BATCH_MS);
    vi.setSystemTime(T0 + MAX_AGE_MS + 1000);
    await queue.flush();
    expect(queue.size("me")).toBe(0);
    expect(sender).toHaveBeenCalledTimes(1);
  });
});
