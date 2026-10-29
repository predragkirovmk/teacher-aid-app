import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/teacher/api/errors";
import type { SettledPromise } from "@/lib/teacher/api/client";

// The cache reads the adapter from client.ts, which builds the demo school in the browser; the tests give it their own.
vi.mock("@/lib/teacher/api/client", () => ({ api: { subscribe: () => () => {} }, serverApi: null }));

const { invalidate, resetQueries, seed, Slot, slotFor } = await import("@/lib/teacher/api/query");

/** A call that is still on its way: it answers when the test says so. */
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** What the mock adapter returns for a read: already settled, so the first render can have the data. */
const settled = <T>(value: T): SettledPromise<T> => Object.assign(Promise.resolve(value), { settled: { ok: true as const, value } });

/** Let the promises that have settled run their continuations. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let n = 0;
let key: string;
beforeEach(() => {
  key = `test-${++n}`;
});

describe("reading", () => {
  test("an adapter that answers at once gives the data in the same read", () => {
    const slot = new Slot(key, () => settled(["a", "b"]));
    expect(slot.read().data).toEqual(["a", "b"]);
  });

  test("a slow adapter is asked once, however often the screen reads while it waits", async () => {
    const call = pending<string>();
    const load = vi.fn(() => call.promise);
    const slot = new Slot(key, load);
    expect(slot.read().data).toBeUndefined();
    slot.read();
    slot.read();
    expect(load).toHaveBeenCalledTimes(1);
    call.resolve("ready");
    await flush();
    expect(slot.read().data).toBe("ready");
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("the server render has nothing to show when there is no demo school to ask", () => {
    const slot = new Slot(key, () => settled("x"));
    expect(slot.readServer().data).toBeUndefined();
  });
});

describe("a change somewhere else", () => {
  test("a slot nobody is reading asks again on the next read, once, not once per read", async () => {
    const first = pending<string>();
    const second = pending<string>();
    const load = vi.fn<() => Promise<string>>().mockReturnValueOnce(first.promise).mockReturnValue(second.promise);
    const slot = new Slot(key, load);
    slot.read();
    first.resolve("old");
    await flush();

    slot.refresh(); // nobody is listening: it only notes that its answer may be old
    expect(load).toHaveBeenCalledTimes(1);
    slot.read();
    slot.read();
    slot.read();
    expect(load).toHaveBeenCalledTimes(2);
    second.resolve("new");
    await flush();
    expect(slot.read().data).toBe("new");
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("a slot someone is reading loads again at once, and the old answer stays until the new one lands", async () => {
    const first = pending<string>();
    const second = pending<string>();
    const load = vi.fn<() => Promise<string>>().mockReturnValueOnce(first.promise).mockReturnValue(second.promise);
    const slot = new Slot(key, load);
    const heard = vi.fn();
    slot.subscribe(heard);
    slot.read();
    first.resolve("old");
    await flush();
    heard.mockClear();

    slot.refresh();
    expect(load).toHaveBeenCalledTimes(2);
    expect(slot.entry.data).toBe("old");
    second.resolve("new");
    await flush();
    expect(slot.entry.data).toBe("new");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  test("a slot that was never read does not ask until it is", () => {
    const load = vi.fn(() => settled("x"));
    const slot = new Slot(key, load);
    slot.refresh();
    expect(load).not.toHaveBeenCalled();
  });

  test("invalidate names slots by their key, or by the start of it before a colon, and leaves the rest", () => {
    const loads = { all: vi.fn(() => settled(1)), one: vi.fn(() => settled(2)), lookalike: vi.fn(() => settled(3)), other: vi.fn(() => settled(4)) };
    const slots = [
      slotFor(`${key}`, loads.all),
      slotFor(`${key}:l1`, loads.one),
      slotFor(`${key}x`, loads.lookalike),
      slotFor(`other-${key}`, loads.other),
    ];
    for (const slot of slots) {
      slot.subscribe(() => {});
      slot.read();
    }
    Object.values(loads).forEach((l) => l.mockClear());

    invalidate(key);
    expect(loads.all).toHaveBeenCalledTimes(1);
    expect(loads.one).toHaveBeenCalledTimes(1);
    expect(loads.lookalike).not.toHaveBeenCalled();
    expect(loads.other).not.toHaveBeenCalled();
  });
});

describe("races", () => {
  test("the newest ask wins, even when an older one lands after it", async () => {
    const older = pending<string>();
    const newer = pending<string>();
    const load = vi.fn<() => Promise<string>>().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const slot = new Slot(key, load);
    void slot.fetch(true);
    void slot.fetch(true);
    newer.resolve("newer");
    await flush();
    older.resolve("older");
    await flush();
    expect(slot.entry.data).toBe("newer");
  });

  test("an answer put in by the caller cancels one still on its way", async () => {
    const call = pending<string>();
    const slot = new Slot(key, () => call.promise);
    void slot.fetch(true);
    slot.put("saved");
    call.resolve("before the save");
    await flush();
    expect(slot.entry.data).toBe("saved");
  });

  test("putting an answer in tells the screens that read the slot", () => {
    const slot = new Slot(key, () => settled("x"));
    const heard = vi.fn();
    slot.subscribe(heard);
    slot.put("saved");
    expect(heard).toHaveBeenCalledTimes(1);
    expect(slot.entry.data).toBe("saved");
  });

  test("seed puts the answer of a change into the slot of that key", () => {
    const slot = slotFor(key, () => settled("x"));
    slot.read();
    seed(key, "from the change");
    expect(slot.entry.data).toBe("from the change");
    expect(() => seed(`${key}-never-read`, "nobody asked")).not.toThrow();
  });
});

describe("failures", () => {
  test("a failed refresh keeps the answer that was on screen and carries the error", async () => {
    const load = vi.fn<() => Promise<string>>().mockReturnValueOnce(Promise.resolve("on screen")).mockRejectedValueOnce(new ApiError("network"));
    const slot = new Slot(key, load);
    slot.read();
    await flush();
    expect(await slot.fetch(true)).toMatchObject({ code: "network" });
    expect(slot.entry.data).toBe("on screen");
    expect(slot.entry.error?.code).toBe("network");
  });

  test("the next good answer clears the error", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ApiError("server_error"))
      .mockResolvedValueOnce("fine");
    const slot = new Slot(key, load);
    slot.read();
    await flush();
    expect(slot.entry.data).toBeUndefined();
    expect(slot.entry.error?.code).toBe("server_error");
    expect(await slot.fetch(true)).toBeNull();
    expect(slot.entry).toEqual({ data: "fine", error: null });
  });

  test("something that is not an ApiError is read as an unknown failure", async () => {
    const slot = new Slot(key, () => Promise.reject(new TypeError("boom")));
    slot.read();
    await flush();
    expect(slot.entry.error?.code).toBe("unknown");
  });

  test("the same answer again keeps the object screens already hold, and tells nobody", async () => {
    const load = vi.fn(() => Promise.resolve({ items: [1, 2, 3] }));
    const slot = new Slot(key, load);
    const heard = vi.fn();
    slot.subscribe(heard);
    slot.read();
    await flush();
    const held = slot.entry;
    heard.mockClear();
    await slot.fetch(true);
    expect(slot.entry).toBe(held);
    expect(heard).not.toHaveBeenCalled();
  });
});

describe("a different teacher", () => {
  test("a reset drops the answer, so the next teacher never sees the last one's, and asks again on the next read", async () => {
    const load = vi.fn<() => Promise<string>>().mockResolvedValueOnce("first teacher's").mockResolvedValue("second teacher's");
    const slot = slotFor(key, load);
    slot.read();
    await flush();
    expect(slot.read().data).toBe("first teacher's");

    resetQueries();
    expect(slot.entry.data).toBeUndefined();
    slot.read();
    await flush();
    expect(slot.read().data).toBe("second teacher's");
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("tells the screens that are showing it, so they stop", () => {
    const slot = slotFor(key, () => settled("x"));
    slot.read();
    let told = 0;
    const stop = slot.subscribe(() => told++);
    resetQueries();
    stop();
    expect(told).toBe(1);
  });

  test("an answer that was still on its way when the teacher changed is not taken for the new one's", async () => {
    const late = pending<string>();
    const slot = slotFor(key, () => late.promise);
    slot.read();
    resetQueries();
    late.resolve("the last teacher's");
    await flush();
    expect(slot.entry.data).toBeUndefined();
  });
});
