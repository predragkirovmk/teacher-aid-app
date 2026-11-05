import { hasJoined, recentNames, TOKEN_ROTATE_MS } from "../live";
import { hashSeed, rng } from "./mock-data";
import type { MockMark } from "./mock-state";
import type { ChannelEvent, ClassViewSnapshot, ConsoleSnapshot, ConsoleStudent, JoinToken, TeacherChannel } from "./types";

/**
 * A believable class, played by the demo from the clock alone. There is no worker in the browser, so a lesson that has been started is
 * a promise about time, the way a draft's job is (mock-drafts.ts): who has joined, who joined late, who lost the connection and
 * what the code is are all worked out from when the lesson began, when the teacher moved it on, what the teacher marked, and what time
 * it is. Two windows of the same browser read the same saved lesson and the same clock, so they agree without talking to each other, and
 * a reload or a window opened afterwards finds the class where the clock has put it. Everything here takes `now`, so a test moves time
 * by giving another one.
 *
 * What the class does, for the same lesson every time (it is seeded by the session's id):
 * - 70 to 85 percent of the class joins during the first minute or so, at an uneven pace: a few at once, then gaps;
 * - one or two students join after the teacher has begun the lesson, a few seconds after, so they are late;
 * - one student who has joined loses the connection for a while and comes back;
 * - the rest never join: they are the ones the teacher may mark present without a phone.
 */

/** The first students join within seconds; the early ones are all in within this long. */
export const LOBBY_FILL_MS = 70_000;

/** When a student who will join does so, and when their connection is lost. Students who never join have no plan. */
export type ClassPlan = {
  id: string;
  /** "early": this long after the lesson began. "late": this long after the teacher moved it to teaching, so after the lobby. */
  kind: "early" | "late";
  after_ms: number;
  /** The connection is lost from the first moment to the second, both counted from the start of the lesson. Null: never. */
  off: { from_ms: number; to_ms: number } | null;
};

const round100 = (ms: number) => Math.round(ms / 100) * 100;

/** The plan for a class: who joins when, by the session's id and the roster's ids. The same input always gives the same plan. */
export function planClass(sessionId: string, studentIds: readonly string[]): ClassPlan[] {
  const r = rng(`${sessionId}/class`);
  const order = [...studentIds];
  // A seeded shuffle: who joins early is not the top of the register.
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const n = order.length;
  const early = Math.round(n * (0.7 + r() * 0.15));
  const lateCount = n >= 10 ? 1 + Math.floor(r() * 2) : 0;

  // Uneven: the square of a random number puts more of the joins at the start, and a second pass pulls some in pairs.
  const offsets = Array.from({ length: early }, () => 2000 + (LOBBY_FILL_MS - 2000) * Math.pow(r(), 1.7)).sort((a, b) => a - b);
  for (let i = 1; i < offsets.length; i += 3) offsets[i] = Math.min(offsets[i], offsets[i - 1] + 400 + r() * 1200);
  offsets.sort((a, b) => a - b);

  const plans: ClassPlan[] = order.slice(0, early).map((id, i) => ({ id, kind: "early", after_ms: round100(offsets[i]), off: null }));
  for (let k = 0; k < lateCount; k++) {
    plans.push({ id: order[early + k], kind: "late", after_ms: round100(4000 + k * 5000 + r() * 4000), off: null });
  }
  // One student who has joined loses the connection for a while: one who joined in the first half minute, so it is seen.
  const candidates = plans.filter((p) => p.kind === "early" && p.after_ms >= 8000 && p.after_ms <= 40_000);
  if (candidates.length > 0) {
    const chosen = candidates[Math.floor(r() * candidates.length)];
    const from = chosen.after_ms + round100(10_000 + r() * 8000);
    chosen.off = { from_ms: from, to_ms: from + round100(15_000 + r() * 10_000) };
  }
  return plans;
}

/** The lesson as the simulation needs it: when it began, when it was moved on from the lobby (null while it is in it), and now. */
export type SimInput = { started_at: number; teaching_at: number | null; now: number };

export type Sim = {
  /** When the student joined, or null if they have not yet. */
  joined_at: number | null;
  late: boolean;
  online: boolean;
};

/** One student at `now`. A student with no plan never joins. A late one joins only once the teacher has begun the lesson. */
export function simulate(plan: ClassPlan | undefined, { started_at, teaching_at, now }: SimInput): Sim {
  if (!plan) return { joined_at: null, late: false, online: false };
  const at = plan.kind === "early" ? started_at + plan.after_ms : teaching_at === null ? null : teaching_at + plan.after_ms;
  if (at === null || at > now) return { joined_at: null, late: false, online: false };
  const away = plan.off !== null && now >= started_at + plan.off.from_ms && now < started_at + plan.off.to_ms;
  // A join after the lobby is late (BR-JOIN-04): even an early student whose time came after the teacher moved on.
  return { joined_at: at, late: teaching_at !== null && at > teaching_at, online: !away };
}

/**
 * The students of the class as the console shows them. A join with a phone is the record that stands: a student whom the teacher marked
 * present without a phone and who then joins is present (or late), and the mark and its reason are gone from them (the reversal rule). A
 * mark is shown only while the student has not joined.
 */
export function consoleStudents(
  roster: readonly { id: string; full_name: string }[],
  plans: readonly ClassPlan[],
  marks: readonly MockMark[],
  input: SimInput,
): ConsoleStudent[] {
  const byId = new Map(plans.map((p) => [p.id, p]));
  const marked = new Map(marks.map((m) => [m.student_id, m]));
  return roster.map((student) => {
    const sim = simulate(byId.get(student.id), input);
    const mark = marked.get(student.id);
    const joined = sim.joined_at !== null;
    return {
      id: student.id,
      full_name: student.full_name,
      attendance: joined ? (sim.late ? "late" : "present") : mark ? "present_no_device" : null,
      joined_at: joined ? new Date(sim.joined_at as number).toISOString() : null,
      no_device_reason: !joined && mark ? mark.reason : null,
      online: sim.online,
      answer_state: null,
      focus_flags: 0,
      points: 0,
    };
  });
}

/** Whether the student has joined with a phone at `now`, which is what stops the teacher marking them. */
export const hasJoinedAt = (plan: ClassPlan | undefined, input: SimInput): boolean => simulate(plan, input).joined_at !== null;

// ---- The code -----------------------------------------------------------------------------------------

/**
 * The token and short code for the 30-second window `now` falls in, on the server's clock. The token is opaque and safe in an address
 * (the student app's path takes letters, digits and hyphens); the short code is six digits, which are the easiest to read out to a room
 * and to type on a phone. The window is the same for everyone who asks, so two windows show the same code.
 */
export function tokenAt(sessionId: string, now: number): JoinToken {
  const slot = Math.floor(now / TOKEN_ROTATE_MS);
  const seed = hashSeed(`${sessionId}/${slot}`);
  const second = hashSeed(`${slot}/${sessionId}/code`);
  return {
    token: `j${seed.toString(36)}${second.toString(36)}`,
    short_code: String(100_000 + (second % 900_000)),
    valid_to: new Date((slot + 1) * TOKEN_ROTATE_MS).toISOString(),
  };
}

// ---- The snapshots and the events ---------------------------------------------------------------------

/** The class view's snapshot from the console's: only what the projector may show, and no name of a student who is not here (BR-PRIV-01). */
export function classViewOf(c: ConsoleSnapshot): ClassViewSnapshot {
  return {
    server_now: c.server_now,
    session: {
      id: c.session.id,
      state: c.session.state,
      lesson_title: c.session.lesson.title,
      class_name: c.session.class_name,
      subject_name: c.session.subject_name,
      joined_count: c.students.filter(hasJoined).length,
      recent: recentNames(c.students),
    },
    join: c.join,
    question: null,
    progress: null,
    reveal: null,
    skipped: false,
    board: [],
    review: null,
  };
}

const CLASS_CHANNELS = (channel: TeacherChannel) => channel.endsWith(".class") || channel.endsWith(".console");

/**
 * The events a stream carries between two snapshots of the same lesson, for the channel asked for: public events on every channel, the
 * join token on the class view's and the console's, who joined and who lost the connection on the console's alone (11.2).
 */
export function eventsBetween(prev: ConsoleSnapshot, next: ConsoleSnapshot, channel: TeacherChannel): ChannelEvent[] {
  const at = { channel, server_now: next.server_now };
  const out: ChannelEvent[] = [];
  if (next.session.state !== prev.session.state) out.push({ type: "state.changed", state: next.session.state, ...at });

  const was = prev.students.filter(hasJoined).length;
  const now = next.students.filter(hasJoined).length;
  const recent = recentNames(next.students);
  if (now !== was || recent.join("|") !== recentNames(prev.students).join("|")) out.push({ type: "joined.count", joined_count: now, recent, ...at });

  if (CLASS_CHANNELS(channel) && next.join && next.join.token !== prev.join?.token) {
    out.push({ type: "join_token.rotated", token: next.join.token, short_code: next.join.short_code, valid_to: next.join.valid_to, ...at });
  }

  if (channel.endsWith(".console")) {
    const before = new Map(prev.students.map((s) => [s.id, s]));
    for (const s of next.students) {
      const old = before.get(s.id);
      if (!old) continue;
      if (hasJoined(s) && !hasJoined(old)) out.push({ type: "student.joined", student: s, ...at });
      else if (hasJoined(s) && s.online !== old.online) out.push({ type: "student.presence", student_id: s.id, online: s.online, ...at });
    }
  }
  return out;
}
