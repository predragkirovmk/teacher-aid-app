import type { BoardRow, Id, OpenerPhase, QuestionProgress, SessionQuestion, SessionState, SessionSummary, StudentStage } from "../api/types";
import { toServer } from "./clock";
import { RESULT_WAIT_MS, VERDICT_AFTER_REVEAL_MS, VERDICT_MAX_MS, VERDICT_MS, undelivered, votingOpen, type EngineState } from "./engine";

/**
 * What the quiz screen draws at one moment: the engine's state read at a local time. The stage is
 * section 4.4's table, with the two gaps the table does not name (before the first snapshot, and the
 * moment between a question closing and the student's result arriving). Times are server times; the
 * phone's clock only says how long it has been since the server last spoke.
 */
/** What the quiz screen needs of an opener (spec 4.3) beyond what every question has. */
export type OpenerView = {
  kind: "prediction" | "debate";
  /** Where the class is: the later of what the clocks say and what the server last told. */
  phase: OpenerPhase;
  /** The vote can still be given. */
  votingOpen: boolean;
  reasonMax: number;
  /** The class's votes, once voting has closed and the server has sent them; else null. They line up with the options, or are [agree, disagree]. */
  votes: number[] | null;
  /** The anonymous reasons the server has sent (FR-OPN-03). */
  reasons: string[];
  /** The student's own reason, and where it has got to. */
  reason: string | null;
  reasonAnswer: "none" | "sending" | "saved" | "sent" | "late";
  reasonSkipped: boolean;
  /** What the vote and the reason were worth, once the result is in. */
  votePoints: number;
  reasonPoints: number;
};

export type SessionView = {
  stage: StudentStage;
  sessionId: Id;
  sessionState: SessionState | null;
  title: string | null;
  questionCount: number | null;
  joined: number;
  /** Names of the last few to join, newest first (the lobby's faces). */
  recent: string[];
  late: boolean;

  question: SessionQuestion | null;
  /** Whether this is the last question the lesson has. */
  last: boolean;
  /** What the student answered, in the question's response format; null when they have not. */
  picked: string | null;
  /**
   * Where the student's answer has got to: `sending`, `saved` (on the phone, waiting for the connection),
   * `sent` (the server has it), or `late` (it reached the server after the question closed, so it did not count).
   */
  answer: "none" | "sending" | "saved" | "sent" | "late";
  /** The question's length, how much of it is gone, and the whole seconds left, all on the server's clock. */
  duration: number;
  elapsed: number;
  secondsLeft: number;
  progress: QuestionProgress | null;
  /** The question was skipped by the teacher and does not count (BR-SKIP-01). */
  skipped: boolean;
  /** Set when the question is an opener. */
  opener: OpenerView | null;

  /** Null for a debate, which has no right side. */
  correct: boolean | null;
  /** Points for the question, speed bonus included, and the bonus alone. */
  gain: number;
  bonus: number;
  correctAnswer: string | null;
  explanation: string | null;

  points: number;
  rank: number | null;
  rankBefore: number | null;
  board: BoardRow[] | null;
  meId: Id;
  summary: SessionSummary | null;
};

/** When the verdict (right or wrong) stops being the screen, in local time; null when there is none to show. */
export function verdictEnd(s: EngineState): number | null {
  const r = s.result;
  if (!r || s.resultAt === null) return null;
  const base = s.resultAt + VERDICT_MS;
  if (r.correct) return base;
  const cap = s.resultAt + VERDICT_MAX_MS;
  // A wrong answer is worth reading: it waits for the teacher's reveal and a moment after it.
  if (r.correctAnswer === null) return cap;
  if (s.reveal && s.reveal.id === r.sessionQuestionId) return Math.min(cap, Math.max(base, s.reveal.at + VERDICT_AFTER_REVEAL_MS));
  return base;
}

export function stageOf(s: EngineState, now: number): StudentStage {
  const session = s.session;
  if (!session) return "syncing";
  if (session.state === "ended") return "ended";
  const q = s.question;
  if (!q) return session.state === "lobby" ? "waiting_start" : "waiting_next";
  const server = toServer(s.clock, now);
  if (q.opener) return openerStage(s, q, server);
  switch (q.status) {
    case "open":
      if (q.closesAt !== null && server >= q.closesAt) return "waiting_result";
      return s.mine ? "waiting_others" : "answering";
    case "closed":
    case "revealed": {
      // The student's answer has not reached the server: whatever it says about them cannot be told yet (BR-NET-01 may still count it).
      if (undelivered(s.mine)) return "waiting_result";
      const end = verdictEnd(s);
      if (s.result) return end !== null && now < end ? (s.result.correct ? "right" : "wrong") : "waiting_next";
      // Closed and no result yet: it is on its way, for a while.
      return q.closesAt !== null && server - q.closesAt > RESULT_WAIT_MS ? "waiting_next" : "waiting_result";
    }
    default:
      return "waiting_next";
  }
}

/** The student's place in an opener: vote, then a reason, then the wait for the class and the result. */
function openerStage(s: EngineState, q: SessionQuestion, server: number): StudentStage {
  switch (q.status) {
    case "open":
      if (q.closesAt !== null && server >= q.closesAt) return "opener_wait";
      if (!s.mine) return votingOpen(s, server) ? "voting" : "opener_wait";
      if (s.mine.status === "late") return "opener_wait";
      return s.reason || s.reasonSkipped ? "opener_wait" : "reasoning";
    case "closed":
    case "revealed":
      // Something the student gave has not reached the server: whatever it says about them cannot be told yet (BR-NET-01 may still count it).
      if (undelivered(s.mine) || undelivered(s.reason)) return "opener_wait";
      if (s.result || q.status === "revealed") return "opener_result";
      return q.closesAt !== null && server - q.closesAt > RESULT_WAIT_MS ? "opener_result" : "opener_wait";
    default:
      return "waiting_next";
  }
}

/** The clock the student is working against: voting until the vote closes, then the reason until the question ends. */
function windowOf(s: EngineState, q: SessionQuestion): { start: number | null; end: number | null } {
  if (q.opener) return s.mine ? { start: s.mine.at || q.firedAt, end: q.closesAt } : { start: q.firedAt, end: q.opener.voteClosesAt };
  return { start: q.firedAt, end: q.closesAt };
}

const NO_REASONS: string[] = [];

function openerView(s: EngineState, q: SessionQuestion, server: number): OpenerView {
  const o = q.opener!;
  const known = s.opener?.id === q.id ? s.opener : null;
  const byClock: OpenerPhase = q.status === "revealed" ? "revealed" : q.status !== "open" || server >= o.voteClosesAt ? "reasoning" : "voting";
  const order = ["voting", "reasoning", "revealed"];
  const phase = known && order.indexOf(known.phase) > order.indexOf(byClock) ? known.phase : byClock;
  const r = s.result && s.result.sessionQuestionId === q.id ? s.result : null;
  return {
    kind: q.kind === "opener_debate" ? "debate" : "prediction",
    phase,
    votingOpen: votingOpen(s, server),
    reasonMax: o.reasonMax,
    // The class's votes are for after voting: the server may send them live, but the student sees them once it has closed.
    votes: phase === "voting" ? null : (known?.votes ?? null),
    reasons: known?.reasons ?? NO_REASONS,
    reason: s.reason && s.reason.status !== "late" ? s.reason.response : null,
    reasonAnswer: s.reason ? s.reason.status : "none",
    reasonSkipped: s.reasonSkipped,
    votePoints: r ? r.points - r.reasonPoints : 0,
    reasonPoints: r?.reasonPoints ?? 0,
  };
}

export function viewOf(s: EngineState, now: number): SessionView {
  const q = s.question;
  const server = toServer(s.clock, now);
  const win = q ? windowOf(s, q) : { start: null, end: null };
  const duration = q ? (win.end !== null && win.start !== null ? win.end - win.start : q.timerSeconds * 1000) : 0;
  const elapsed = q && win.start !== null ? Math.min(duration, Math.max(0, server - win.start)) : 0;
  const secondsLeft = q ? (win.end !== null ? Math.max(0, Math.ceil((win.end - server) / 1000)) : q.timerSeconds) : 0;
  const r = s.result;
  return {
    stage: stageOf(s, now),
    sessionId: s.sessionId,
    sessionState: s.session?.state ?? null,
    title: s.session?.lessonTitle ?? null,
    questionCount: s.session?.questionCount ?? null,
    joined: s.session?.joinedCount ?? 0,
    recent: s.recent,
    late: s.late,
    question: q,
    last: !!q && q.index + 1 >= q.total,
    picked: s.mine && s.mine.status !== "late" ? s.mine.response : null,
    answer: s.mine ? s.mine.status : "none",
    duration,
    elapsed,
    secondsLeft,
    progress: s.progress,
    skipped: q?.status === "skipped",
    opener: q?.opener ? openerView(s, q, server) : null,
    correct: r ? r.correct : false,
    gain: r?.points ?? 0,
    bonus: r?.speedBonus ?? 0,
    correctAnswer: r?.correctAnswer ?? (s.reveal && q && s.reveal.id === q.id ? s.reveal.correctAnswer : null),
    explanation: r?.explanation ?? null,
    points: s.sessionPoints,
    rank: s.sessionRank,
    rankBefore: s.rankBefore,
    board: s.board,
    meId: s.meId,
    summary: s.summary,
  };
}

/** Whether the view changes with the passage of time alone, so something has to tick. */
export const needsTick = (stage: StudentStage) =>
  stage === "answering" ||
  stage === "waiting_others" ||
  stage === "waiting_result" ||
  stage === "right" ||
  stage === "wrong" ||
  stage === "voting" ||
  stage === "reasoning" ||
  stage === "opener_wait";

/** Two views that show the same thing. Their fields are primitives or objects that keep their identity, so a shallow compare is exact (the opener's view is rebuilt each tick, so it is compared by what it holds). */
export function sameView(a: SessionView, b: SessionView): boolean {
  const keys = Object.keys(a) as (keyof SessionView)[];
  return keys.every((k) => (k === "opener" ? sameOpener(a.opener, b.opener) : Object.is(a[k], b[k])));
}

function sameOpener(a: OpenerView | null, b: OpenerView | null): boolean {
  if (a === null || b === null) return a === b;
  const keys = Object.keys(a) as (keyof OpenerView)[];
  return keys.every((k) => Object.is(a[k], b[k]));
}
