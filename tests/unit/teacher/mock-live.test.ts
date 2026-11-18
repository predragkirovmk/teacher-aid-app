import { describe, expect, test } from "vitest";
import { classViewOf, consoleStudents, eventsBetween, LOBBY_FILL_MS, planClass, simulate, tokenAt, type ClassPlan } from "@/lib/teacher/api/mock-live";
import type { ConsoleSnapshot } from "@/lib/teacher/api/types";
import { TOKEN_ROTATE_MS } from "@/lib/teacher/live";

const T0 = Date.UTC(2026, 9, 29, 8, 0, 0);
const ids = (n: number) => Array.from({ length: n }, (_, i) => `st-${String(i + 1).padStart(2, "0")}`);
const roster = (n: number) => ids(n).map((id) => ({ id, full_name: `Ученик ${id}` }));

describe("the students the demo plays", () => {
  const early = (plans: ClassPlan[]) => plans.filter((p) => p.after_ms <= LOBBY_FILL_MS);
  const straggling = (plans: ClassPlan[]) => plans.filter((p) => p.after_ms > LOBBY_FILL_MS);

  test("the same lesson always has the same students joining", () => {
    expect(planClass("s-n1", ids(26))).toEqual(planClass("s-n1", ids(26)));
    expect(planClass("s-n1", ids(26))).not.toEqual(planClass("s-n2", ids(26)));
  });

  test("70 to 85 percent join in the first minute, whatever the lesson, and one or two come in later", () => {
    for (let k = 1; k <= 40; k++) {
      const plans = planClass(`s-n${k}`, ids(26));
      expect(early(plans).length, `s-n${k}`).toBeGreaterThanOrEqual(Math.round(26 * 0.7));
      expect(early(plans).length, `s-n${k}`).toBeLessThanOrEqual(Math.round(26 * 0.85));
      expect(straggling(plans).length, `s-n${k}`).toBeGreaterThanOrEqual(1);
      expect(straggling(plans).length, `s-n${k}`).toBeLessThanOrEqual(2);
      // Nobody twice, and some of the pool never scans the code.
      expect(new Set(plans.map((p) => p.id)).size).toBe(plans.length);
      expect(plans.length).toBeLessThan(26);
    }
  });

  test("they join at an uneven pace within about a minute, the first within seconds", () => {
    const times = early(planClass("s-n1", ids(26))).map((p) => p.after_ms).sort((a, b) => a - b);
    expect(times[0]).toBeGreaterThanOrEqual(2000);
    expect(times[0]).toBeLessThan(15_000);
    expect(times.at(-1)).toBeLessThanOrEqual(LOBBY_FILL_MS);
    const gaps = times.slice(1).map((v, i) => v - times[i]);
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

  test("a very small pool has no stragglers to speak of and still has a plan", () => {
    const plans = planClass("s-n1", ids(5));
    expect(straggling(plans)).toHaveLength(0);
    expect(plans.length).toBeGreaterThan(0);
  });
});

describe("one student, from the clock", () => {
  const plan: ClassPlan = { id: "a", after_ms: 10_000, off: { from_ms: 20_000, to_ms: 35_000 } };
  const input = (now: number, teaching_at: number | null = null) => ({ started_at: T0, teaching_at, now });

  test("not here before their time, here from it", () => {
    expect(simulate(plan, input(T0 + 9999)).joined_at).toBeNull();
    expect(simulate(plan, input(T0 + 10_000))).toEqual({ joined_at: T0 + 10_000, online: true });
  });

  test("the connection is lost for a while and comes back", () => {
    expect(simulate(plan, input(T0 + 19_999)).online).toBe(true);
    expect(simulate(plan, input(T0 + 20_000)).online).toBe(false);
    expect(simulate(plan, input(T0 + 34_999)).online).toBe(false);
    expect(simulate(plan, input(T0 + 35_000)).online).toBe(true);
  });

  test("a student who never comes has no plan, and is never here", () => {
    expect(simulate(undefined, input(T0 + 600_000))).toEqual({ joined_at: null, online: false });
  });

  test("a student may join after the teacher has begun the lesson: the join time does not depend on it, and nothing marks them late", () => {
    const began = T0 + 5000;
    const sim = simulate(plan, input(T0 + 10_000, began));
    expect(sim).toEqual({ joined_at: T0 + 10_000, online: true });
    expect(sim).not.toHaveProperty("late");
  });
});

describe("the console's students", () => {
  const plans: ClassPlan[] = [
    { id: "st-02", after_ms: 50_000, off: null },
    { id: "st-01", after_ms: 10_000, off: null },
  ];
  const at = (seconds: number) => consoleStudents(roster(4), plans, { started_at: T0, teaching_at: null, now: T0 + seconds * 1000 });

  test("nobody is listed before they join: no names, no places held for the rest of the pool", () => {
    expect(at(0)).toEqual([]);
    expect(at(9)).toEqual([]);
  });

  test("a student appears once their join time has passed, with the time, in the order they joined", () => {
    expect(at(10)).toEqual([expect.objectContaining({ id: "st-01", online: true, joined_at: new Date(T0 + 10_000).toISOString() })]);
    expect(at(60).map((s) => s.id)).toEqual(["st-01", "st-02"]);
  });

  test("a student who is not in the plan never appears, and no student carries a mark of attendance", () => {
    for (const s of at(600)) {
      expect(["st-01", "st-02"]).toContain(s.id);
      for (const key of ["attendance", "no_device_reason"]) expect(s).not.toHaveProperty(key);
    }
  });

  test("a student who has lost the connection is listed, offline", () => {
    const away: ClassPlan[] = [{ id: "st-01", after_ms: 10_000, off: { from_ms: 20_000, to_ms: 35_000 } }];
    const list = consoleStudents(roster(4), away, { started_at: T0, teaching_at: null, now: T0 + 25_000 });
    expect(list).toEqual([expect.objectContaining({ id: "st-01", online: false })]);
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
      session: { id: "s-n1", lesson: { id: "l", title: "Проценти", version: 1 }, state: teaching ? "teaching" : "lobby", started_at: new Date(T0).toISOString(), ended_at: null },
      join: tokenAt("s-n1", now),
      questions: [],
      students: consoleStudents(roster(10), plans, { started_at: T0, teaching_at: teaching ? T0 + 40_000 : null, now }),
      anon_questions: [],
      focus_flags: [],
      board: [],
      nudge: null,
    };
  };

  test("the class view holds no name but the last five joined, and nothing of the console (BR-PRIV-01)", () => {
    const c = snapshot(30);
    const view = classViewOf(c);
    const text = JSON.stringify(view);
    // Whoever has not scanned the code is not in the snapshot at all, so the projector cannot name them.
    const everyone = roster(10).map((s) => s.full_name);
    const here = c.students.map((s) => s.full_name);
    expect(here.length).toBeGreaterThan(0);
    expect(here.length).toBeLessThan(10);
    for (const name of everyone.filter((n) => !here.includes(n))) expect(text).not.toContain(name);
    expect(view.session.joined_count).toBe(here.length);
    expect(view.session.lesson_title).toBe("Проценти");
    expect(view.session).not.toHaveProperty("class_name");
    expect(view.session).not.toHaveProperty("subject_name");
    expect(view.session.recent.length).toBeLessThanOrEqual(5);
    for (const name of view.session.recent) expect(here).toContain(name);
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
    expect(count).toMatchObject({ channel: "session.s-n1.console", joined_count: snapshot(45).students.length });
    expect(events.filter((e) => e.type === "student.joined")).toHaveLength(snapshot(45).students.length);
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
    const build = (now: number): ConsoleSnapshot => ({ ...snapshot(0), server_now: new Date(now).toISOString(), students: consoleStudents(roster(10), plans, { started_at: T0, teaching_at: null, now }) });
    const gone = eventsBetween(build(during - 2000), build(during), "session.s-n1.console").filter((e) => e.type === "student.presence");
    expect(gone).toEqual([expect.objectContaining({ student_id: away.id, online: false })]);
    const back = T0 + away.off!.to_ms;
    const returned = eventsBetween(build(back - 1000), build(back), "session.s-n1.console").filter((e) => e.type === "student.presence");
    expect(returned).toEqual([expect.objectContaining({ student_id: away.id, online: true })]);
  });
});
