import { describe, expect, test } from "vitest";
import { classViewOf, consoleStudents, eventsBetween, LOBBY_FILL_MS, planClass, simulate, tokenAt, type ClassPlan } from "@/lib/teacher/api/mock-live";
import type { ConsoleSnapshot } from "@/lib/teacher/api/types";
import { TOKEN_ROTATE_MS } from "@/lib/teacher/live";

const T0 = Date.UTC(2026, 9, 29, 8, 0, 0);
const ids = (n: number) => Array.from({ length: n }, (_, i) => `st-${String(i + 1).padStart(2, "0")}`);
const roster = (n: number) => ids(n).map((id) => ({ id, full_name: `Ученик ${id}` }));

describe("the class the demo plays", () => {
  test("the same lesson always has the same class", () => {
    expect(planClass("s-n1", ids(26))).toEqual(planClass("s-n1", ids(26)));
    expect(planClass("s-n1", ids(26))).not.toEqual(planClass("s-n2", ids(26)));
  });

  test("70 to 85 percent join in the lobby, whatever the lesson, and one or two join after it", () => {
    for (let k = 1; k <= 40; k++) {
      const plans = planClass(`s-n${k}`, ids(26));
      const early = plans.filter((p) => p.kind === "early");
      const late = plans.filter((p) => p.kind === "late");
      expect(early.length, `s-n${k}`).toBeGreaterThanOrEqual(Math.round(26 * 0.7));
      expect(early.length, `s-n${k}`).toBeLessThanOrEqual(Math.round(26 * 0.85));
      expect(late.length, `s-n${k}`).toBeGreaterThanOrEqual(1);
      expect(late.length, `s-n${k}`).toBeLessThanOrEqual(2);
      // Nobody twice, and some of the class never comes: those are for the teacher to mark.
      expect(new Set(plans.map((p) => p.id)).size).toBe(plans.length);
      expect(plans.length).toBeLessThan(26);
    }
  });

  test("they join at an uneven pace within about a minute, the first within seconds", () => {
    const early = planClass("s-n1", ids(26)).filter((p) => p.kind === "early").map((p) => p.after_ms).sort((a, b) => a - b);
    expect(early[0]).toBeGreaterThanOrEqual(2000);
    expect(early[0]).toBeLessThan(15_000);
    expect(early.at(-1)).toBeLessThanOrEqual(LOBBY_FILL_MS);
    const gaps = early.slice(1).map((v, i) => v - early[i]);
    expect(new Set(gaps).size).toBeGreaterThan(5);
    expect(Math.max(...gaps)).toBeGreaterThan(2 * Math.min(...gaps.filter((g) => g > 0)));
  });

  test("one student who has joined loses the connection for a while and comes back", () => {
    for (let k = 1; k <= 40; k++) {
      const plans = planClass(`s-n${k}`, ids(26));
      const away = plans.filter((p) => p.off);
      expect(away.length, `s-n${k}`).toBe(1);
      const { from_ms, to_ms } = away[0].off!;
      expect(from_ms).toBeGreaterThan(away[0].after_ms);
      expect(to_ms - from_ms).toBeGreaterThanOrEqual(15_000);
    }
  });

  test("a very small class has no late joiners to speak of and still has a plan", () => {
    const plans = planClass("s-n1", ids(5));
    expect(plans.filter((p) => p.kind === "late")).toHaveLength(0);
    expect(plans.length).toBeGreaterThan(0);
  });
});

describe("one student, from the clock", () => {
  const early: ClassPlan = { id: "a", kind: "early", after_ms: 10_000, off: { from_ms: 20_000, to_ms: 35_000 } };
  const late: ClassPlan = { id: "b", kind: "late", after_ms: 6000, off: null };
  const input = (now: number, teaching_at: number | null = null) => ({ started_at: T0, teaching_at, now });

  test("not here before their time, here from it", () => {
    expect(simulate(early, input(T0 + 9999)).joined_at).toBeNull();
    expect(simulate(early, input(T0 + 10_000))).toEqual({ joined_at: T0 + 10_000, late: false, online: true });
  });

  test("the connection is lost for a while and comes back", () => {
    expect(simulate(early, input(T0 + 19_999)).online).toBe(true);
    expect(simulate(early, input(T0 + 20_000)).online).toBe(false);
    expect(simulate(early, input(T0 + 34_999)).online).toBe(false);
    expect(simulate(early, input(T0 + 35_000)).online).toBe(true);
  });

  test("a student who never comes has no plan, and is never here", () => {
    expect(simulate(undefined, input(T0 + 600_000))).toEqual({ joined_at: null, late: false, online: false });
  });

  test("a late student comes only once the teacher has begun the lesson, a few seconds after, and is late", () => {
    expect(simulate(late, input(T0 + 600_000)).joined_at).toBeNull();
    const began = T0 + 40_000;
    expect(simulate(late, input(began + 5999, began)).joined_at).toBeNull();
    expect(simulate(late, input(began + 6000, began))).toEqual({ joined_at: began + 6000, late: true, online: true });
  });

  test("an early student whose time comes after the lobby is over is late too (BR-JOIN-04)", () => {
    const began = T0 + 5000;
    expect(simulate(early, input(T0 + 10_000, began))).toMatchObject({ late: true });
    // One who was in before it is not.
    expect(simulate(early, input(T0 + 10_000, T0 + 10_001))).toMatchObject({ late: false });
  });
});

describe("the console's students", () => {
  const plans: ClassPlan[] = [
    { id: "st-01", kind: "early", after_ms: 10_000, off: null },
    { id: "st-02", kind: "early", after_ms: 50_000, off: null },
  ];
  const at = (seconds: number, marks: Parameters<typeof consoleStudents>[2] = [], teaching: number | null = null) =>
    consoleStudents(roster(4), plans, marks, { started_at: T0, teaching_at: teaching, now: T0 + seconds * 1000 });

  test("everyone of the class is listed, joined or not, in the register's order", () => {
    const s = at(0);
    expect(s.map((x) => x.id)).toEqual(ids(4));
    expect(s.every((x) => x.attendance === null && !x.online)).toBe(true);
  });

  test("a student who joined is present with the time; one who joined after the lobby is late", () => {
    expect(at(10)[0]).toMatchObject({ attendance: "present", online: true, joined_at: new Date(T0 + 10_000).toISOString() });
    expect(at(60, [], T0 + 30_000)[1]).toMatchObject({ attendance: "late" });
    expect(at(60, [], T0 + 30_000)[0]).toMatchObject({ attendance: "present" });
  });

  test("a student marked present without a phone is shown so, with the reason, and is not online", () => {
    const marks = [{ student_id: "st-03", reason: "battery" as const, at: new Date(T0 + 5000).toISOString() }];
    expect(at(20, marks)[2]).toMatchObject({ attendance: "present_no_device", no_device_reason: "battery", joined_at: null, online: false });
  });

  test("a student marked who then joins with a phone becomes present, and the reason goes (the reversal rule)", () => {
    const marks = [{ student_id: "st-02", reason: "no_phone" as const, at: new Date(T0 + 20_000).toISOString() }];
    expect(at(30, marks)[1]).toMatchObject({ attendance: "present_no_device", no_device_reason: "no_phone" });
    expect(at(50, marks)[1]).toMatchObject({ attendance: "present", no_device_reason: null, online: true });
    expect(at(60, marks, T0 + 40_000)[1]).toMatchObject({ attendance: "late", no_device_reason: null });
  });
});

describe("the code", () => {
  test("is the same for every window in the same 30 seconds, and changes at the edge", () => {
    const edge = Math.ceil(T0 / TOKEN_ROTATE_MS) * TOKEN_ROTATE_MS;
    const a = tokenAt("s-n1", edge - 20_000);
    const b = tokenAt("s-n1", edge - 1);
    const c = tokenAt("s-n1", edge);
    expect(b).toEqual(a);
    expect(c.token).not.toBe(b.token);
    expect(c.short_code).not.toBe(b.short_code);
    expect(a.valid_to).toBe(new Date(edge).toISOString());
    expect(c.valid_to).toBe(new Date(edge + TOKEN_ROTATE_MS).toISOString());
  });

  test("the token is safe in an address and the short code is six digits", () => {
    for (let i = 0; i < 50; i++) {
      const t = tokenAt(`s-n${i}`, T0 + i * TOKEN_ROTATE_MS);
      expect(t.token).toMatch(/^[A-Za-z0-9-]{8,}$/);
      expect(t.short_code).toMatch(/^[1-9]\d{5}$/);
    }
  });

  test("another lesson has another code", () => {
    expect(tokenAt("s-n1", T0).token).not.toBe(tokenAt("s-n2", T0).token);
  });
});

describe("the snapshots and events", () => {
  const snapshot = (seconds: number, teaching = false): ConsoleSnapshot => {
    const plans = planClass("s-n1", ids(10));
    const now = T0 + seconds * 1000;
    return {
      server_now: new Date(now).toISOString(),
      session: { id: "s-n1", course_id: "c", lesson: { id: "l", title: "Проценти", version: 1 }, state: teaching ? "teaching" : "lobby", started_at: new Date(T0).toISOString(), ended_at: null, class_name: "II-4", subject_name: "Математика" },
      join: tokenAt("s-n1", now),
      questions: [],
      students: consoleStudents(roster(10), plans, [], { started_at: T0, teaching_at: teaching ? T0 + 40_000 : null, now }),
      anon_questions: [],
      focus_flags: [],
      board: [],
      nudge: false,
    };
  };

  test("the class view holds no student who is not here, no name but the last five joined, and nothing of the console (BR-PRIV-01)", () => {
    const c = snapshot(30);
    const view = classViewOf(c);
    const text = JSON.stringify(view);
    const here = c.students.filter((s) => s.attendance === "present");
    const absent = c.students.filter((s) => s.attendance === null);
    expect(absent.length).toBeGreaterThan(0);
    for (const s of absent) expect(text).not.toContain(s.full_name);
    expect(view.session.joined_count).toBe(here.length);
    expect(view.session.recent.length).toBeLessThanOrEqual(5);
    for (const name of view.session.recent) expect(here.map((s) => s.full_name)).toContain(name);
    for (const key of ["students", "anon_questions", "focus_flags", "answer_state", "no_device_reason"]) expect(text).not.toContain(`"${key}"`);
    expect(view.join).toEqual(c.join);
  });

  test("the events between two moments: who joined, the new count, the new code", () => {
    const events = eventsBetween(snapshot(0), snapshot(45), "session.s-n1.console");
    const types = events.map((e) => e.type);
    expect(types).toContain("joined.count");
    expect(types).toContain("student.joined");
    expect(types).toContain("join_token.rotated");
    const count = events.find((e) => e.type === "joined.count");
    expect(count).toMatchObject({ channel: "session.s-n1.console", joined_count: snapshot(45).students.filter((s) => s.attendance).length });
    expect(events.filter((e) => e.type === "student.joined")).toHaveLength(snapshot(45).students.filter((s) => s.attendance).length);
  });

  test("the class channel has the count and the code and no student", () => {
    const types = eventsBetween(snapshot(0), snapshot(45), "session.s-n1.class").map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["joined.count", "join_token.rotated"]));
    expect(types).not.toContain("student.joined");
    expect(types).not.toContain("student.presence");
  });

  test("the public channel, which students read, has no code and no student", () => {
    const types = eventsBetween(snapshot(0), snapshot(45), "session.s-n1.public").map((e) => e.type);
    expect(types).toContain("joined.count");
    expect(types).not.toContain("join_token.rotated");
    expect(types).not.toContain("student.joined");
  });

  test("a change of state is an event on every channel, and nothing happening is no event", () => {
    expect(eventsBetween(snapshot(45), snapshot(45, true), "session.s-n1.public").map((e) => e.type)).toContain("state.changed");
    expect(eventsBetween(snapshot(45), snapshot(45), "session.s-n1.console")).toEqual([]);
  });

  test("a student who loses the connection and comes back is told on the console", () => {
    const plans = planClass("s-n1", ids(10));
    const away = plans.find((p) => p.off)!;
    const during = T0 + away.off!.from_ms + 1000;
    const build = (now: number): ConsoleSnapshot => ({ ...snapshot(0), server_now: new Date(now).toISOString(), students: consoleStudents(roster(10), plans, [], { started_at: T0, teaching_at: null, now }) });
    const gone = eventsBetween(build(during - 2000), build(during), "session.s-n1.console").filter((e) => e.type === "student.presence");
    expect(gone).toEqual([expect.objectContaining({ student_id: away.id, online: false })]);
    const back = T0 + away.off!.to_ms;
    const returned = eventsBetween(build(back - 1000), build(back), "session.s-n1.console").filter((e) => e.type === "student.presence");
    expect(returned).toEqual([expect.objectContaining({ student_id: away.id, online: true })]);
  });
});
