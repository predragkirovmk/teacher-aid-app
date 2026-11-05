import { nudgeIdle } from "../questions";
import { isCorrect, rankRows, scoreAnswer } from "../scoring";
import { hasJoined } from "../live";
import { rng } from "./mock-data";
import { simulate, type ClassPlan, type SimInput } from "./mock-live";
import type {
  AnonQuestionItem,
  ConsoleQuestion,
  ConsoleSnapshot,
  ConsoleStudent,
  FocusFlag,
  LeaderboardRow,
  Question,
  RevealCounts,
} from "./types";

/**
 * The questions of a lesson, played by the demo from the clock alone, like the class itself (mock-live.ts). What the teacher did is saved: when each
 * question was sent, skipped or had its answer shown. What the class does is not: who answers, how fast, who is right, who leaves the app for a moment,
 * who loses the connection and who writes to the teacher are all worked out from the session's id, the question and the clock, so the same lesson plays
 * the same way every time, two windows agree without talking, and a test that moves the clock knows what the class is doing.
 *
 * What the class does with a question:
 * - most of the students who had joined answer, at different speeds (some at once, most in the middle, a few at the end), and most of them rightly, some not;
 * - one or two who had joined never answer;
 * - one student loses the connection during the question and does not answer;
 * - now and then a student leaves the app for a few seconds (the focus flag);
 * - a question closes by its own time, or sooner when every student who is there and online has answered (BR-TIME-04).
 * Points follow scoring.ts: 10 for a right answer and up to 5 for speed, 0 for a wrong or missing one.
 */

/** A question of the lesson, with what the teacher did with it. Times are milliseconds. */
export type QuestionRun = {
  id: string;
  question: Question;
  adhoc: boolean;
  fired_at: number | null;
  skipped_at: number | null;
  revealed_at: number | null;
};

export type PlayInput = {
  sessionId: string;
  roster: readonly { id: string; full_name: string }[];
  plans: readonly ClassPlan[];
  sim: SimInput;
  speedBonusOn: boolean;
};

export type PlayedAnswer = { student_id: string; response: string; answered_at: number; correct: boolean; points: number; speed_bonus: number };
export type PlayedFlag = { student_id: string; lost_at: number; back_at: number };

/** What the class does with one question that was sent. Independent of the time of day: only of when the question was sent. */
export type Play = {
  joined: number;
  answers: PlayedAnswer[];
  /** The student who loses the connection during the question, and for how long. */
  away: { student_id: string; from: number; to: number } | null;
  flags: PlayedFlag[];
  /** When the question really ended: its time, or sooner if everyone there had answered. */
  ended_at: number;
  planned_end: number;
};

const round100 = (ms: number) => Math.round(ms / 100) * 100;

const memo = new Map<string, Play>();

const planFor = (input: PlayInput) => new Map(input.plans.map((p) => [p.id, p]));

/** The class's play with a question. */
export function playOf(run: QuestionRun, input: PlayInput): Play {
  const fired = run.fired_at as number;
  const key = `${input.sessionId}|${run.id}|${fired}|${input.sim.teaching_at}|${input.speedBonusOn}|${input.roster.length}`;
  const held = memo.get(key);
  if (held) return held;

  const q = run.question;
  const dur = q.timer_seconds * 1000;
  const planned = fired + dur;
  const plans = planFor(input);
  const at = (id: string, now: number) => simulate(plans.get(id), { ...input.sim, now });
  const r = rng(`${input.sessionId}/${run.id}/play`);

  // Who had joined when the question was sent (a student who joins afterwards cannot answer it).
  const there = input.roster.filter((s) => at(s.id, fired).joined_at !== null);
  // The ones who stay connected throughout: only they can be the ones who never answer, or the one who loses the connection on purpose.
  const steady = there.filter((s) => at(s.id, fired).online && at(s.id, planned).online && at(s.id, fired + dur / 2).online);
  const shuffled = [...steady];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const silentCount = there.length >= 5 ? Math.max(1, Math.round(there.length * 0.12)) : 0;
  const silent = new Set(shuffled.slice(0, silentCount).map((s) => s.id));
  const awayStudent = r() < 0.75 ? shuffled[silentCount] : undefined;
  const from = fired + round100(dur * (0.3 + 0.2 * r()));
  const away = awayStudent ? { student_id: awayStudent.id, from, to: Math.min(planned, from + round100(dur * (0.3 + 0.2 * r()))) } : null;

  const pRight = 0.55 + r() * 0.35;
  const answers: PlayedAnswer[] = [];
  for (const s of there) {
    if (silent.has(s.id) || s.id === away?.student_id) continue;
    const rs = rng(`${input.sessionId}/${run.id}/${s.id}`);
    const answeredAt = fired + round100(dur * (0.08 + 0.8 * Math.pow(rs(), 1.4)));
    // A student whose own connection is down when they would have answered does not.
    if (!at(s.id, answeredAt).online) continue;
    const wantRight = rs() < pRight;
    let response = answerFor(q, wantRight, rs);
    if (isCorrect(q, response) !== wantRight) response = answerFor(q, wantRight, rs, true);
    const correct = isCorrect(q, response);
    const score = scoreAnswer({ correct, remainingMs: planned - answeredAt, durationMs: dur, speedBonusOn: input.speedBonusOn });
    answers.push({ student_id: s.id, response, answered_at: answeredAt, correct, points: score.points, speed_bonus: score.speed_bonus });
  }
  answers.sort((a, b) => a.answered_at - b.answered_at || a.student_id.localeCompare(b.student_id));

  // BR-TIME-04: closed as soon as everyone who is there and online has answered.
  let ended = planned;
  const given = new Map<string, number>();
  for (const a of answers) {
    given.set(a.student_id, a.answered_at);
    const present = input.roster.filter((s) => {
      const sim = at(s.id, a.answered_at);
      return sim.joined_at !== null && sim.online && !(away && s.id === away.student_id && a.answered_at >= away.from && a.answered_at < away.to);
    });
    if (present.length > 0 && present.every((s) => (given.get(s.id) ?? Infinity) <= a.answered_at)) {
      ended = Math.min(ended, a.answered_at);
      break;
    }
  }

  // A student leaves the app for a few seconds: one or two times in a question, a little more than a third of the questions none.
  const flags: PlayedFlag[] = [];
  const nf = r() < 0.35 ? 0 : r() < 0.75 ? 1 : 2;
  for (let k = 0; k < nf && there.length > 0; k++) {
    const s = there[Math.floor(r() * there.length)];
    const lost = fired + round100(dur * (0.1 + 0.6 * r()));
    flags.push({ student_id: s.id, lost_at: lost, back_at: lost + round100(3000 + r() * 9000) });
  }

  const play: Play = { joined: there.length, answers: answers.filter((a) => a.answered_at <= ended), away, flags, ended_at: ended, planned_end: planned };
  memo.set(key, play);
  return play;
}

/** A response of the kind the question takes, right or wrong. `again` tries the other way of being wrong, for the rare response that came out the other way. */
function answerFor(q: Question, right: boolean, r: () => number, again = false): string {
  if (q.kind === "true_false") return right ? q.correct : q.correct === "true" ? "false" : "true";
  if (q.kind === "multiple_choice") {
    if (right) return q.correct;
    const wrong = q.options.map((_, i) => String(i)).filter((i) => i !== q.correct);
    return wrong[Math.floor(r() * wrong.length)];
  }
  const correct = Number(q.correct);
  if (right) return String(Math.round((correct + (again ? 0 : (r() * 2 - 1) * q.tolerance)) * 1e4) / 1e4);
  const step = q.tolerance + (1 + Math.floor(r() * 3)) * Math.max(1, Math.abs(correct) * 0.1);
  let wrong = correct + (r() < 0.5 ? step : -step);
  if (wrong < 0 && !q.allow_negative) wrong = correct + step;
  return String(Math.round(wrong * 1e4) / 1e4);
}

// ---- What the console shows ---------------------------------------------------------------------------------------

export type Shown = {
  questions: ConsoleQuestion[];
  /** The plays of the questions that were sent, by session question id. */
  plays: Map<string, Play>;
  board: LeaderboardRow[];
  flags: FocusFlag[];
};

const iso = (ms: number) => new Date(ms).toISOString();

function countsOf(play: Play, question: Question, upTo: number): RevealCounts {
  const given = play.answers.filter((a) => a.answered_at <= upTo);
  const by: Record<string, number> = {};
  if (question.kind !== "numeric") for (const a of given) by[a.response] = (by[a.response] ?? 0) + 1;
  const right = given.filter((a) => a.correct).length;
  return { by_response: by, right, wrong: given.length - right, unanswered: Math.max(0, play.joined - given.length) };
}

/** The questions of the lesson as the console has them at `now`, with the board and the focus flags that follow from them. */
export function showQuestions(runs: readonly QuestionRun[], input: PlayInput, now: number): Shown {
  const plays = new Map<string, Play>();
  const questions: ConsoleQuestion[] = runs.map((run): ConsoleQuestion => {
    const skipped = run.skipped_at !== null && run.skipped_at <= now;
    const base = { id: run.id, question: run.question, adhoc: run.adhoc, closed_at: null, revealed_at: null, skipped_at: skipped ? iso(run.skipped_at as number) : null } as const;
    if (run.fired_at === null || run.fired_at > now) {
      return { ...base, status: skipped ? "skipped" : "ready", fired_at: null, closes_at: null, answered: 0, joined: 0, counts: null };
    }
    const play = playOf(run, input);
    plays.set(run.id, play);
    const over = now >= play.ended_at;
    const revealed = !skipped && run.revealed_at !== null && run.revealed_at <= now;
    const status = skipped ? "skipped" : revealed ? "revealed" : over ? "closed" : "open";
    const upTo = Math.min(now, play.ended_at);
    return {
      ...base,
      status,
      fired_at: iso(run.fired_at),
      closes_at: iso(over ? play.ended_at : play.planned_end),
      closed_at: over && !skipped ? iso(play.ended_at) : null,
      revealed_at: revealed ? iso(run.revealed_at as number) : null,
      answered: skipped ? 0 : play.answers.filter((a) => a.answered_at <= upTo).length,
      joined: play.joined,
      counts: !skipped && over ? countsOf(play, run.question, play.ended_at) : null,
    };
  });

  // The session ranking: everyone who has joined, by the points of the questions that have closed and were not skipped (BR-PTS-09).
  const points = new Map<string, number>();
  let anyClosed = false;
  for (const q of questions) {
    if (q.status !== "closed" && q.status !== "revealed") continue;
    anyClosed = true;
    for (const a of (plays.get(q.id) as Play).answers) points.set(a.student_id, (points.get(a.student_id) ?? 0) + a.points);
  }
  const plansById = planFor(input);
  const joined = input.roster.filter((s) => simulate(plansById.get(s.id), { ...input.sim, now }).joined_at !== null);
  const board = anyClosed ? rankRows(joined.map((s) => ({ student_id: s.id, name: s.full_name, points: points.get(s.id) ?? 0 }))) : [];

  const flags: FocusFlag[] = [];
  for (const q of questions) {
    const play = plays.get(q.id);
    if (!play || q.status === "skipped") continue;
    for (const f of play.flags) {
      if (f.lost_at > now) continue;
      flags.push({ student_id: f.student_id, session_question_id: q.id, lost_at: iso(f.lost_at), back_at: f.back_at <= now ? iso(f.back_at) : null });
    }
  }
  return { questions, plays, board, flags };
}

/** The students as the console shows them once the questions are known: points, the state of the open question, the flags, and the connection that was lost. */
export function withQuestions(students: ConsoleStudent[], shown: Shown, now: number): ConsoleStudent[] {
  const open = shown.questions.find((q) => q.status === "open");
  const play = open ? shown.plays.get(open.id) : undefined;
  const points = new Map(shown.board.map((b) => [b.student_id, b.points]));
  return students.map((s) => {
    const away = play?.away && play.away.student_id === s.id && now >= play.away.from && now < play.away.to;
    const online = s.online && !away;
    const answered = !!play && play.answers.some((a) => a.student_id === s.id && a.answered_at <= now);
    return {
      ...s,
      online,
      points: points.get(s.id) ?? 0,
      focus_flags: shown.flags.filter((f) => f.student_id === s.id).length,
      answer_state: !open || !hasJoined(s) ? null : answered ? "answered" : online ? "not_answered" : "offline",
    };
  });
}

// ---- The anonymous questions ------------------------------------------------------------------------------------

const ANON_TEXTS = [
  "Можете ли уште еднаш да го објасните последниот пример?",
  "Дали ова ќе го има на контролната?",
  "Може ли да ни дадете уште еден пример?",
  "Не го разбрав третиот чекор. Може ли пак?",
  "Колку време имаме за домашната задача?",
  "Може ли да ја видиме формулата уште еднаш?",
];

/**
 * The questions the class writes to the teacher: two or three in a lesson, a little after it begins teaching, each from a student who has joined by
 * then. Not saved: the same lesson writes the same questions. `answered` is what the teacher marked, by id.
 */
export function anonQuestions(
  sessionId: string,
  roster: readonly { id: string; full_name: string }[],
  plans: readonly ClassPlan[],
  sim: SimInput,
  answered: Readonly<Record<string, string>>,
  now: number,
): AnonQuestionItem[] {
  if (sim.teaching_at === null) return [];
  const r = rng(`${sessionId}/anon`);
  const count = 2 + (r() < 0.5 ? 1 : 0);
  const texts = [...ANON_TEXTS].sort(() => r() - 0.5);
  const byId = new Map(plans.map((p) => [p.id, p]));
  const out: AnonQuestionItem[] = [];
  for (let k = 0; k < count; k++) {
    const at = sim.teaching_at + round100(20_000 + k * 40_000 + r() * 8000);
    if (at > now) break;
    const here = roster.filter((s) => simulate(byId.get(s.id), { ...sim, now: at }).joined_at !== null);
    if (here.length === 0) continue;
    const sender = here[Math.floor(r() * here.length)];
    const id = `${sessionId}-aq${k + 1}`;
    out.push({ id, text: texts[k], sender: { id: sender.id, name: sender.full_name }, created_at: iso(at), answered_at: answered[id] ?? null });
  }
  return out;
}

// ---- The nudge --------------------------------------------------------------------------------------------------------

/** The demo's own wait before the console says a lesson has gone quiet: short, so that it can be seen. The product's is `NUDGE_AFTER_SECONDS` (questions.ts). */
export const DEMO_NUDGE_AFTER_MS = 90_000;

/** The nudge at `now`: set when the lesson is teaching and has gone quiet. */
export function nudgeAt(snapshot: Pick<ConsoleSnapshot, "questions" | "session">, teachingAt: number | null, now: number, afterMs: number): ConsoleSnapshot["nudge"] {
  const qs = snapshot.questions;
  let since = teachingAt ?? now;
  for (const q of qs) {
    for (const t of [q.fired_at, q.revealed_at, q.skipped_at]) if (t) since = Math.max(since, Date.parse(t));
  }
  const idle = nudgeIdle({
    teaching: snapshot.session.state === "teaching",
    busy: qs.some((q) => q.status === "open" || q.status === "closed"),
    unsent: qs.some((q) => !q.adhoc && q.status === "ready"),
    idleSince: since,
    now,
    afterMs,
  });
  return idle === null ? null : { idle_seconds: idle };
}
