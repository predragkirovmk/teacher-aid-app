import { beforeEach, describe, expect, test, vi } from "vitest";
import type { SettledPromise } from "@/lib/teacher/api/client";
import { ApiError } from "@/lib/teacher/api/errors";
import type { ConsoleSnapshot, OpenSession } from "@/lib/teacher/api/types";

// The hooks read the adapter from client.ts, which builds the demo school in the browser; the tests give them their own.
const createSession = vi.fn();
const getOpenSession = vi.fn();
vi.mock("@/lib/teacher/api/client", () => ({
  api: {
    createSession: (...args: unknown[]) => createSession(...args),
    getOpenSession: (...args: unknown[]) => getOpenSession(...args),
    subscribe: () => () => {},
  },
  serverApi: null,
  demo: null,
}));

const { startSession } = await import("@/lib/teacher/api/hooks");
const { resetQueries, slotFor } = await import("@/lib/teacher/api/query");

const settled = <T>(value: T): SettledPromise<T> => Object.assign(Promise.resolve(value), { settled: { ok: true as const, value } });

const NONE: OpenSession = { server_now: "2026-10-29T08:30:00.000Z", session: null };
const snapshot = {
  server_now: "2026-10-29T08:31:00.000Z",
  session: {
    id: "s-n1",
    course_id: "course-ii-4",
    lesson: { id: "l-procenti", title: "Проценти и пропорции", version: 1 },
    state: "lobby",
    started_at: "2026-10-29T08:31:00.000Z",
    ended_at: null,
    class_name: "II-4",
    subject_name: "Математика",
  },
} as ConsoleSnapshot;

/** The open-session slot a screen would be reading, with nothing open. */
const openSlot = () => {
  const slot = slotFor("open-session", (a) => a.getOpenSession());
  expect(slot.read().data).toEqual(NONE);
  return slot;
};

beforeEach(() => {
  resetQueries();
  createSession.mockReset();
  getOpenSession.mockReset();
  getOpenSession.mockImplementation(() => settled(NONE));
});

describe("starting a lesson", () => {
  test("sends the lesson and the class, and the lesson that opened is the teacher's open lesson at once", async () => {
    const slot = openSlot();
    createSession.mockResolvedValue(snapshot);
    const result = await startSession({ lesson_id: "l-procenti", course_id: "course-ii-4" });
    expect(createSession).toHaveBeenCalledWith({ lesson_id: "l-procenti", course_id: "course-ii-4" });
    expect(result).toBe(snapshot);
    // The screen it goes to finds it without asking again.
    expect(slot.read().data).toEqual({ server_now: snapshot.server_now, session: snapshot.session });
    expect(getOpenSession).toHaveBeenCalledTimes(1);
  });

  test("a refusal because a lesson is open asks for the open lesson again, so the screen can say which, and the refusal still comes through", async () => {
    const slot = openSlot();
    createSession.mockRejectedValue(new ApiError("session_open", { status: 409 }));
    getOpenSession.mockImplementation(() => settled({ ...NONE, session: snapshot.session }));
    await expect(startSession({ lesson_id: "l-procenti", course_id: "course-ii-4" })).rejects.toMatchObject({ code: "session_open" });
    expect(slot.read().data?.session?.id).toBe("s-n1");
    expect(getOpenSession).toHaveBeenCalledTimes(2);
  });

  test("any other failure is passed on and does not touch what the screen knows", async () => {
    const slot = openSlot();
    for (const code of ["network", "not_found", "server_error", "rate_limited"] as const) {
      createSession.mockRejectedValue(new ApiError(code));
      await expect(startSession({ lesson_id: "l", course_id: "c" })).rejects.toMatchObject({ code });
    }
    expect(slot.read().data).toEqual(NONE);
    expect(getOpenSession).toHaveBeenCalledTimes(1);
  });
});
