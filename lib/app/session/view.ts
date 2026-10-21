import type { BoardRow, Id, QuestionProgress, SessionQuestion, SessionState, SessionSummary, StudentStage } from "../api/types";
import { toServer } from "./clock";
import { RESULT_WAIT_MS, VERDICT_AFTER_REVEAL_MS, VERDICT_MAX_MS, VERDICT_MS, undelivered, type EngineState } from "./engine";

/**
 * What the quiz screen draws at one moment: the engine's state read at a local time. The stage is
 * section 4.4's table, with the two gaps the table does not name (before the first snapshot, and the
 * moment between a question closing and the student's result arriving). Times are server times; the
 * phone's clock only says how long it has been since the server last spoke.
 */
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

  correct: boolean;
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

export function viewOf(s: EngineState, now: number): SessionView {
  const q = s.question;
  const server = toServer(s.clock, now);
  const duration = q ? (q.closesAt !== null && q.firedAt !== null ? q.closesAt - q.firedAt : q.timerSeconds * 1000) : 0;
  const elapsed = q && q.firedAt !== null ? Math.min(duration, Math.max(0, server - q.firedAt)) : 0;
  const secondsLeft = q ? (q.closesAt !== null ? Math.max(0, Math.ceil((q.closesAt - server) / 1000)) : q.timerSeconds) : 0;
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
    correct: r?.correct ?? false,
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
  stage === "answering" || stage === "waiting_others" || stage === "waiting_result" || stage === "right" || stage === "wrong";

/** Two views that show the same thing. Their fields are primitives or objects that keep their identity, so a shallow compare is exact. */
export function sameView(a: SessionView, b: SessionView): boolean {
  const keys = Object.keys(a) as (keyof SessionView)[];
  return keys.every((k) => Object.is(a[k], b[k]));
}
