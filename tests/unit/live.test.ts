import { describe, expect, test } from "vitest";
import type { ChannelEvent, ClassViewSnapshot, ConsoleSnapshot, ConsoleStudent } from "@/lib/teacher/api/types";
import {
  applyClassEvent,
  applyConsoleEvent,
  canMarkNoDevice,
  CLASS_WINDOW_NAME,
  classViewStatus,
  formatShortCode,
  HEARTBEAT_GRACE_MS,
  HEARTBEAT_MS,
  HEARTBEAT_STALE_MS,
  isWindowMessage,
  joinedCount,
  joinUrl,
  missingCount,
  msUntil,
  nextState,
  NO_DEVICE_REASONS,
  openClassWindow,
  recentNames,
  rosterSections,
  serverOffset,
  stateSteps,
  studentState,
  TOKEN_GRACE_MS,
  TOKEN_ROTATE_MS,
  tokenIsStale,
  type ClassWindow,
} from "@/lib/teacher/live";

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
const joined = (id: string, at = "2026-10-29T08:31:00.000Z", over: Partial<ConsoleStudent> = {}) =>
  student(id, { attendance: "present", joined_at: at, online: true, ...over });

describe("where the lesson stands", () => {
  test("four states in order, the current one marked and the ones before it done", () => {
    expect(stateSteps("lobby")).toEqual([
      { state: "lobby", position: "current" },
      { state: "teaching", position: "next" },
      { state: "review", position: "next" },
      { state: "ended", position: "next" },
    ]);
    expect(stateSteps("teaching").map((s) => s.position)).toEqual(["done", "current", "next", "next"]);
    expect(stateSteps("ended").map((s) => s.position)).toEqual(["done", "done", "done", "current"]);
  });

  test("a lesson moves forward one state at a time, and End is not a move (4.1)", () => {
    expect(nextState("lobby")).toBe("teaching");
    expect(nextState("teaching")).toBe("review");
    expect(nextState("review")).toBeNull();
    expect(nextState("ended")).toBeNull();
  });
});

describe("how a student is shown", () => {
  test("not here, here, late, offline and without a phone, in one word each", () => {
    expect(studentState(student("a"))).toBe("not_yet");
    expect(studentState(joined("a"))).toBe("joined");
    expect(studentState(joined("a", undefined, { attendance: "late" }))).toBe("late");
    expect(studentState(joined("a", undefined, { online: false }))).toBe("offline");
    expect(studentState(joined("a", undefined, { attendance: "late", online: false }))).toBe("offline");
    expect(studentState(student("a", { attendance: "present_no_device", no_device_reason: "battery" }))).toBe("no_device");
  });

  test("a student the lesson has not heard of is not here (an absent mark is only written at the end)", () => {
    expect(studentState(student("a", { attendance: "absent" }))).toBe("not_yet");
  });

  test("the count is those who joined with a phone: a mark the teacher wrote is not a join (BR-ATT-01)", () => {
    const class26 = [joined("1"), joined("2", undefined, { attendance: "late" }), joined("3", undefined, { online: false }), student("4", { attendance: "present_no_device", no_device_reason: "no_phone" }), student("5")];
    expect(joinedCount(class26)).toEqual({ joined: 3, withoutPhone: 1, total: 5 });
    expect(missingCount(class26)).toBe(1);
    expect(joinedCount([])).toEqual({ joined: 0, withoutPhone: 0, total: 0 });
  });
});

describe("the order of the class", () => {
  const class6 = [
    joined("a"),
    student("b"),
    joined("c", undefined, { online: false }),
    student("d", { attendance: "present_no_device", no_device_reason: "no_data" }),
    student("e"),
    joined("f", undefined, { attendance: "late" }),
  ];

  test("those who are not here come first, then those who are, and in each group the register's order stays", () => {
    const { missing, here } = rosterSections(class6);
    expect(missing.map((s) => s.id)).toEqual(["b", "e"]);
    expect(here.map((s) => s.id)).toEqual(["c", "a", "d", "f"]);
  });

  test("the one whose connection is lost is first among those who are here, since that one is worth a look", () => {
    expect(rosterSections(class6).here[0].id).toBe("c");
  });

  test("a student who joins moves from one group to the other and nothing else moves", () => {
    const after = class6.map((s) => (s.id === "b" ? joined("b") : s));
    const { missing, here } = rosterSections(after);
    expect(missing.map((s) => s.id)).toEqual(["e"]);
    expect(here.map((s) => s.id)).toEqual(["c", "a", "b", "d", "f"]);
  });

  test("everyone is in exactly one group", () => {
    const { missing, here } = rosterSections(class6);
    expect(missing.length + here.length).toBe(class6.length);
  });
});

describe("present without a phone", () => {
  test("four reasons, in the order they are offered", () => {
    expect(NO_DEVICE_REASONS).toEqual(["no_phone", "battery", "no_data", "no_focus_authorization"]);
  });

  test("only a student who has not joined with a phone may be marked", () => {
    expect(canMarkNoDevice(student("a"))).toBe(true);
    expect(canMarkNoDevice(student("a", { attendance: "present_no_device", no_device_reason: "battery" }))).toBe(true);
    expect(canMarkNoDevice(joined("a"))).toBe(false);
    expect(canMarkNoDevice(joined("a", undefined, { attendance: "late" }))).toBe(false);
  });
});

describe("the code and its rotation", () => {
  test("the token and the code change every 30 seconds (BR-JOIN-02)", () => {
    expect(TOKEN_ROTATE_MS).toBe(30_000);
  });

  test("the computer's clock is carried on from the server's, so a computer that is wrong still counts right", () => {
    const received = Date.parse("2026-10-29T09:00:00.000Z") + 5 * 60_000; // this computer is five minutes fast
    const offset = serverOffset("2026-10-29T09:00:00.000Z", received);
    expect(offset).toBe(-5 * 60_000);
    // Ten seconds later by this computer's clock, the code that is good until 09:00:30 has 20 seconds left.
    expect(msUntil("2026-10-29T09:00:30.000Z", offset, received + 10_000)).toBe(20_000);
    expect(msUntil("2026-10-29T09:00:30.000Z", offset, received + 40_000)).toBe(0);
  });

  test("a code whose time is up is stale only after a moment's grace, for the event that is on its way", () => {
    const validTo = "2026-10-29T09:00:30.000Z";
    const at = (ms: number) => Date.parse(validTo) + ms;
    expect(tokenIsStale(validTo, 0, at(-1000))).toBe(false);
    expect(tokenIsStale(validTo, 0, at(TOKEN_GRACE_MS))).toBe(false);
    expect(tokenIsStale(validTo, 0, at(TOKEN_GRACE_MS + 1))).toBe(true);
    // The server's clock is what counts: a computer 10 seconds slow (the offset is what to add to it) is late to see the time is up.
    expect(tokenIsStale(validTo, 10_000, at(TOKEN_GRACE_MS - 10_000))).toBe(false);
    expect(tokenIsStale(validTo, 10_000, at(TOKEN_GRACE_MS - 10_000 + 1))).toBe(true);
  });

  test("the QR holds the student app's check-in path on this app's own origin, with the token", () => {
    expect(joinUrl("https://teacheraid.education", "jab12")).toBe("https://teacheraid.education/app/checkin/jab12");
    expect(joinUrl("http://localhost:3100/", "jab12")).toBe("http://localhost:3100/app/checkin/jab12");
    expect(joinUrl("https://x.example", "a b")).toBe("https://x.example/app/checkin/a%20b");
  });

  test("the short code is read in groups of three, with a space that does not break a line", () => {
    expect(formatShortCode("483920")).toBe("483 920");
    expect(formatShortCode("4839201")).toBe("483 920 1");
    expect(formatShortCode("")).toBe("");
  });
});

describe("whether the projected window is open", () => {
  const T = 1_000_000;

  test("it beats every 2 seconds, and is counted closed after three missed beats", () => {
    expect(HEARTBEAT_MS).toBe(2000);
    expect(HEARTBEAT_STALE_MS).toBe(6000);
    expect(classViewStatus(T, T - 20_000, T)).toBe("open");
    expect(classViewStatus(T, T - 20_000, T + HEARTBEAT_STALE_MS)).toBe("open");
    expect(classViewStatus(T, T - 20_000, T + HEARTBEAT_STALE_MS + 1)).toBe("closed");
  });

  test("a window that has never been opened is not closed: nothing is said of it", () => {
    expect(classViewStatus(null, T, T)).toBe("never");
    expect(classViewStatus(null, T, T + 60_000)).toBe("never");
  });

  test("a console that is reloaded after the window was open waits a moment for its first beat before it says closed", () => {
    expect(classViewStatus(null, T, T, { wasOpen: true })).toBe("checking");
    expect(classViewStatus(null, T, T + HEARTBEAT_GRACE_MS - 1, { wasOpen: true })).toBe("checking");
    expect(classViewStatus(null, T, T + HEARTBEAT_GRACE_MS, { wasOpen: true })).toBe("closed");
  });

  test("a window that came back is open again at once", () => {
    expect(classViewStatus(T + 30_000, T, T + 30_500, { wasOpen: true })).toBe("open");
  });

  test("a window that said it was closing is closed at once", () => {
    expect(classViewStatus(Number.NEGATIVE_INFINITY, T, T)).toBe("closed");
  });

  test("a browser with no way for windows to talk claims nothing", () => {
    expect(classViewStatus(null, T, T + 60_000, { supported: false, wasOpen: true })).toBe("unknown");
    expect(classViewStatus(T, T, T, { supported: false })).toBe("unknown");
  });

  test("a message between the windows is one of three, and nothing else is believed", () => {
    expect(isWindowMessage({ kind: "beat" })).toBe(true);
    expect(isWindowMessage({ kind: "hello" })).toBe(true);
    expect(isWindowMessage({ kind: "closing" })).toBe(true);
    expect(isWindowMessage({ kind: "close" })).toBe(false);
    expect(isWindowMessage(null)).toBe(false);
    expect(isWindowMessage("beat")).toBe(false);
  });
});

describe("opening the projected window", () => {
  const window = (closed = false): ClassWindow & { focused: number } => {
    const w = { closed, focused: 0, focus() { w.focused++; } };
    return w;
  };

  test("opens it under a fixed name, as a window of its own, and brings it forward", () => {
    const w = window();
    const calls: unknown[][] = [];
    const out = openClassWindow((...args) => (calls.push(args), w), "/teacher/live/s1/class", null);
    expect(out).toEqual({ result: "opened", window: w });
    expect(calls).toEqual([["/teacher/live/s1/class", CLASS_WINDOW_NAME, expect.stringContaining("popup")]]);
    expect(w.focused).toBe(1);
  });

  test("a second press brings back the window that is open and loads nothing", () => {
    const w = window();
    const out = openClassWindow(() => { throw new Error("must not open another"); }, "/x", w);
    expect(out.result).toBe("focused");
    expect(w.focused).toBe(1);
  });

  test("a window that was closed is opened again", () => {
    const old = window(true);
    const fresh = window();
    expect(openClassWindow(() => fresh, "/x", old)).toEqual({ result: "opened", window: fresh });
  });

  test("a popup blocker is said to have stopped it", () => {
    expect(openClassWindow(() => null, "/x", null)).toEqual({ result: "blocked", window: null });
  });
});

describe("what an event does to the console", () => {
  const base = (students: ConsoleStudent[] = [student("a"), joined("b")]): ConsoleSnapshot => ({
    server_now: "2026-10-29T08:31:00.000Z",
    session: { id: "s1", course_id: "c", lesson: { id: "l", title: "T", version: 1 }, state: "lobby", started_at: "2026-10-29T08:30:00.000Z", ended_at: null, class_name: "II-4", subject_name: "Математика" },
    join: { token: "t1", short_code: "111111", valid_to: "2026-10-29T08:31:30.000Z" },
    questions: [],
    students,
    anon_questions: [],
    focus_flags: [],
    board: [],
    nudge: false,
  });
  const at = (seconds: number) => ({ channel: "session.s1.console" as const, server_now: new Date(Date.parse("2026-10-29T08:31:00.000Z") + seconds * 1000).toISOString() });

  test("a student who joined replaces the one that was there", () => {
    const snapshot = base();
    const event: ChannelEvent = { type: "student.joined", student: joined("a"), ...at(2) };
    const next = applyConsoleEvent(snapshot, event);
    expect(next.students.map((s) => s.attendance)).toEqual(["present", "present"]);
    expect(snapshot.students[0].attendance).toBeNull();
  });

  test("a connection that was lost or came back changes the student's presence only", () => {
    const next = applyConsoleEvent(base(), { type: "student.presence", student_id: "b", online: false, ...at(1) });
    expect(next.students[1]).toMatchObject({ attendance: "present", online: false });
  });

  test("a new code replaces the old one", () => {
    const next = applyConsoleEvent(base(), { type: "join_token.rotated", token: "t2", short_code: "222222", valid_to: "2026-10-29T08:32:00.000Z", ...at(30) });
    expect(next.join).toEqual({ token: "t2", short_code: "222222", valid_to: "2026-10-29T08:32:00.000Z" });
  });

  test("the lesson only moves forward: an old state is ignored and a new one is taken", () => {
    const teaching = applyConsoleEvent(base(), { type: "state.changed", state: "teaching", ...at(5) });
    expect(teaching.session.state).toBe("teaching");
    expect(applyConsoleEvent(teaching, { type: "state.changed", state: "lobby", ...at(6) })).toBe(teaching);
  });

  test("an event stamped before the snapshot is dropped, and so is one the screen does not show", () => {
    const snapshot = base();
    expect(applyConsoleEvent(snapshot, { type: "student.joined", student: joined("a"), ...at(-1) })).toBe(snapshot);
    expect(applyConsoleEvent(snapshot, { type: "nudge", idle_seconds: 300, ...at(1) })).toBe(snapshot);
  });

  test("the same event twice is the same lesson", () => {
    const event: ChannelEvent = { type: "student.joined", student: joined("a"), ...at(2) };
    const once = applyConsoleEvent(base(), event);
    expect(applyConsoleEvent(once, event)).toEqual(once);
  });
});

describe("what an event does to the class view", () => {
  const base: ClassViewSnapshot = {
    server_now: "2026-10-29T08:31:00.000Z",
    session: { id: "s1", state: "lobby", lesson_title: "T", class_name: "II-4", subject_name: "Математика", joined_count: 3, recent: ["Ана", "Бојан"] },
    join: { token: "t1", short_code: "111111", valid_to: "2026-10-29T08:31:30.000Z" },
    question: null,
    progress: null,
    reveal: null,
    skipped: false,
    board: [],
    review: null,
  };
  const at = (seconds: number) => ({ channel: "session.s1.class" as const, server_now: new Date(Date.parse(base.server_now) + seconds * 1000).toISOString() });

  test("the count and the last names are what joined.count says; with no names, the ones it had stay", () => {
    expect(applyClassEvent(base, { type: "joined.count", joined_count: 4, recent: ["Давид", "Ана"], ...at(1) }).session).toMatchObject({ joined_count: 4, recent: ["Давид", "Ана"] });
    expect(applyClassEvent(base, { type: "joined.count", joined_count: 4, ...at(1) }).session).toMatchObject({ joined_count: 4, recent: ["Ана", "Бојан"] });
  });

  test("a new code, a new state, and nothing that is for the console", () => {
    expect(applyClassEvent(base, { type: "join_token.rotated", token: "t2", short_code: "222222", valid_to: "2026-10-29T08:32:00.000Z", ...at(30) }).join?.token).toBe("t2");
    expect(applyClassEvent(base, { type: "state.changed", state: "teaching", ...at(2) }).session.state).toBe("teaching");
    expect(applyClassEvent(base, { type: "student.joined", student: joined("x"), ...at(1) })).toBe(base);
  });
});

describe("the last names", () => {
  test("the last five to join, newest first, and nobody who has not joined", () => {
    const s = [
      joined("1", "2026-10-29T08:31:01.000Z"),
      joined("2", "2026-10-29T08:31:02.000Z"),
      student("x"),
      student("m", { attendance: "present_no_device", no_device_reason: "battery" }),
      joined("3", "2026-10-29T08:31:03.000Z"),
      joined("4", "2026-10-29T08:31:04.000Z"),
      joined("5", "2026-10-29T08:31:05.000Z"),
      joined("6", "2026-10-29T08:31:06.000Z"),
    ];
    expect(recentNames(s)).toEqual(["Ученик 6", "Ученик 5", "Ученик 4", "Ученик 3", "Ученик 2"]);
  });
});
