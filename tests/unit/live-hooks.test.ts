import { beforeEach, describe, expect, test, vi } from "vitest";
import type { SettledPromise, ChannelHandlers } from "@/lib/teacher/api/client";
import { ApiError } from "@/lib/teacher/api/errors";
import type { ConsoleSnapshot, ConsoleStudent } from "@/lib/teacher/api/types";
import { applyConsoleEvent } from "@/lib/teacher/live";

const getConsole = vi.fn();
const advance = vi.fn();
const markNoDevice = vi.fn();
const clearNoDevice = vi.fn();
const openChannel = vi.fn();
vi.mock("@/lib/teacher/api/client", () => ({
  api: {
    getConsole: (...a: unknown[]) => getConsole(...a),
    advance: (...a: unknown[]) => advance(...a),
    markNoDevice: (...a: unknown[]) => markNoDevice(...a),
    clearNoDevice: (...a: unknown[]) => clearNoDevice(...a),
    openChannel: (...a: unknown[]) => openChannel(...a),
    getOpenSession: () => settled({ server_now: "", session: null }),
    subscribe: () => () => {},
  },
  serverApi: null,
  demo: null,
}));

const { advanceSession, clearNoDevice: clearMark, markNoDevice: mark, watchSnapshot } = await import("@/lib/teacher/api/hooks");
const { resetQueries, slotFor } = await import("@/lib/teacher/api/query");

const settled = <T>(value: T): SettledPromise<T> => Object.assign(Promise.resolve(value), { settled: { ok: true as const, value } });

const student = (id: string, over: Partial<ConsoleStudent> = {}): ConsoleStudent => ({
  id,
  full_name: `Ученик ${id}`,
  attendance: null,
  joined_at: null,
  no_device_reason: null,
  online: false,
  answer_state: null,
  focus_flags: 0,
  points: 0,
  ...over,
});
const snapshot = (over: Partial<ConsoleSnapshot> = {}): ConsoleSnapshot => ({
  server_now: "2026-10-29T08:31:00.000Z",
  session: { id: "s1", course_id: "c", lesson: { id: "l", title: "T", version: 1 }, state: "lobby", started_at: "2026-10-29T08:30:00.000Z", ended_at: null, class_name: "II-4", subject_name: "Математика" },
  join: null,
  questions: [],
  students: [student("a"), student("b")],
  anon_questions: [],
  focus_flags: [],
  board: [],
  nudge: null,
  ...over,
});

/** The stream the screen opened, to play events and statuses into. */
let stream: ChannelHandlers;
const stop = vi.fn();
const load = () => getConsole("s1") as Promise<ConsoleSnapshot>;

beforeEach(() => {
  resetQueries();
  for (const m of [getConsole, advance, markNoDevice, clearNoDevice, openChannel, stop]) m.mockReset();
  getConsole.mockImplementation(() => settled(snapshot()));
  openChannel.mockImplementation((_channel: string, handlers: ChannelHandlers) => {
    stream = handlers;
    return stop;
  });
});

describe("a snapshot that a stream keeps up to date", () => {
  const watch = (onStatus: (s: string) => void = () => {}) => {
    const slot = slotFor("console:s1", load);
    expect(slot.read().data?.students).toHaveLength(2);
    return { slot, stop: watchSnapshot("console:s1", load, "session.s1.console", applyConsoleEvent, onStatus) };
  };

  test("listens on the channel it was given", () => {
    watch();
    expect(openChannel).toHaveBeenCalledWith("session.s1.console", expect.any(Object));
  });

  test("an event changes what the screen holds, and the screen is told", () => {
    const { slot } = watch();
    const heard = vi.fn();
    slot.subscribe(heard);
    stream.onEvent({ type: "student.joined", channel: "session.s1.console", server_now: "2026-10-29T08:31:05.000Z", student: student("a", { attendance: "present", online: true, joined_at: "2026-10-29T08:31:05.000Z" }) });
    expect(slot.read().data?.students[0].attendance).toBe("present");
    expect(heard).toHaveBeenCalled();
  });

  test("an event that changes nothing is not news", () => {
    const { slot } = watch();
    const before = slot.read().data;
    stream.onEvent({ type: "ping", channel: "session.s1.console", server_now: "2026-10-29T08:31:05.000Z" });
    expect(slot.read().data).toBe(before);
  });

  test("an event that comes before the snapshot has been read is let go", () => {
    const never = () => new Promise<ConsoleSnapshot>(() => {});
    const slot = slotFor("console:s1", never);
    watchSnapshot("console:s1", never, "session.s1.console", applyConsoleEvent, () => {});
    stream.onEvent({ type: "state.changed", channel: "session.s1.console", server_now: "2026-10-29T08:31:05.000Z", state: "teaching" });
    expect(slot.entry.data).toBeUndefined();
  });

  test("every time the stream opens the snapshot is read again, and the screen is told where the stream stands", async () => {
    const seen: string[] = [];
    const { slot } = watch((s) => seen.push(s));
    getConsole.mockClear();
    getConsole.mockImplementation(() => settled(snapshot({ students: [student("a", { attendance: "present", online: true, joined_at: "2026-10-29T08:31:02.000Z" }), student("b")] })));
    stream.onStatus?.("reconnecting");
    expect(getConsole).not.toHaveBeenCalled();
    stream.onStatus?.("open");
    expect(getConsole).toHaveBeenCalledTimes(1);
    expect(slot.read().data?.students[0].attendance).toBe("present");
    expect(seen).toEqual(["reconnecting", "open"]);
  });

  test("stopping closes the stream", () => {
    const { stop: close } = watch();
    close();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe("what the teacher does in the lesson", () => {
  test("moving the lesson on puts the fresh console, and the lesson's new state, into the cache", async () => {
    const slot = slotFor("console:s1", load);
    slot.read();
    const open = slotFor("open-session", () => settled({ server_now: "", session: null }) as never);
    open.read();
    const moved = snapshot({ session: { ...snapshot().session, state: "teaching" } });
    advance.mockResolvedValue(moved);
    await advanceSession("s1", "teaching");
    expect(advance).toHaveBeenCalledWith("s1", { to: "teaching" });
    expect(slot.read().data?.session.state).toBe("teaching");
    expect((open.read().data as { session: { state: string } }).session.state).toBe("teaching");
  });

  test("a mark, and taking it back, put the fresh console into the cache", async () => {
    const slot = slotFor("console:s1", load);
    slot.read();
    const marked = snapshot({ students: [student("a", { attendance: "present_no_device", no_device_reason: "battery" }), student("b")] });
    markNoDevice.mockResolvedValue(marked);
    await mark("s1", "a", "battery");
    expect(markNoDevice).toHaveBeenCalledWith("s1", "a", { reason: "battery" });
    expect(slot.read().data?.students[0].no_device_reason).toBe("battery");
    clearNoDevice.mockResolvedValue(snapshot());
    await clearMark("s1", "a");
    expect(clearNoDevice).toHaveBeenCalledWith("s1", "a");
    expect(slot.read().data?.students[0].attendance).toBeNull();
  });

  test("a mark refused because the student has joined asks for the console again, and the refusal still comes through", async () => {
    const slot = slotFor("console:s1", load);
    slot.read();
    getConsole.mockClear();
    markNoDevice.mockRejectedValue(new ApiError("invalid_state", { status: 409 }));
    await expect(mark("s1", "a", "battery")).rejects.toMatchObject({ code: "invalid_state" });
    expect(getConsole).toHaveBeenCalledTimes(1);
  });
});
