import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusEventInput } from "@/lib/app/api/types";
import { FOCUS_LOST_AFTER_MS, createFocusTracker, type FocusTracker } from "@/lib/app/session/focus";
import { T0 } from "./support/session";

const SKEW = 90_000; // the phone's clock is a minute and a half ahead of the server's

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0 + SKEW);
});
afterEach(() => vi.useRealTimers());

/** The server's time for a phone time. */
const server = (local: number) => local - SKEW;

function setup(over: { open?: (at: number) => string | null; enabled?: () => boolean } = {}) {
  const events: FocusEventInput[] = [];
  let open: string | null = "q1";
  const tracker: FocusTracker = createFocusTracker({
    openQuestion: over.open ?? (() => open),
    toServer: server,
    emit: (e) => events.push(e),
    enabled: over.enabled ?? (() => true),
  });
  return { tracker, events, setOpen: (id: string | null) => (open = id) };
}

describe("a departure during an open question", () => {
  it("is confirmed after the threshold, stamped with the time the student left and in server terms", async () => {
    const { tracker, events } = setup();
    const left = Date.now();
    tracker.signal("hidden");
    await vi.advanceTimersByTimeAsync(FOCUS_LOST_AFTER_MS - 1);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(events).toEqual([{ type: "lost", at: server(left), sessionQuestionId: "q1" }]);
  });

  it("is followed by back, with the time the student came back, when they do", async () => {
    const { tracker, events } = setup();
    const left = Date.now();
    tracker.signal("hidden");
    await vi.advanceTimersByTimeAsync(10_000);
    const came = Date.now();
    tracker.signal("visible");
    expect(events).toEqual([
      { type: "lost", at: server(left), sessionQuestionId: "q1" },
      { type: "back", at: server(came), sessionQuestionId: "q1" },
    ]);
  });

  it("says both on the way back when the page was frozen and its timer never ran", () => {
    const { tracker, events } = setup();
    const left = Date.now();
    tracker.signal("hidden");
    // A phone with the screen off: no timer fires, the clock just moves on.
    vi.setSystemTime(left + 20_000);
    tracker.signal("visible");
    expect(events).toEqual([
      { type: "lost", at: server(left), sessionQuestionId: "q1" },
      { type: "back", at: server(left + 20_000), sessionQuestionId: "q1" },
    ]);
  });

  it("is reported against the question that was open when the student left, even if it closed while they were away", async () => {
    const { tracker, events, setOpen } = setup();
    tracker.signal("blur");
    await vi.advanceTimersByTimeAsync(5000);
    setOpen(null);
    tracker.signal("focus");
    expect(events.map((e) => [e.type, e.sessionQuestionId])).toEqual([
      ["lost", "q1"],
      ["back", "q1"],
    ]);
  });
});

describe("a flicker", () => {
  it("is nothing: a glance at the notification shade, back before the threshold", async () => {
    const { tracker, events } = setup();
    tracker.signal("blur");
    await vi.advanceTimersByTimeAsync(FOCUS_LOST_AFTER_MS - 500);
    tracker.signal("focus");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(events).toEqual([]);
  });

  it("is nothing even when the page was frozen and the return is the only thing that notices", () => {
    const { tracker, events } = setup();
    tracker.signal("hidden");
    vi.setSystemTime(Date.now() + FOCUS_LOST_AFTER_MS - 1);
    tracker.signal("visible");
    expect(events).toEqual([]);
  });

  it("counts a departure of exactly the threshold", () => {
    const { tracker, events } = setup();
    tracker.signal("hidden");
    vi.setSystemTime(Date.now() + FOCUS_LOST_AFTER_MS);
    tracker.signal("visible");
    expect(events.map((e) => e.type)).toEqual(["lost", "back"]);
  });
});

describe("where it counts", () => {
  it("records nothing between questions (EC-FOC-02)", async () => {
    const { tracker, events, setOpen } = setup();
    setOpen(null);
    tracker.signal("hidden");
    await vi.advanceTimersByTimeAsync(30_000);
    tracker.signal("visible");
    expect(events).toEqual([]);
  });

  it("does not turn an absence that began between questions into one when a question opens meanwhile", async () => {
    const { tracker, events, setOpen } = setup();
    setOpen(null);
    tracker.signal("hidden");
    await vi.advanceTimersByTimeAsync(5000);
    setOpen("q2");
    await vi.advanceTimersByTimeAsync(10_000);
    tracker.signal("visible");
    expect(events).toEqual([]);
  });

  it("records nothing before the student has been told", async () => {
    const { tracker, events } = setup({ enabled: () => false });
    tracker.signal("hidden");
    await vi.advanceTimersByTimeAsync(30_000);
    tracker.signal("visible");
    expect(events).toEqual([]);
  });

  it("asks what was open at the moment of leaving, in local time", () => {
    const open = vi.fn(() => "q1");
    const { tracker } = setup({ open });
    tracker.signal("hidden");
    expect(open).toHaveBeenCalledWith(Date.now());
  });
});

describe("hidden and blurred together", () => {
  it("are one absence: it ends only when the page is shown and the window has focus again", async () => {
    const { tracker, events } = setup();
    tracker.signal("blur");
    tracker.signal("hidden");
    await vi.advanceTimersByTimeAsync(5000);
    tracker.signal("visible");
    // Shown, but the window still has no focus: still away.
    await vi.advanceTimersByTimeAsync(5000);
    expect(events.map((e) => e.type)).toEqual(["lost"]);
    tracker.signal("focus");
    expect(events.map((e) => e.type)).toEqual(["lost", "back"]);
  });

  it("is counted from the first signal, and a repeat of one changes nothing", async () => {
    const { tracker, events } = setup();
    const left = Date.now();
    tracker.signal("hidden");
    await vi.advanceTimersByTimeAsync(1000);
    tracker.signal("hidden");
    tracker.signal("blur");
    await vi.advanceTimersByTimeAsync(FOCUS_LOST_AFTER_MS);
    expect(events).toEqual([{ type: "lost", at: server(left), sessionQuestionId: "q1" }]);
  });

  it("reports each absence on its own", async () => {
    const { tracker, events } = setup();
    for (let i = 0; i < 2; i++) {
      tracker.signal("hidden");
      await vi.advanceTimersByTimeAsync(4000);
      tracker.signal("visible");
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(events.map((e) => e.type)).toEqual(["lost", "back", "lost", "back"]);
  });
});

describe("stopping", () => {
  it("says nothing more once disposed", async () => {
    const { tracker, events } = setup();
    tracker.signal("hidden");
    tracker.dispose();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(events).toEqual([]);
  });
});
