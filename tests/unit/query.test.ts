// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/app/api/errors";
import type { SettledPromise } from "@/lib/app/api/client";
import type { Query } from "@/lib/app/api/query";

// The cache reads the adapter from ./index; give it one the tests can drive.
const fake = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    listeners,
    client: {
      subscribe(l: () => void) {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    },
    emit: () => listeners.forEach((l) => l()),
  };
});
vi.mock("@/lib/app/api/index", () => ({ client: fake.client, serverClient: null }));

const reported = vi.hoisted(() => vi.fn());
vi.mock("@/lib/app/report", () => ({ reportError: reported }));

const { change, invalidate, mapQuery, resetQueries, seed, useQuery } = await import("@/lib/app/api/query");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---- helpers ------------------------------------------------------------------------------------

/** What the mock adapter returns: a promise that already says how it settled. */
const now = <T>(value: T): SettledPromise<T> => {
  const p = Promise.resolve(value) as SettledPromise<T>;
  p.settled = { ok: true, value };
  return p;
};
const nowFail = <T>(error: unknown): SettledPromise<T> => {
  const p = Promise.reject(error) as SettledPromise<T>;
  p.settled = { ok: false, error };
  p.catch(() => {});
  return p;
};

let n = 0;
const key = (name: string) => `${name}:${++n}`;

const roots: Root[] = [];
function mount<T>(k: string, load: () => Promise<T>, enabled = true) {
  const seen: Query<T>[] = [];
  const Probe = () => {
    seen.push(useQuery(k, load, enabled));
    return null;
  };
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  act(() => root.render(createElement(Probe)));
  return {
    seen,
    last: () => seen[seen.length - 1],
    unmount: () => act(() => root.unmount()),
  };
}

const flush = () => act(async () => {});

beforeEach(() => reported.mockClear());
afterEach(() => {
  roots.splice(0).forEach((r) => act(() => r.unmount()));
  vi.useRealTimers();
});

// ---- tests ---------------------------------------------------------------------------------------

describe("reading", () => {
  it("shows an answer in the very first render when the client answers at once", () => {
    const m = mount(key("sync"), () => now("hello"));
    expect(m.seen[0]).toMatchObject({ status: "ready", data: "hello", error: null });
  });

  it("is loading until a slow client answers, then ready", async () => {
    let resolve!: (v: string) => void;
    const m = mount(key("slow"), () => new Promise<string>((r) => (resolve = r)));
    expect(m.last()).toMatchObject({ status: "loading", data: undefined });
    resolve("late");
    await flush();
    expect(m.last()).toMatchObject({ status: "ready", data: "late" });
  });

  it("turns a failure into an error state with the code", async () => {
    const sync = mount(key("fail-sync"), () => nowFail(new ApiError("not_found")));
    expect(sync.last()).toMatchObject({ status: "error", data: undefined });
    expect(sync.last().error?.code).toBe("not_found");

    const slow = mount(key("fail-slow"), () => Promise.reject(new ApiError("server_error", { status: 500 })));
    await flush();
    expect(slow.last().status).toBe("error");
    expect(slow.last().error).toMatchObject({ code: "server_error", status: 500 });
  });

  it("wraps something that is not an ApiError as unknown", async () => {
    const m = mount(key("odd"), () => Promise.reject(new TypeError("x")));
    await flush();
    expect(m.last().error?.code).toBe("unknown");
  });

  it("treats a load that throws as a failure", () => {
    const m = mount(key("throws"), () => {
      throw new ApiError("rate_limited");
    });
    expect(m.last()).toMatchObject({ status: "error" });
    expect(m.last().error?.code).toBe("rate_limited");
  });

  it("asks nothing while disabled", () => {
    const load = vi.fn(() => now(1));
    const m = mount(key("off"), load, false);
    expect(load).not.toHaveBeenCalled();
    expect(m.last()).toMatchObject({ status: "loading", data: undefined });
  });

  it("shares one slot between screens that ask for the same key", () => {
    const k = key("shared");
    const load = vi.fn(() => now({ v: 1 }));
    const a = mount(k, load);
    const b = mount(k, load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(b.last().data).toBe(a.last().data);
  });
});

describe("refreshing when the client says something changed", () => {
  it("loads again and shows the new answer", () => {
    let v = 1;
    const m = mount(key("refresh"), () => now({ v }));
    expect(m.last().data).toEqual({ v: 1 });
    v = 2;
    act(() => fake.emit());
    expect(m.last().data).toEqual({ v: 2 });
  });

  it("keeps the same data object, and does not render again, when the answer is the same", () => {
    const m = mount(key("same"), () => now({ list: [1, 2, 3] }));
    const before = m.last();
    const renders = m.seen.length;
    act(() => fake.emit());
    expect(m.last().data).toBe(before.data);
    expect(m.seen.length).toBe(renders);
  });

  it("keeps the answer on screen while a slower refresh is on its way", async () => {
    let v = 1;
    let resolve!: (x: { v: number }) => void;
    let slow = false;
    const m = mount(key("hold"), () => (slow ? new Promise<{ v: number }>((r) => (resolve = r)) : now({ v })));
    slow = true;
    act(() => fake.emit());
    expect(m.last()).toMatchObject({ status: "ready", data: { v: 1 } });
    v = 2;
    resolve({ v });
    await flush();
    expect(m.last().data).toEqual({ v: 2 });
  });

  it("keeps the old data when a refresh fails, and carries the failure along", () => {
    let fail = false;
    const m = mount(key("keep"), () => (fail ? nowFail<string>(new ApiError("server_error")) : now("good")));
    fail = true;
    act(() => fake.emit());
    expect(m.last()).toMatchObject({ status: "ready", data: "good" });
    expect(m.last().error?.code).toBe("server_error");
    fail = false;
    act(() => fake.emit());
    expect(m.last()).toMatchObject({ status: "ready", data: "good", error: null });
  });

  it("lets only the newest of two overlapping asks win", async () => {
    const resolvers: ((v: string) => void)[] = [];
    let first = true;
    const m = mount(key("race"), () => {
      if (first) {
        first = false;
        return now("start");
      }
      return new Promise<string>((r) => resolvers.push(r));
    });
    act(() => fake.emit()); // ask 2
    act(() => fake.emit()); // ask 3
    resolvers[1]("newest");
    await flush();
    resolvers[0]("older");
    await flush();
    expect(m.last().data).toBe("newest");
  });

  it("refetch() asks again on demand", () => {
    let v = 1;
    const m = mount(key("refetch"), () => now(v));
    v = 5;
    act(() => m.last().refetch());
    expect(m.last().data).toBe(5);
  });
});

describe("stale slots", () => {
  it("marks a slot nobody reads as stale and loads it when it is next read", () => {
    let v = 1;
    const load = vi.fn(() => now({ v }));
    const k = key("stale");
    const first = mount(k, load);
    first.unmount();
    v = 2;
    act(() => fake.emit()); // nobody is reading: no request now
    expect(load).toHaveBeenCalledTimes(1);
    const again = mount(k, load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(again.seen[0].data).toEqual({ v: 2 });
  });

  it("does not ask for a slot that was never read", () => {
    const load = vi.fn(() => now(1));
    // a slot exists only once a hook has asked for it, so emitting with none mounted is harmless
    act(() => fake.emit());
    expect(load).not.toHaveBeenCalled();
  });

  it("asks once, not twice, when a slow client's slot is first mounted", async () => {
    const load = vi.fn(() => new Promise<string>(() => {}));
    mount(key("once"), load);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("asks again when a slow client's slot comes back after more than 30 seconds, not before", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const load = vi.fn(() => Promise.resolve("slow"));
    const k = key("fresh");
    const a = mount(k, load);
    await flush();
    a.unmount();

    vi.setSystemTime(Date.now() + 29_000);
    const b = mount(k, load);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    b.unmount();

    vi.setSystemTime(Date.now() + 5_000); // 34 s since it last loaded
    const c = mount(k, load);
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(c.last().data).toBe("slow");
  });

  it("does not age out an adapter that answers at once", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const load = vi.fn(() => now("fast"));
    const k = key("fast");
    const a = mount(k, load);
    a.unmount();
    vi.setSystemTime(Date.now() + 120_000);
    mount(k, load);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("invalidate, reset, seed, change", () => {
  it("invalidates by key or prefix, but not a key that only starts with the same letters", () => {
    const counts = { a: 0, b: 0, c: 0 };
    mount("results", () => now(++counts.a));
    mount("results:math", () => now(++counts.b));
    mount("resultsX", () => now(++counts.c));
    invalidate("results");
    act(() => {});
    expect(counts).toEqual({ a: 2, b: 2, c: 1 });
    invalidate("results:math");
    expect(counts).toEqual({ a: 2, b: 3, c: 1 });
  });

  it("invalidates everything with no prefix", () => {
    let a = 0;
    let b = 0;
    mount(key("all-a"), () => now(++a));
    mount(key("all-b"), () => now(++b));
    const before = [a, b];
    invalidate();
    expect([a - before[0], b - before[1]]).toEqual([1, 1]);
  });

  it("drops every answer on reset, so one student's data is never shown to the next", async () => {
    let who = "Marko";
    const m = mount(key("who"), () => now(who));
    expect(m.last().data).toBe("Marko");
    who = "Ana";
    act(() => resetQueries());
    await flush();
    expect(m.last().data).toBe("Ana");
  });

  it("puts an answer straight into a slot without asking", () => {
    const k = key("seed");
    const load = vi.fn(() => now("asked"));
    const m = mount(k, load);
    act(() => seed(k, "seeded"));
    expect(m.last().data).toBe("seeded");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("ignores a seed for a key nobody has asked for", () => {
    expect(() => seed(key("nobody"), 1)).not.toThrow();
  });

  it("makes a change, then refreshes what it touched", async () => {
    let v = 1;
    const k = key("touch");
    const m = mount(k, () => now(v));
    const result = await act(() =>
      change(
        async () => {
          v = 2;
          return "done";
        },
        [k],
      ),
    );
    expect(result).toBe("done");
    expect(m.last().data).toBe(2);
  });

  it("does not refresh when the change fails", async () => {
    const load = vi.fn(() => now(1));
    const k = key("untouched");
    mount(k, load);
    await expect(change(() => Promise.reject(new ApiError("not_found")), [k])).rejects.toMatchObject({ code: "not_found" });
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("mapQuery", () => {
  it("turns the data, and passes loading and error through", () => {
    const base = { status: "ready", data: 2, error: null, refetch: () => {} } satisfies Query<number>;
    expect(mapQuery(base, (x) => x * 10)).toMatchObject({ status: "ready", data: 20 });
    const loading: Query<number> = { ...base, status: "loading", data: undefined };
    const fn = vi.fn();
    expect(mapQuery(loading, fn).data).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("error reporting", () => {
  it("reports an unexpected failure with its key and code, and nothing personal", async () => {
    const k = key("report");
    mount(k, () => Promise.reject(new ApiError("server_error", { status: 500, message: "stack trace with a name in it" })));
    await flush();
    expect(reported).toHaveBeenCalledTimes(1);
    const [error, context] = reported.mock.calls[0];
    expect(error).toMatchObject({ code: "server_error" });
    expect(context).toEqual({ where: "query", key: k, code: "server_error", status: 500 });
  });

  it("reports a malformed response", async () => {
    mount(key("bad"), () => Promise.reject(new ApiError("invalid_response")));
    await flush();
    expect(reported).toHaveBeenCalledOnce();
  });

  it.each(["unauthenticated", "signed_in_elsewhere", "network"] as const)("does not report %s, which is part of normal use", async (code) => {
    mount(key("quiet"), () => Promise.reject(new ApiError(code)));
    await flush();
    expect(reported).not.toHaveBeenCalled();
  });

  it("does not report a success", () => {
    mount(key("fine"), () => now(1));
    expect(reported).not.toHaveBeenCalled();
  });
});
