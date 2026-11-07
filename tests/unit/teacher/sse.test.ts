import { describe, expect, test } from "vitest";
import type { ChannelStatus } from "@/lib/teacher/api/client";
import { connectSse, nextBackoff, SSE_BACKOFF_MAX_MS, SSE_BACKOFF_START_MS, SSE_SILENCE_MS, type StreamLike, type Timers } from "@/lib/teacher/api/sse";

/** A clock the test moves, and a stream it plays: no browser, nothing slow. */
function rig() {
  let now = 0;
  let nextHandle = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set: (fn, ms) => {
      pending.set(nextHandle, { at: now + ms, fn });
      return nextHandle++;
    },
    clear: (h) => void pending.delete(h as number),
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...pending].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      pending.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  };

  type Fake = StreamLike & { closed: boolean; emit(type: string, data?: unknown): void; fail(): void; open(): void };
  const streams: Fake[] = [];
  const open = (): StreamLike => {
    const listeners = new Map<string, ((e: { data?: unknown }) => void)[]>();
    const fake: Fake = {
      closed: false,
      onopen: null,
      onerror: null,
      addEventListener: (type, l) => listeners.set(type, [...(listeners.get(type) ?? []), l]),
      close: () => void (fake.closed = true),
      emit: (type, data) => (listeners.get(type) ?? []).forEach((l) => l({ data })),
      fail: () => fake.onerror?.(),
      open: () => fake.onopen?.(),
    };
    streams.push(fake);
    return fake;
  };

  const statuses: ChannelStatus[] = [];
  const events: [string, unknown][] = [];
  const stop = connectSse({
    url: "/api/v1/realtime?channels=session.s1.console",
    types: ["state.changed", "ping"],
    onEvent: (type, body) => events.push([type, body]),
    onStatus: (s) => statuses.push(s),
    open,
    timers,
  });
  return { streams, statuses, events, advance, stop, pending };
}

describe("the wait before trying again", () => {
  test("a second, and twice as long each time, up to fifteen (11.4)", () => {
    expect(SSE_BACKOFF_START_MS).toBe(1000);
    expect(SSE_BACKOFF_MAX_MS).toBe(15_000);
    expect(SSE_SILENCE_MS).toBe(45_000);
    const waits: number[] = [];
    let w: number | null = null;
    for (let i = 0; i < 7; i++) waits.push((w = nextBackoff(w)));
    expect(waits).toEqual([1000, 2000, 4000, 8000, 15_000, 15_000, 15_000]);
  });
});

describe("the stream", () => {
  test("says it is connecting, then open when the stream is", () => {
    const t = rig();
    expect(t.statuses).toEqual(["connecting"]);
    t.streams[0].open();
    expect(t.statuses).toEqual(["connecting", "open"]);
  });

  test("hands over each event with its body parsed, and not the pings", () => {
    const t = rig();
    t.streams[0].open();
    t.streams[0].emit("state.changed", JSON.stringify({ channel: "session.s1.console", state: "teaching" }));
    t.streams[0].emit("ping", "{}");
    expect(t.events).toEqual([["state.changed", { channel: "session.s1.console", state: "teaching" }]]);
  });

  test("a message that is not JSON is ignored, and the stream goes on", () => {
    const t = rig();
    t.streams[0].open();
    t.streams[0].emit("state.changed", "not json");
    t.streams[0].emit("state.changed", JSON.stringify({ state: "teaching" }));
    expect(t.events).toEqual([["state.changed", { state: "teaching" }]]);
  });

  test("an error closes it and says it is reconnecting, then opens it again after a second, on its own", () => {
    const t = rig();
    t.streams[0].open();
    t.streams[0].fail();
    expect(t.statuses).toEqual(["connecting", "open", "reconnecting"]);
    expect(t.streams[0].closed).toBe(true);
    t.advance(999);
    expect(t.streams).toHaveLength(1);
    t.advance(1);
    expect(t.streams).toHaveLength(2);
    t.streams[1].open();
    // Said again on every open: the moment to read the snapshot afresh.
    expect(t.statuses).toEqual(["connecting", "open", "reconnecting", "open"]);
  });

  test("each failure in a row waits twice as long, and an open stream starts the count again", () => {
    const t = rig();
    t.streams[0].fail();
    t.advance(1000);
    t.streams[1].fail();
    t.advance(1999);
    expect(t.streams).toHaveLength(2);
    t.advance(1);
    expect(t.streams).toHaveLength(3);
    t.streams[2].open();
    t.streams[2].fail();
    t.advance(1000);
    expect(t.streams).toHaveLength(4);
  });

  test("a stream that has said nothing for 45 seconds is dropped and opened again; a ping keeps it alive", () => {
    const t = rig();
    t.streams[0].open();
    t.advance(SSE_SILENCE_MS - 1);
    t.streams[0].emit("ping");
    t.advance(SSE_SILENCE_MS - 1);
    expect(t.statuses).toEqual(["connecting", "open"]);
    t.advance(1);
    expect(t.statuses).toEqual(["connecting", "open", "reconnecting"]);
    expect(t.streams[0].closed).toBe(true);
    t.advance(1000);
    expect(t.streams).toHaveLength(2);
  });

  test("stopping closes the stream and cancels what was waiting", () => {
    const t = rig();
    t.streams[0].open();
    t.streams[0].fail();
    t.stop();
    t.advance(60_000);
    expect(t.streams).toHaveLength(1);
    expect(t.pending.size).toBe(0);
  });
});
